#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, vec, Address, BytesN, Env,
};

// Crea un token de prueba y una beca con los hitos indicados.
// mock_all_auths sirve para estudiar el flujo, NO verifica firmas reales.
fn setup(amounts: &[i128], deadlines: &[u64]) -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let verifier = Address::generate(&env);
    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin).address();
    token::StellarAssetClient::new(&env, &token_id).mint(&donor, &1_000);

    let mut inputs = soroban_sdk::Vec::new(&env);
    for (amount, deadline) in amounts.iter().zip(deadlines.iter()) {
        inputs.push_back(MilestoneInput {
            amount: *amount,
            deadline_timestamp: *deadline,
        });
    }

    let contract_id = env.register(
        AidRelease,
        (
            donor.clone(),
            beneficiary.clone(),
            verifier.clone(),
            token_id.clone(),
            inputs,
        ),
    );
    (env, contract_id, donor, beneficiary, verifier, token_id)
}

#[test]
fn test_crear_beca() {
    let env = Env::default();
    env.mock_all_auths();
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let verifier = Address::generate(&env);
    let token = Address::generate(&env);
    let now = env.ledger().timestamp();
    let inputs = vec![
        &env,
        MilestoneInput { amount: 100, deadline_timestamp: now + 1000 },
        MilestoneInput { amount: 200, deadline_timestamp: now + 2000 },
        MilestoneInput { amount: 300, deadline_timestamp: now + 3000 },
    ];
    let contract_id = env.register(AidRelease, (donor.clone(), beneficiary.clone(), verifier.clone(), token.clone(), inputs));
    let client = AidReleaseClient::new(&env, &contract_id);
    let scholarship = client.get_scholarship();
    assert_eq!(scholarship.donor, donor);
    assert_eq!(scholarship.beneficiary, beneficiary);
    assert_eq!(scholarship.verifier, verifier);
    assert_eq!(scholarship.token, token);
    assert_eq!(scholarship.total_amount, 600);
    assert_eq!(scholarship.paid_amount, 0);
    assert_eq!(scholarship.refunded_amount, 0);
    assert_eq!(scholarship.status, ScholarshipStatus::Unfunded);
    assert_eq!(scholarship.next_milestone_id, 0);
    assert_eq!(client.get_milestones().len(), 3);
    assert_eq!(client.get_milestone(&0).status, MilestoneStatus::Pending);
}

#[test]
fn test_financiar_beca() {
    let (env, contract_id, donor, _, _, token_id) = setup(&[100, 200], &[100, 200]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    assert_eq!(token_client.balance(&donor), 1000);
    client.fund();
    assert_eq!(client.get_scholarship().status, ScholarshipStatus::Active);
    assert_eq!(token_client.balance(&donor), 700);
    assert_eq!(token_client.balance(&contract_id), 300);
    assert!(client.try_fund().is_err());
}

#[test]
fn test_pago_hito_y_contabilidad() {
    let (env, contract_id, donor, beneficiary, _, token_id) = setup(&[100, 200], &[100, 200]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    client.fund();
    let evidence = BytesN::from_array(&env, &[7; 32]);
    client.approve_milestone(&0, &evidence);

    let info = client.get_scholarship();
    assert_eq!(info.status, ScholarshipStatus::Active);
    assert_eq!(info.paid_amount, 100);
    assert_eq!(info.next_milestone_id, 1);
    assert_eq!(client.get_milestone(&0).status, MilestoneStatus::Paid);
    assert_eq!(client.get_milestone(&0).evidence_hash, Some(evidence));
    assert_eq!(token_client.balance(&beneficiary), 100);
    assert_eq!(token_client.balance(&contract_id), 200);
    assert_eq!(token_client.balance(&donor), 700);
}

#[test]
fn test_orden_y_pago_duplicado() {
    let (env, contract_id, _, beneficiary, _, token_id) = setup(&[100, 200, 300], &[100, 200, 300]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    let evidence = BytesN::from_array(&env, &[9; 32]);
    client.fund();
    assert!(client.try_approve_milestone(&1, &evidence).is_err());
    assert_eq!(token_client.balance(&beneficiary), 0);
    client.approve_milestone(&0, &evidence);
    assert!(client.try_approve_milestone(&0, &evidence).is_err());
    assert_eq!(client.get_scholarship().paid_amount, 100);
    assert_eq!(token_client.balance(&beneficiary), 100);
}

#[test]
fn test_limite_plazo_y_reembolso() {
    let (env, contract_id, donor, beneficiary, _, token_id) = setup(&[100, 200, 300], &[100, 200, 300]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    let evidence = BytesN::from_array(&env, &[3; 32]);
    client.fund();

    // Aprobar exactamente al vencimiento del primer hito está permitido.
    env.ledger().set_timestamp(100);
    client.approve_milestone(&0, &evidence);
    assert_eq!(token_client.balance(&beneficiary), 100);

    // Al segundo exacto del plazo del siguiente hito todavía no hay reembolso.
    env.ledger().set_timestamp(200);
    assert!(client.try_claim_refund().is_err());
    assert_eq!(client.get_scholarship().status, ScholarshipStatus::Active);

    // Un segundo después, se devuelven los 500 pendientes.
    env.ledger().set_timestamp(201);
    let refunded = client.claim_refund();
    assert_eq!(refunded, 500);
    let info = client.get_scholarship();
    assert_eq!(info.status, ScholarshipStatus::Refunded);
    assert_eq!(info.paid_amount, 100);
    assert_eq!(info.refunded_amount, 500);
    assert_eq!(client.get_milestone(&0).status, MilestoneStatus::Paid);
    assert_eq!(client.get_milestone(&1).status, MilestoneStatus::Expired);
    assert_eq!(client.get_milestone(&2).status, MilestoneStatus::Cancelled);
    assert_eq!(token_client.balance(&donor), 900);
    assert_eq!(token_client.balance(&beneficiary), 100);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert!(client.try_claim_refund().is_err());
}

// ============================================
// PRUEBAS ADICIONALES DE SEGURIDAD
// ============================================

#[test]
fn test_no_pagar_sin_financiar() {
    let (env, contract_id, _, beneficiary, _, token_id) =
        setup(&[100, 200], &[100, 200]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    let evidence = BytesN::from_array(&env, &[11; 32]);

    assert!(client.try_approve_milestone(&0, &evidence).is_err());
    assert_eq!(client.get_scholarship().status, ScholarshipStatus::Unfunded);
    assert_eq!(client.get_scholarship().paid_amount, 0);
    assert_eq!(client.get_milestone(&0).status, MilestoneStatus::Pending);
    assert_eq!(token_client.balance(&beneficiary), 0);
}

#[test]
fn test_hito_inexistente_no_altera_fondos() {
    let (env, contract_id, _, beneficiary, _, token_id) =
        setup(&[100, 200], &[100, 200]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    let evidence = BytesN::from_array(&env, &[12; 32]);

    client.fund();
    assert!(client.try_approve_milestone(&99, &evidence).is_err());
    assert!(client.try_get_milestone(&99).is_err());
    assert_eq!(client.get_scholarship().paid_amount, 0);
    assert_eq!(client.get_scholarship().next_milestone_id, 0);
    assert_eq!(token_client.balance(&contract_id), 300);
    assert_eq!(token_client.balance(&beneficiary), 0);
}

#[test]
fn test_beca_completada_no_admite_operaciones_adicionales() {
    let (env, contract_id, _, beneficiary, _, token_id) =
        setup(&[100, 200], &[100, 200]);
    let client = AidReleaseClient::new(&env, &contract_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    let evidence = BytesN::from_array(&env, &[13; 32]);

    client.fund();
    client.approve_milestone(&0, &evidence);
    client.approve_milestone(&1, &evidence);
    assert_eq!(client.get_scholarship().status, ScholarshipStatus::Completed);
    assert_eq!(client.get_scholarship().paid_amount, 300);
    assert_eq!(token_client.balance(&beneficiary), 300);
    assert_eq!(token_client.balance(&contract_id), 0);

    assert!(client.try_approve_milestone(&1, &evidence).is_err());
    env.ledger().set_timestamp(201);
    assert!(client.try_claim_refund().is_err());
    assert_eq!(client.get_scholarship().status, ScholarshipStatus::Completed);
    assert_eq!(token_client.balance(&beneficiary), 300);
}

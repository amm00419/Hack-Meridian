#![cfg(test)]
//! Tests del contrato AidRelease (soroban-sdk 28).
//!
//! ESTADO: escrito contra la especificación acordada, SIN compilar todavía.
//! Cuando el contrato de la persona 1 compile, hay que ajustar solo el bloque
//! "NOMBRES SUPUESTOS" de abajo si algún nombre difiere.
//!
//! Casos del plan de pruebas que NO están aquí (se hacen aparte):
//!   - 25 (beneficiario sin trustline): solo en testnet, Fase 3.
//!   - 39 (TTL) y 40 (eventos): dependen de la API exacta de la versión; ver
//!     los TODO al final del archivo.

extern crate std;

// ---------------------------------------------------------------------------
// NOMBRES SUPUESTOS (ajustar a lo que haya escrito la persona 1)
//   Contrato:        AidRelease  (cliente generado: AidReleaseClient)
//   Entrada hito:    MilestoneInput { amount: i128, deadline_timestamp: u64 }
//   Hito:            Milestone { status: MilestoneStatus, evidence_hash: Option<BytesN<32>>, .. }
//   Beca:            Scholarship { status: ScholarshipStatus, total_amount, paid_amount,
//                                  refunded_amount: i128, next_milestone_id: u32, .. }
//   Los enums y ContractError deben derivar Debug, PartialEq (y Clone/Copy).
// ---------------------------------------------------------------------------
use crate::{
    AidRelease, AidReleaseClient, ContractError, MilestoneInput, MilestoneStatus,
    ScholarshipStatus,
};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal, Vec,
};

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const UNIT: i128 = 10_000_000; // 1 USDCDEMO = 10_000_000 unidades mínimas (7 decimales)
const T0: u64 = 1_000_000; // "ahora" al crear la beca
const DAY: u64 = 86_400;

const A1: i128 = 100 * UNIT;
const A2: i128 = 200 * UNIT;
const A3: i128 = 300 * UNIT;
const TOTAL: i128 = A1 + A2 + A3; // 600 USDCDEMO

const D1: u64 = T0 + 30 * DAY;
const D2: u64 = T0 + 60 * DAY;
const D3: u64 = T0 + 90 * DAY;

const DEFAULT_ITEMS: [(i128, u64); 3] = [(A1, D1), (A2, D2), (A3, D3)];
const DONOR_BALANCE: i128 = 1000 * UNIT;

// ---------------------------------------------------------------------------
// Token falso que falla al transferir (para probar la reversión de la transacción)
// ---------------------------------------------------------------------------
#[contract]
pub struct FailingToken;

#[contractimpl]
impl FailingToken {
    pub fn set_fail(env: Env, fail: bool) {
        env.storage().instance().set(&symbol_short!("fail"), &fail);
    }

    pub fn transfer(env: Env, _from: Address, _to: Address, _amount: i128) {
        let fail: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("fail"))
            .unwrap_or(false);
        if fail {
            panic!("transferencia fallida (token de prueba)");
        }
    }
}

// ---------------------------------------------------------------------------
// Ayudas (helpers)
// ---------------------------------------------------------------------------
struct Fixture {
    env: Env,
    id: Address,
    donor: Address,
    beneficiary: Address,
    verifier: Address,
    token: Address,
}

impl Fixture {
    fn client(&self) -> AidReleaseClient<'_> {
        AidReleaseClient::new(&self.env, &self.id)
    }
    fn token_client(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.token)
    }
    fn set_time(&self, ts: u64) {
        self.env.ledger().with_mut(|li| li.timestamp = ts);
    }
    fn contract_balance(&self) -> i128 {
        self.token_client().balance(&self.id)
    }
    fn evidence(&self, n: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[n; 32])
    }
    fn approve(&self, milestone_id: u32) {
        self.client()
            .approve_milestone(&milestone_id, &self.evidence(milestone_id as u8 + 1));
    }
    /// El dinero que queda en el contrato coincide con la contabilidad interna.
    fn assert_conservation(&self) {
        let s = self.client().get_scholarship();
        assert_eq!(
            self.contract_balance(),
            s.total_amount - s.paid_amount - s.refunded_amount
        );
    }
}

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = T0);
    env
}

fn new_sac(env: &Env) -> Address {
    let issuer = Address::generate(env);
    env.register_stellar_asset_contract_v2(issuer).address()
}

fn milestones(env: &Env, items: &[(i128, u64)]) -> Vec<MilestoneInput> {
    let mut v = Vec::new(env);
    for (amount, deadline) in items {
        v.push_back(MilestoneInput {
            amount: *amount,
            deadline_timestamp: *deadline,
        });
    }
    v
}

fn deploy(
    env: &Env,
    donor: &Address,
    beneficiary: &Address,
    verifier: &Address,
    token: &Address,
    items: &[(i128, u64)],
) -> Address {
    env.register(
        AidRelease,
        (
            donor.clone(),
            beneficiary.clone(),
            verifier.clone(),
            token.clone(),
            milestones(env, items),
        ),
    )
}

/// Beca sin financiar con token real simulado (SAC) y donante con saldo.
fn setup_with(items: &[(i128, u64)], donor_balance: i128) -> Fixture {
    let env = new_env();
    let token = new_sac(&env);
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let verifier = Address::generate(&env);
    if donor_balance > 0 {
        StellarAssetClient::new(&env, &token).mint(&donor, &donor_balance);
    }
    let id = deploy(&env, &donor, &beneficiary, &verifier, &token, items);
    Fixture { env, id, donor, beneficiary, verifier, token }
}

fn setup() -> Fixture {
    setup_with(&DEFAULT_ITEMS, DONOR_BALANCE)
}

fn setup_funded() -> Fixture {
    let f = setup();
    f.client().fund();
    f
}

/// Beca con un token falso que se puede hacer fallar con `set_fail(true)`.
fn setup_failing_token() -> (Fixture, FailingTokenClient<'static>) {
    let env = new_env();
    let token = env.register(FailingToken, ());
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let verifier = Address::generate(&env);
    let id = deploy(&env, &donor, &beneficiary, &verifier, &token, &DEFAULT_ITEMS);
    let failing = FailingTokenClient::new(&env, &token);
    (Fixture { env, id, donor, beneficiary, verifier, token }, failing)
}

// ===========================================================================
// CONSTRUCTOR (casos 1 a 9)
// Los errores de validación abortan con panic_with_error!, por eso se prueban
// con should_panic y el código de error: "Error(Contract, #N)".
// ===========================================================================

// Caso 1
#[test]
fn caso_01_crear_beca_valida_con_un_hito() {
    let f = setup_with(&[(A1, D1)], DONOR_BALANCE);
    let s = f.client().get_scholarship();
    assert_eq!(s.status, ScholarshipStatus::Unfunded);
    assert_eq!(s.total_amount, A1);
    assert_eq!(s.paid_amount, 0);
    assert_eq!(s.refunded_amount, 0);
    assert_eq!(s.next_milestone_id, 0);
    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Pending);
}

// Caso 2
#[test]
fn caso_02_crear_beca_valida_con_diez_hitos() {
    let mut items = std::vec::Vec::new();
    for i in 0..10u64 {
        items.push((UNIT, T0 + (i + 1) * DAY));
    }
    let f = setup_with(&items, DONOR_BALANCE);
    assert_eq!(f.client().get_milestones().len(), 10);
    assert_eq!(f.client().get_scholarship().total_amount, 10 * UNIT);
}

// Caso 3 (tres combinaciones de roles repetidos)
#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn caso_03a_roles_donante_igual_beneficiario() {
    let env = new_env();
    let token = new_sac(&env);
    let a = Address::generate(&env);
    let v = Address::generate(&env);
    deploy(&env, &a, &a, &v, &token, &DEFAULT_ITEMS);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn caso_03b_roles_donante_igual_verificador() {
    let env = new_env();
    let token = new_sac(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    deploy(&env, &a, &b, &a, &token, &DEFAULT_ITEMS);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn caso_03c_roles_beneficiario_igual_verificador() {
    let env = new_env();
    let token = new_sac(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    deploy(&env, &a, &b, &b, &token, &DEFAULT_ITEMS);
}

// Caso 4
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn caso_04_cero_hitos() {
    setup_with(&[], DONOR_BALANCE);
}

// Caso 5
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn caso_05_once_hitos() {
    let mut items = std::vec::Vec::new();
    for i in 0..11u64 {
        items.push((UNIT, T0 + (i + 1) * DAY));
    }
    setup_with(&items, DONOR_BALANCE);
}

// Caso 6
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn caso_06a_importe_cero() {
    setup_with(&[(0, D1)], DONOR_BALANCE);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn caso_06b_importe_negativo() {
    setup_with(&[(-1, D1)], DONOR_BALANCE);
}

// Caso 7
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn caso_07a_fechas_no_crecientes() {
    setup_with(&[(A1, D2), (A2, D1)], DONOR_BALANCE);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn caso_07b_fechas_iguales() {
    setup_with(&[(A1, D1), (A2, D1)], DONOR_BALANCE);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn caso_07c_fecha_en_el_pasado() {
    setup_with(&[(A1, T0 - 1)], DONOR_BALANCE);
}

// Caso 8
#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn caso_08_importes_que_desbordan() {
    setup_with(&[(i128::MAX, D1), (1, D2)], DONOR_BALANCE);
}

// Caso 9: el constructor exige la firma del donante.
// (Comprobación sobre las autorizaciones registradas; si `register` no las
//  registra en esta versión, se cambia por una prueba con despliegue del WASM.)
#[test]
fn caso_09_el_constructor_exige_firma_del_donante() {
    let f = setup();
    let auths = f.env.auths();
    assert!(!auths.is_empty());
    assert!(auths.iter().any(|(addr, _)| *addr == f.donor));
}

// ===========================================================================
// fund() (casos 10 a 13)
// ===========================================================================

// Caso 10
#[test]
fn caso_10_financiar_la_beca() {
    let f = setup();
    f.client().fund();
    assert_eq!(f.client().get_scholarship().status, ScholarshipStatus::Active);
    assert_eq!(f.contract_balance(), TOTAL);
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE - TOTAL);
    f.assert_conservation();
}

// Caso 11
#[test]
fn caso_11_financiar_dos_veces() {
    let f = setup_funded();
    assert_eq!(f.client().try_fund(), Err(Ok(ContractError::AlreadyFunded)));
    assert_eq!(f.contract_balance(), TOTAL); // no se cobró dos veces
}

// Caso 12: solo el donante firma fund()
#[test]
fn caso_12_financiar_solo_requiere_firma_del_donante() {
    let f = setup();
    f.client().fund();
    let auths = f.env.auths();
    assert!(!auths.is_empty());
    assert!(auths.iter().all(|(addr, _)| *addr == f.donor));
}

// Caso 13
#[test]
fn caso_13_financiar_sin_saldo_suficiente() {
    let f = setup_with(&DEFAULT_ITEMS, 10 * UNIT);
    assert!(f.client().try_fund().is_err());
    assert_eq!(f.client().get_scholarship().status, ScholarshipStatus::Unfunded);
    assert_eq!(f.contract_balance(), 0);
}

// ===========================================================================
// approve_milestone() (casos 14 a 24)
// ===========================================================================

// Caso 14
#[test]
fn caso_14_aprobar_primer_hito_a_tiempo() {
    let f = setup_funded();
    f.set_time(D1 - DAY);
    let ev = f.evidence(7);
    f.client().approve_milestone(&0, &ev);

    assert_eq!(f.token_client().balance(&f.beneficiary), A1);
    assert_eq!(f.contract_balance(), TOTAL - A1);

    let m = f.client().get_milestone(&0);
    assert_eq!(m.status, MilestoneStatus::Paid);
    assert_eq!(m.evidence_hash, Some(ev));

    let s = f.client().get_scholarship();
    assert_eq!(s.paid_amount, A1);
    assert_eq!(s.next_milestone_id, 1);
    assert_eq!(s.status, ScholarshipStatus::Active);
    f.assert_conservation();
}

// Caso 15
#[test]
fn caso_15_aprobar_sin_financiar() {
    let f = setup();
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::NotFunded))
    );
}

// Caso 16: solo el verificador firma approve_milestone()
#[test]
fn caso_16a_aprobar_solo_requiere_firma_del_verificador() {
    let f = setup_funded();
    f.approve(0);
    let auths = f.env.auths();
    assert!(!auths.is_empty());
    assert!(auths.iter().all(|(addr, _)| *addr == f.verifier));
}

// Firma de otra persona: debe fallar por autorización.
// (Usa mock_auths; si en esta versión no sustituye a mock_all_auths, ajustar.)
#[test]
#[should_panic]
fn caso_16b_aprobar_con_firma_de_otra_persona() {
    let f = setup_funded();
    let intruso = Address::generate(&f.env);
    let ev = f.evidence(1);
    f.env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "approve_milestone",
            args: (0u32, ev.clone()).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    f.client().approve_milestone(&0, &ev);
}

// Caso 17
#[test]
fn caso_17_aprobar_hito_inexistente() {
    let f = setup_funded();
    assert_eq!(
        f.client().try_approve_milestone(&99, &f.evidence(1)),
        Err(Ok(ContractError::InvalidMilestoneId))
    );
}

// Caso 18
#[test]
fn caso_18_aprobar_saltandose_el_orden() {
    let f = setup_funded();
    assert_eq!(
        f.client().try_approve_milestone(&1, &f.evidence(1)),
        Err(Ok(ContractError::WrongMilestoneOrder))
    );
}

// Caso 19
#[test]
fn caso_19_aprobar_dos_veces_el_mismo_hito() {
    let f = setup_funded();
    f.approve(0);
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(9)),
        Err(Ok(ContractError::MilestoneNotPending))
    );
    assert_eq!(f.token_client().balance(&f.beneficiary), A1); // no cobró dos veces
}

// Caso 20
#[test]
fn caso_20_aprobar_hito_vencido() {
    let f = setup_funded();
    f.set_time(D1 + 1);
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::MilestoneExpired))
    );
    assert_eq!(f.token_client().balance(&f.beneficiary), 0);
}

// Caso 21: justo en el límite (now == deadline) SÍ se puede aprobar
#[test]
fn caso_21_aprobar_justo_en_el_limite() {
    let f = setup_funded();
    f.set_time(D1);
    f.approve(0);
    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Paid);
}

// Caso 22
#[test]
fn caso_22_aprobar_todos_los_hitos_en_orden() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    f.approve(0);
    f.approve(1);
    f.approve(2);

    let s = f.client().get_scholarship();
    assert_eq!(s.status, ScholarshipStatus::Completed);
    assert_eq!(s.paid_amount, TOTAL);
    assert_eq!(f.contract_balance(), 0);
    assert_eq!(f.token_client().balance(&f.beneficiary), TOTAL);
}

// Caso 23
#[test]
fn caso_23_aprobar_despues_de_un_reembolso() {
    let f = setup_funded();
    f.set_time(D1 + 1);
    f.client().claim_refund();
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::ScholarshipClosed))
    );
}

// Caso 24: si falla el pago, la transacción se revierte entera
#[test]
fn caso_24_fallo_en_la_transferencia_revierte_todo() {
    let (f, failing) = setup_failing_token();
    f.client().fund();
    failing.set_fail(&true);
    f.set_time(T0 + 1);

    assert!(f.client().try_approve_milestone(&0, &f.evidence(1)).is_err());

    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Pending);
    let s = f.client().get_scholarship();
    assert_eq!(s.paid_amount, 0);
    assert_eq!(s.next_milestone_id, 0);
    assert_eq!(s.status, ScholarshipStatus::Active);
}

// Caso 25: beneficiario sin trustline -> solo en testnet (Fase 3).

// ===========================================================================
// claim_refund() (casos 26 a 34)
// ===========================================================================

// Caso 26
#[test]
fn caso_26_reembolso_tras_vencer_el_siguiente_hito() {
    let f = setup_funded();
    f.set_time(D1 + 1);
    let devuelto = f.client().claim_refund();

    assert_eq!(devuelto, TOTAL);
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE);
    assert_eq!(f.contract_balance(), 0);

    let s = f.client().get_scholarship();
    assert_eq!(s.status, ScholarshipStatus::Refunded);
    assert_eq!(s.refunded_amount, TOTAL);

    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Expired);
    assert_eq!(f.client().get_milestone(&1).status, MilestoneStatus::Cancelled);
    assert_eq!(f.client().get_milestone(&2).status, MilestoneStatus::Cancelled);
}

// Caso 27: justo en el límite (now == deadline) NO se puede reembolsar
#[test]
fn caso_27_reembolso_justo_en_el_limite() {
    let f = setup_funded();
    f.set_time(D1);
    assert_eq!(
        f.client().try_claim_refund(),
        Err(Ok(ContractError::RefundNotAvailable))
    );
}

// Caso 28
#[test]
fn caso_28_reembolso_antes_del_vencimiento() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    assert_eq!(
        f.client().try_claim_refund(),
        Err(Ok(ContractError::RefundNotAvailable))
    );
}

// Caso 29: solo el donante firma claim_refund()
#[test]
fn caso_29_reembolso_solo_requiere_firma_del_donante() {
    let f = setup_funded();
    f.set_time(D1 + 1);
    f.client().claim_refund();
    let auths = f.env.auths();
    assert!(!auths.is_empty());
    assert!(auths.iter().all(|(addr, _)| *addr == f.donor));
}

// Caso 30
#[test]
fn caso_30_reembolso_sin_financiar() {
    let f = setup();
    f.set_time(D1 + 1);
    assert_eq!(f.client().try_claim_refund(), Err(Ok(ContractError::NotFunded)));
}

// Caso 31
#[test]
fn caso_31_reembolso_con_hitos_ya_pagados() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    f.approve(0); // se paga A1
    f.set_time(D2 + 1); // vence el hito 1
    let devuelto = f.client().claim_refund();

    assert_eq!(devuelto, A2 + A3);
    assert_eq!(f.token_client().balance(&f.beneficiary), A1); // el pago es definitivo
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE - A1);

    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Paid);
    assert_eq!(f.client().get_milestone(&1).status, MilestoneStatus::Expired);
    assert_eq!(f.client().get_milestone(&2).status, MilestoneStatus::Cancelled);

    let s = f.client().get_scholarship();
    assert_eq!(s.paid_amount, A1);
    assert_eq!(s.refunded_amount, A2 + A3);
    assert_eq!(f.contract_balance(), 0);
}

// Caso 32
#[test]
fn caso_32_reembolso_dos_veces() {
    let f = setup_funded();
    f.set_time(D1 + 1);
    f.client().claim_refund();
    assert_eq!(
        f.client().try_claim_refund(),
        Err(Ok(ContractError::ScholarshipClosed))
    );
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE); // no cobró dos veces
}

// Caso 33
#[test]
fn caso_33_reembolso_con_todos_los_hitos_pagados() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    f.approve(0);
    f.approve(1);
    f.approve(2);
    f.set_time(D3 + 1);
    assert_eq!(
        f.client().try_claim_refund(),
        Err(Ok(ContractError::ScholarshipClosed))
    );
}

// Caso 34: tokens enviados por error al contrato no se reembolsan
#[test]
fn caso_34_tokens_enviados_por_error_no_se_reembolsan() {
    let f = setup_funded();
    let extra = 50 * UNIT;
    StellarAssetClient::new(&f.env, &f.token).mint(&f.id, &extra);

    f.set_time(D1 + 1);
    let devuelto = f.client().claim_refund();

    assert_eq!(devuelto, TOTAL); // solo la contabilidad interna
    assert_eq!(f.contract_balance(), extra); // el extra queda bloqueado (limitación aceptada)
}

// ===========================================================================
// Consultas (casos 35 y 36)
// ===========================================================================

// Caso 35
#[test]
fn caso_35_get_milestone_inexistente() {
    let f = setup();
    assert_eq!(
        f.client().try_get_milestone(&99),
        Err(Ok(ContractError::InvalidMilestoneId))
    );
}

// Caso 36
#[test]
fn caso_36_consultas_reflejan_el_estado_real() {
    let f = setup_funded();
    let hitos = f.client().get_milestones();
    assert_eq!(hitos.len(), 3);
    for h in hitos.iter() {
        assert_eq!(h.status, MilestoneStatus::Pending);
    }
    f.set_time(T0 + 1);
    f.approve(0);
    let hitos = f.client().get_milestones();
    assert_eq!(hitos.get(0).unwrap().status, MilestoneStatus::Paid);
    assert_eq!(hitos.get(1).unwrap().status, MilestoneStatus::Pending);
    assert_eq!(f.client().get_scholarship().next_milestone_id, 1);
}

// ===========================================================================
// Otros (casos 37 y 38)
// ===========================================================================

// Caso 37: el contrato no depende de un token concreto
#[test]
fn caso_37_dos_becas_con_tokens_distintos() {
    let env = new_env();
    let token_a = new_sac(&env);
    let token_b = new_sac(&env);
    let donor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let verifier = Address::generate(&env);
    StellarAssetClient::new(&env, &token_a).mint(&donor, &DONOR_BALANCE);
    StellarAssetClient::new(&env, &token_b).mint(&donor, &DONOR_BALANCE);

    let id_a = deploy(&env, &donor, &beneficiary, &verifier, &token_a, &DEFAULT_ITEMS);
    let id_b = deploy(&env, &donor, &beneficiary, &verifier, &token_b, &DEFAULT_ITEMS);
    AidReleaseClient::new(&env, &id_a).fund();
    AidReleaseClient::new(&env, &id_b).fund();

    assert_eq!(TokenClient::new(&env, &token_a).balance(&id_a), TOTAL);
    assert_eq!(TokenClient::new(&env, &token_b).balance(&id_b), TOTAL);
    assert_eq!(TokenClient::new(&env, &token_a).balance(&id_b), 0);
    assert_eq!(TokenClient::new(&env, &token_b).balance(&id_a), 0);
}

// Caso 38: secuencia mixta y conservación del dinero en cada paso
#[test]
fn caso_38_secuencia_mixta_conserva_el_dinero() {
    let f = setup();
    f.client().fund();
    f.assert_conservation();

    f.set_time(T0 + 1);
    f.approve(0);
    f.assert_conservation();
    f.approve(1);
    f.assert_conservation();

    f.set_time(D3 + 1);
    let devuelto = f.client().claim_refund();
    assert_eq!(devuelto, A3);
    f.assert_conservation();

    let s = f.client().get_scholarship();
    assert_eq!(s.paid_amount + s.refunded_amount, s.total_amount);
    assert_eq!(f.token_client().balance(&f.beneficiary), A1 + A2);
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE - A1 - A2);
}

// ===========================================================================
// Prioridad de errores (casos 41 a 45)
// Orden en approve_milestone: auth, estado general, existencia del hito,
// estado del hito, orden secuencial, fecha límite.
// ===========================================================================

// Caso 41: beca sin financiar + hito inexistente -> NotFunded (gana el estado general)
#[test]
fn caso_41_prioridad_estado_general_antes_que_existencia() {
    let f = setup();
    assert_eq!(
        f.client().try_approve_milestone(&99, &f.evidence(1)),
        Err(Ok(ContractError::NotFunded))
    );
}

// Caso 42: beca Completed -> ScholarshipClosed antes que MilestoneNotPending
#[test]
fn caso_42_prioridad_beca_cerrada_antes_que_estado_del_hito() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    f.approve(0);
    f.approve(1);
    f.approve(2);
    assert_eq!(
        f.client().get_scholarship().status,
        ScholarshipStatus::Completed
    );
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::ScholarshipClosed))
    );
}

// Caso 43: hito ya pagado + fuera de orden + plazo vencido -> MilestoneNotPending
#[test]
fn caso_43_prioridad_estado_del_hito_antes_que_orden() {
    let f = setup_funded();
    f.set_time(T0 + 1);
    f.approve(0);
    f.set_time(D1 + 1); // el plazo del hito 0 ya pasó
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::MilestoneNotPending))
    );
}

// Caso 44: hito futuro fuera de orden con plazo vencido -> WrongMilestoneOrder
#[test]
fn caso_44_prioridad_orden_antes_que_fecha_limite() {
    let f = setup_funded();
    f.set_time(D2 + 1); // venció el hito 1 (y también el 0)
    assert_eq!(
        f.client().try_approve_milestone(&1, &f.evidence(1)),
        Err(Ok(ContractError::WrongMilestoneOrder))
    );
}

// Caso 45: si falla el reembolso, no cambia ningún estado
#[test]
fn caso_45_fallo_en_el_reembolso_revierte_todo() {
    let (f, failing) = setup_failing_token();
    f.client().fund();
    failing.set_fail(&true);
    f.set_time(D1 + 1);

    assert!(f.client().try_claim_refund().is_err());

    let s = f.client().get_scholarship();
    assert_eq!(s.status, ScholarshipStatus::Active);
    assert_eq!(s.refunded_amount, 0);
    assert_eq!(f.client().get_milestone(&0).status, MilestoneStatus::Pending);
    assert_eq!(f.client().get_milestone(&1).status, MilestoneStatus::Pending);
}

// Caso 46 (nuevo, según lib.rs): fund() ya no se puede hacer después del
// plazo del primer hito. Antes de este cambio no estaba en la especificación.
#[test]
fn caso_46_financiar_despues_del_primer_plazo() {
    let f = setup();
    f.set_time(D1 + 1);
    assert_eq!(f.client().try_fund(), Err(Ok(ContractError::MilestoneExpired)));
    assert_eq!(f.client().get_scholarship().status, ScholarshipStatus::Unfunded);
    assert_eq!(f.contract_balance(), 0);
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE);
}

// Caso 47: en el segundo exacto del primer plazo todavía se puede financiar
#[test]
fn caso_47_financiar_justo_en_el_primer_plazo() {
    let f = setup();
    f.set_time(D1);
    f.client().fund();
    assert_eq!(f.client().get_scholarship().status, ScholarshipStatus::Active);
}

// Caso 48: una beca sin financiar y con el plazo pasado queda inutilizable,
// pero no hay fondos atrapados (no se depositó nada).
#[test]
fn caso_48_beca_sin_financiar_vencida_no_atrapa_fondos() {
    let f = setup();
    f.set_time(D1 + 1);
    assert_eq!(f.client().try_claim_refund(), Err(Ok(ContractError::NotFunded)));
    assert_eq!(
        f.client().try_approve_milestone(&0, &f.evidence(1)),
        Err(Ok(ContractError::NotFunded))
    );
    assert_eq!(f.token_client().balance(&f.donor), DONOR_BALANCE);
}

// ===========================================================================
// TODO (no incluidos para no romper la compilación con APIs que varían)
//   Caso 39 (TTL): ver https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension
//   Caso 40 (eventos): comprobar con env.events() que se emiten los eventos de
//                      financiación, pago y reembolso con los datos correctos.
// ===========================================================================

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token, Address, BytesN, Env, Vec,
};

// ============================================================
// 1. ERRORES DEL CONTRATO
// ============================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    InvalidRoles = 1,
    InvalidMilestones = 2,
    InvalidAmount = 3,
    InvalidDeadline = 4,
    AlreadyFunded = 5,
    NotFunded = 6,
    InvalidMilestoneId = 7,
    WrongMilestoneOrder = 8,
    MilestoneNotPending = 9,
    MilestoneExpired = 10,
    ScholarshipClosed = 11,
    RefundNotAvailable = 12,
    ArithmeticOverflow = 13,
    InvalidToken = 14,
}

// ============================================================
// 2. ESTADOS
// ============================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScholarshipStatus {
    Unfunded,
    Active,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Pending,
    Paid,
    Expired,
    Cancelled,
}

// ============================================================
// 3. ESTRUCTURAS
// ============================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneInput {
    pub amount: i128,
    pub deadline_timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub id: u32,
    pub amount: i128,
    pub deadline_timestamp: u64,
    pub status: MilestoneStatus,
    pub evidence_hash: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Scholarship {
    pub donor: Address,
    pub beneficiary: Address,
    pub verifier: Address,
    pub token: Address,
    pub total_amount: i128,
    pub paid_amount: i128,
    pub refunded_amount: i128,
    pub status: ScholarshipStatus,
    pub next_milestone_id: u32,
}

// ============================================================
// 4. CLAVES DE ALMACENAMIENTO
// ============================================================

#[contracttype]
pub enum DataKey {
    Scholarship,
    Milestones,
}

// Mantiene vivos el almacenamiento de instancia y el codigo.
// Se ejecuta en las operaciones que modifican el contrato.
// No sustituye a una estrategia externa de renovacion para becas largas.
fn renew_ttl(env: &Env) {
    let max_ttl = env.storage().max_ttl();
    env.storage().instance().extend_ttl(max_ttl / 2, max_ttl);
}

// ============================================================
// 5. EVENTOS PUBLICOS (SOROBAN SDK 28)
// ============================================================

#[contractevent(topics = ["funded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Funded {
    #[topic]
    pub donor: Address,
    pub amount: i128,
}

#[contractevent(topics = ["milestone_paid"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestonePaid {
    #[topic]
    pub milestone_id: u32,
    pub amount: i128,
    pub evidence_hash: BytesN<32>,
}

#[contractevent(topics = ["refunded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub donor: Address,
    pub milestone_id: u32,
    pub amount: i128,
}

// ============================================================
// 6. CONTRATO AIDRELEASE
// ============================================================

#[contract]
pub struct AidRelease;

#[contractimpl]
impl AidRelease {
    /// Crea una beca validando roles, importes y fechas.
    /// El token se recibe como dirección, sin validación externa.
    pub fn __constructor(
        env: Env,
        donor: Address,
        beneficiary: Address,
        verifier: Address,
        token: Address,
        milestones: Vec<MilestoneInput>,
    ) {
        donor.require_auth();

        if donor == beneficiary || donor == verifier || beneficiary == verifier {
            panic_with_error!(&env, ContractError::InvalidRoles);
        }

        if milestones.is_empty() || milestones.len() > 10 {
            panic_with_error!(&env, ContractError::InvalidMilestones);
        }

        let now = env.ledger().timestamp();
        let mut previous_deadline = now;
        let mut total_amount: i128 = 0;
        let mut stored_milestones: Vec<Milestone> = Vec::new(&env);

        for i in 0..milestones.len() {
            let input = milestones.get(i).unwrap();

            if input.amount <= 0 {
                panic_with_error!(&env, ContractError::InvalidAmount);
            }

            if input.deadline_timestamp <= previous_deadline {
                panic_with_error!(&env, ContractError::InvalidDeadline);
            }

            total_amount = match total_amount.checked_add(input.amount) {
                Some(value) => value,
                None => panic_with_error!(&env, ContractError::ArithmeticOverflow),
            };

            stored_milestones.push_back(Milestone {
                id: i,
                amount: input.amount,
                deadline_timestamp: input.deadline_timestamp,
                status: MilestoneStatus::Pending,
                evidence_hash: None,
            });

            previous_deadline = input.deadline_timestamp;
        }

        let scholarship = Scholarship {
            donor,
            beneficiary,
            verifier,
            token,
            total_amount,
            paid_amount: 0,
            refunded_amount: 0,
            status: ScholarshipStatus::Unfunded,
            next_milestone_id: 0,
        };

        env.storage().instance().set(&DataKey::Scholarship, &scholarship);
        env.storage().instance().set(&DataKey::Milestones, &stored_milestones);
        renew_ttl(&env);
    }

    /// El donante deposita el importe íntegro de la beca.
    pub fn fund(env: Env) -> Result<(), ContractError> {
        let mut scholarship: Scholarship = env
            .storage()
            .instance()
            .get(&DataKey::Scholarship)
            .unwrap();

        scholarship.donor.require_auth();

        if scholarship.status != ScholarshipStatus::Unfunded {
            return Err(ContractError::AlreadyFunded);
        }

        let milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();

        let first = milestones.get(0).unwrap();

        if env.ledger().timestamp() > first.deadline_timestamp {
            return Err(ContractError::MilestoneExpired);
        }

        // Guardar antes de la llamada externa evita que una reentrada
        // observe la beca como no financiada.
        scholarship.status = ScholarshipStatus::Active;
        env.storage().instance().set(&DataKey::Scholarship, &scholarship);

        let token_client = token::TokenClient::new(&env, &scholarship.token);
        token_client.transfer(
            &scholarship.donor,
            &env.current_contract_address(),
            &scholarship.total_amount,
        );

        // Evento publicado unicamente cuando el deposito ha funcionado.
        Funded {
            donor: scholarship.donor.clone(),
            amount: scholarship.total_amount,
        }.publish(&env);
        renew_ttl(&env);
        Ok(())
    }

    /// El verificador aprueba exclusivamente el siguiente hito vigente.
    /// La transferencia se realiza en la misma transaccion.
    pub fn approve_milestone(
        env: Env,
        milestone_id: u32,
        evidence_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        let mut scholarship: Scholarship = env
            .storage()
            .instance()
            .get(&DataKey::Scholarship)
            .unwrap();

        scholarship.verifier.require_auth();

        if scholarship.status == ScholarshipStatus::Unfunded {
            return Err(ContractError::NotFunded);
        }
        if scholarship.status != ScholarshipStatus::Active {
            return Err(ContractError::ScholarshipClosed);
        }

        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();

        // La existencia y el estado tienen prioridad sobre el orden.
        let mut milestone = milestones
            .get(milestone_id)
            .ok_or(ContractError::InvalidMilestoneId)?;

        if milestone.status != MilestoneStatus::Pending {
            return Err(ContractError::MilestoneNotPending);
        }
        if milestone_id != scholarship.next_milestone_id {
            return Err(ContractError::WrongMilestoneOrder);
        }
        // Se permite aprobar durante el segundo exacto del vencimiento.
        if env.ledger().timestamp() > milestone.deadline_timestamp {
            return Err(ContractError::MilestoneExpired);
        }

        let new_paid_amount = scholarship
            .paid_amount
            .checked_add(milestone.amount)
            .ok_or(ContractError::ArithmeticOverflow)?;
        if new_paid_amount > scholarship.total_amount {
            return Err(ContractError::ArithmeticOverflow);
        }
        let next_id = scholarship
            .next_milestone_id
            .checked_add(1)
            .ok_or(ContractError::ArithmeticOverflow)?;

        milestone.status = MilestoneStatus::Paid;
        milestone.evidence_hash = Some(evidence_hash.clone());
        milestones.set(milestone_id, milestone.clone());

        scholarship.paid_amount = new_paid_amount;
        scholarship.next_milestone_id = next_id;
        if next_id == milestones.len() {
            scholarship.status = ScholarshipStatus::Completed;
        }

        // Actualizar antes de llamar al contrato externo del token.
        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::Scholarship, &scholarship);

        // Si falla el pago, se revierte toda la transaccion, incluidos los estados.
        let token_client = token::TokenClient::new(&env, &scholarship.token);
        token_client.transfer(
            &env.current_contract_address(),
            &scholarship.beneficiary,
            &milestone.amount,
        );

        // Datos: identificador, importe, hash de la evidencia.
        MilestonePaid {
            milestone_id,
            amount: milestone.amount,
            evidence_hash,
        }.publish(&env);
        renew_ttl(&env);
        Ok(())
    }

    /// Cuando vence el siguiente hito, el donante recupera todo lo pendiente.
    pub fn claim_refund(env: Env) -> Result<i128, ContractError> {
        let mut scholarship: Scholarship = env
            .storage()
            .instance()
            .get(&DataKey::Scholarship)
            .unwrap();

        scholarship.donor.require_auth();

        if scholarship.status == ScholarshipStatus::Unfunded {
            return Err(ContractError::NotFunded);
        }
        if scholarship.status != ScholarshipStatus::Active {
            return Err(ContractError::ScholarshipClosed);
        }

        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();
        let next_id = scholarship.next_milestone_id;
        let mut expired = milestones
            .get(next_id)
            .ok_or(ContractError::InvalidMilestoneId)?;

        // Solo se puede reembolsar DESPUES del segundo de vencimiento.
        if env.ledger().timestamp() <= expired.deadline_timestamp {
            return Err(ContractError::RefundNotAvailable);
        }
        if expired.status != MilestoneStatus::Pending {
            return Err(ContractError::MilestoneNotPending);
        }

        // Contabilidad interna: nunca utilizar el saldo total del token.
        let refund = scholarship
            .total_amount
            .checked_sub(scholarship.paid_amount)
            .and_then(|v| v.checked_sub(scholarship.refunded_amount))
            .ok_or(ContractError::ArithmeticOverflow)?;
        if refund <= 0 {
            return Err(ContractError::RefundNotAvailable);
        }

        expired.status = MilestoneStatus::Expired;
        milestones.set(next_id, expired);

        for i in (next_id + 1)..milestones.len() {
            let mut following = milestones.get(i).unwrap();
            following.status = MilestoneStatus::Cancelled;
            milestones.set(i, following);
        }

        scholarship.refunded_amount = scholarship
            .refunded_amount
            .checked_add(refund)
            .ok_or(ContractError::ArithmeticOverflow)?;
        scholarship.status = ScholarshipStatus::Refunded;

        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::Scholarship, &scholarship);

        // Si la transferencia revierte, la escritura de estados tambien revierte.
        let token_client = token::TokenClient::new(&env, &scholarship.token);
        token_client.transfer(
            &env.current_contract_address(),
            &scholarship.donor,
            &refund,
        );

        Refunded {
            donor: scholarship.donor.clone(),
            milestone_id: next_id,
            amount: refund,
        }.publish(&env);
        renew_ttl(&env);
        Ok(refund)
    }

    /// Devuelve los datos generales de la beca.
    pub fn get_scholarship(env: Env) -> Scholarship {
        env.storage()
            .instance()
            .get(&DataKey::Scholarship)
            .unwrap()
    }

    /// Devuelve un hito, o un error si el identificador no existe.
    pub fn get_milestone(
        env: Env,
        milestone_id: u32,
    ) -> Result<Milestone, ContractError> {
        let milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap();

        milestones
            .get(milestone_id)
            .ok_or(ContractError::InvalidMilestoneId)
    }

    /// Devuelve todos los hitos.
    pub fn get_milestones(env: Env) -> Vec<Milestone> {
        env.storage()
            .instance()
            .get(&DataKey::Milestones)
            .unwrap()
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod test_plan;

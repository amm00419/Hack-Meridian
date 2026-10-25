#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
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

// ============================================================
// 5. CONTRATO AIDRELEASE
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

        Ok(())
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

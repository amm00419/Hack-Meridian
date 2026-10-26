import {
  canClaimRefund,
  onChainMilestones,
  type DonorScholarship,
  type MilestoneInput,
  type MilestoneMeta,
  type Scholarship,
} from '../domain/aidrelease';
import { ServiceError, type DonorService } from './donorService';
import type { ScholarshipStore, StoredScholarship } from './scholarshipStore';

// ---------------------------------------------------------------------------
// Servicio del donante con el contrato real.
//
// Reparto de responsabilidades:
//   - La CADENA decide todo lo importante: roles, importes, plazos y estados. Cada
//     lectura de una beca sale de get_scholarship()/get_milestones().
//   - El ALMACÉN (Supabase) solo aporta los textos y se actualiza como copia.
//   - Este servicio hace comprobaciones previas para no pedir una firma que va a
//     fallar. El contrato sigue siendo la autoridad.
//
// No importa stellar.ts ni Supabase: recibe sus dependencias, así se puede probar
// sin red.
// ---------------------------------------------------------------------------

export interface TxState {
  phase: 'idle' | 'signing' | 'sending' | 'confirmed' | 'error';
  txHash?: string;
  message?: string;
}

export type OnChainScholarship = Omit<Scholarship, 'id' | 'contractId'>;

export interface DeployInput {
  beneficiary: string;
  verifier: string;
  token: string;
  milestones: MilestoneInput[];
}

/** Lo que el servicio necesita de lib/stellar.ts. */
export interface ChainApi {
  getAddress(): Promise<string | null>;
  getScholarship(contractId: string): Promise<OnChainScholarship>;
  deployScholarship(
    donor: string,
    input: DeployInput,
    onPhase?: (state: TxState) => void,
  ): Promise<{ contractId: string; txHash: string }>;
  fundScholarship(contractId: string, donor: string, onPhase?: (state: TxState) => void): Promise<string>;
  claimRefund(
    contractId: string,
    donor: string,
    onPhase?: (state: TxState) => void,
  ): Promise<{ txHash: string; refunded: bigint }>;
}

export interface ChainDonorDeps {
  chain: ChainApi;
  store: ScholarshipStore;
  /** Si se indica, solo se pueden crear becas con estos tokens (el contrato no valida el token). */
  allowedTokens?: string[];
  /** Para mostrar "firmando / enviando" en la interfaz. */
  onPhase?: (state: TxState) => void;
  now?: () => number;
}

function placeholder(index: number): MilestoneMeta {
  return { title: `Hito ${index + 1}`, description: '', approvalCriteria: [], requiredDocuments: [] };
}

function compose(stored: StoredScholarship, chain: OnChainScholarship): DonorScholarship {
  return {
    ...chain,
    id: stored.id,
    contractId: stored.contractId,
    title: stored.title,
    institution: stored.institution,
    milestoneDetails: chain.milestones.map((_, i) => stored.milestoneDetails[i] ?? placeholder(i)),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createChainDonorService(deps: ChainDonorDeps): DonorService {
  const { chain, store, allowedTokens, onPhase } = deps;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  /** La cuenta de Freighter debe ser el donante: lo que se firma tiene que coincidir con lo que se ve. */
  async function requireConnected(donor: string): Promise<void> {
    const connected = await chain.getAddress();
    if (connected !== donor) {
      throw new ServiceError('InvalidInput', 'Conecta en Freighter la cuenta del donante de esta beca.');
    }
  }

  async function findStored(id: string): Promise<StoredScholarship> {
    const stored = await store.findById(id);
    if (!stored) throw new ServiceError('NotFound', `No existe la beca ${id}.`);
    return stored;
  }

  /** Lee la cadena y comprueba que la ficha no apunta al contrato de otro donante. */
  async function readChecked(stored: StoredScholarship): Promise<OnChainScholarship> {
    const state = await chain.getScholarship(stored.contractId);
    if (state.donor !== stored.donor) {
      throw new ServiceError('InvalidInput', 'La ficha de la beca no coincide con el donante del contrato.');
    }
    return state;
  }

  return {
    async listScholarships(donor) {
      const stored = await store.listByDonor(donor);
      const settled = await Promise.allSettled(stored.map((s) => readChecked(s)));

      const result: DonorScholarship[] = [];
      settled.forEach((outcome, i) => {
        const entry = stored[i] as StoredScholarship;
        if (outcome.status === 'fulfilled') {
          result.push(compose(entry, outcome.value));
        } else {
          console.warn(`No se pudo leer la beca ${entry.id} (${entry.contractId}):`, outcome.reason);
        }
      });

      if (stored.length > 0 && result.length === 0) {
        throw new Error('No se pudo leer ninguna beca de la cadena. Inténtalo de nuevo en unos segundos.');
      }
      return result;
    },

    async createScholarship(donor, input) {
      if (allowedTokens && !allowedTokens.includes(input.token)) {
        throw new ServiceError('InvalidInput', 'Este token no está permitido. Usa USDCDEMO en la red de pruebas.');
      }
      await requireConnected(donor);

      // Solo importe y plazo viajan al contrato; los textos van al almacén.
      const { contractId } = await chain.deployScholarship(
        donor,
        {
          beneficiary: input.beneficiary,
          verifier: input.verifier,
          token: input.token,
          milestones: onChainMilestones(input),
        },
        onPhase,
      );

      let stored: StoredScholarship;
      try {
        const { id } = await store.save({
          contractId,
          donor,
          beneficiary: input.beneficiary,
          verifier: input.verifier,
          token: input.token,
          title: input.title,
          institution: input.institution,
          milestones: input.milestones,
        });
        stored = {
          id,
          contractId,
          donor,
          title: input.title,
          institution: input.institution,
          milestoneDetails: input.milestones.map((m) => ({ ...m.details })),
        };
      } catch (error) {
        throw new ServiceError(
          'InvalidInput',
          `El contrato se desplegó (${contractId}) pero no se pudo guardar la ficha: ${messageOf(error)} ` +
            'Anota ese Contract ID.',
        );
      }

      return compose(stored, await chain.getScholarship(contractId));
    },

    async fund(id) {
      const stored = await findStored(id);
      await requireConnected(stored.donor);

      const state = await readChecked(stored);
      if (state.status !== 'Unfunded') throw new ServiceError('AlreadyFunded', 'La beca ya está financiada.');
      const first = state.milestones[0];
      if (first && now() > first.deadline) throw new ServiceError('MilestoneExpired');

      await chain.fundScholarship(stored.contractId, stored.donor, onPhase);

      // La operación ya está confirmada en la cadena: un fallo al guardar la copia no la deshace.
      try {
        await store.markFunded(stored.contractId);
      } catch (error) {
        console.warn('Beca financiada, pero no se pudo actualizar la copia en Supabase:', error);
      }
      return compose(stored, await chain.getScholarship(stored.contractId));
    },

    async claimRefund(id) {
      const stored = await findStored(id);
      await requireConnected(stored.donor);

      const state = await readChecked(stored);
      if (state.status === 'Unfunded') throw new ServiceError('NotFunded', 'La beca aún no está financiada.');
      if (state.status === 'Completed' || state.status === 'Refunded') {
        throw new ServiceError('ScholarshipClosed', 'La beca ya está cerrada.');
      }
      if (!canClaimRefund({ ...state, id: stored.id, contractId: stored.contractId }, now())) {
        throw new ServiceError('RefundNotAvailable');
      }

      const { refunded } = await chain.claimRefund(stored.contractId, stored.donor, onPhase);

      try {
        await store.markRefunded(stored.contractId, state.nextMilestoneId);
      } catch (error) {
        console.warn('Reembolso hecho, pero no se pudo actualizar la copia en Supabase:', error);
      }
      const scholarship = compose(stored, await chain.getScholarship(stored.contractId));
      return { scholarship, refunded };
    },
  };
}

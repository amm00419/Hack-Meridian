import {
  canClaimRefund,
  pendingAmount,
  UNITS_PER_TOKEN,
  USDCDEMO_CONTRACT,
  type DonorScholarship,
  type Milestone,
  type MilestoneMeta,
  type NewScholarshipInput,
} from '../domain/aidrelease';

// ---------------------------------------------------------------------------
// Contrato de servicio: lo que la pantalla del donante necesita.
// Hoy lo implementa el mock de abajo. Cuando exista el contrato desplegado, se
// escribe otra implementación con el SDK de Stellar y Freighter y las pantallas
// no cambian.
//
// Reparto de datos al integrar el contrato real:
//   - Contrato (Soroban): roles, token, importes y plazos de los hitos, pagos.
//     Se le envía onChainMilestones(input).
//   - Fuera de la cadena: título, entidad y los detalles de cada hito
//     (descripción, criterios, documentación). Se guardan asociados al id del
//     contrato desplegado.
// ---------------------------------------------------------------------------
export interface DonorService {
  listScholarships(donor: string): Promise<DonorScholarship[]>;
  createScholarship(donor: string, input: NewScholarshipInput): Promise<DonorScholarship>;
  fund(id: string): Promise<DonorScholarship>;
  claimRefund(id: string): Promise<{ scholarship: DonorScholarship; refunded: bigint }>;
}

// Los códigos reutilizan los nombres de ContractError cuando existen.
export type ServiceErrorCode =
  | 'NotFound'
  | 'NotFunded'
  | 'AlreadyFunded'
  | 'ScholarshipClosed'
  | 'RefundNotAvailable'
  | 'MilestoneExpired'
  | 'InvalidInput';

export class ServiceError extends Error {
  code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ServiceError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Mock en memoria
// ---------------------------------------------------------------------------

// Cuentas públicas de testnet del equipo (solo direcciones, nunca claves).
export const MOCK_DONOR_ADDRESS = 'GDJSLK5B3ZRNVY5FGXLZUYJLEDQGBIHFTVAHHHIHST4JKBGQHHDKPP5Y';
const MOCK_STUDENT = 'GA46NMWB4HM6SRUR5OSWL2TWLZYFCFU3MLO2CCJN4GJBVZYR6IQIK3XP';
const MOCK_VERIFIER = 'GD6NYSV66NZALVLBJH53TG73WZY474NDUO6BFXBNKHLX3PDTGQHCBEG2';

const DAY = 86_400;
const tokens = (n: number): bigint => BigInt(n) * UNITS_PER_TOKEN;

function fakeContractId(n: number): string {
  return `CMOCK${String(n).padStart(3, '0')}`.padEnd(56, 'A');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function milestone(id: number, amount: bigint, deadline: number, status: Milestone['status']): Milestone {
  return {
    id,
    amount,
    deadline,
    status,
    evidenceHash: status === 'Paid' ? 'ab'.repeat(32) : null,
  };
}

function details(
  title: string,
  description: string,
  approvalCriteria: string[],
  requiredDocuments: string[],
  verifierInstructions?: string,
): MilestoneMeta {
  return {
    title,
    description,
    approvalCriteria,
    requiredDocuments,
    ...(verifierInstructions ? { verifierInstructions } : {}),
  };
}

function seed(now: number): DonorScholarship[] {
  const base = {
    donor: MOCK_DONOR_ADDRESS,
    beneficiary: MOCK_STUDENT,
    verifier: MOCK_VERIFIER,
    token: USDCDEMO_CONTRACT,
  };

  return [
    {
      ...base,
      id: 'SCH-001',
      contractId: fakeContractId(1),
      title: 'Beca de Apoyo Universitario',
      institution: 'Fundación AidRelease',
      status: 'Unfunded',
      totalAmount: tokens(900),
      paidAmount: 0n,
      refundedAmount: 0n,
      nextMilestoneId: 0,
      milestones: [
        milestone(0, tokens(300), now + 30 * DAY, 'Pending'),
        milestone(1, tokens(300), now + 60 * DAY, 'Pending'),
        milestone(2, tokens(300), now + 90 * DAY, 'Pending'),
      ],
      milestoneDetails: [
        details(
          'Matrícula universitaria',
          'Acreditar la matrícula del curso.',
          ['El justificante debe estar emitido por la universidad e indicar el curso académico vigente.'],
          ['Justificante de matrícula (PDF)'],
        ),
        details(
          'Primer trimestre',
          'Acreditar el progreso académico.',
          [
            'Haber superado al menos el 50 % de los créditos matriculados en el trimestre.',
            'El certificado debe estar firmado o sellado por la secretaría.',
          ],
          ['Certificado de calificaciones'],
          'Comprueba que el curso académico del certificado coincide con el de la matrícula.',
        ),
        details(
          'Segundo trimestre',
          'Superar las asignaturas previstas.',
          ['Haber superado al menos el 50 % de los créditos del segundo trimestre.'],
          ['Certificado de calificaciones'],
        ),
      ],
    },
    {
      ...base,
      id: 'SCH-002',
      contractId: fakeContractId(2),
      title: 'Beca de Investigación en IA',
      institution: 'Universidad de Jaén',
      status: 'Active',
      totalAmount: tokens(1000),
      paidAmount: tokens(400),
      refundedAmount: 0n,
      nextMilestoneId: 1,
      milestones: [
        milestone(0, tokens(400), now - 20 * DAY, 'Paid'),
        // Vencido y sin aprobar: el donante puede reclamar el reembolso.
        milestone(1, tokens(300), now - 2 * DAY, 'Pending'),
        milestone(2, tokens(300), now + 30 * DAY, 'Pending'),
      ],
      milestoneDetails: [
        details(
          'Propuesta de investigación',
          'Presentar el plan inicial del trabajo.',
          ['La propuesta incluye objetivos, metodología y calendario, y está avalada por el tutor.'],
          ['Propuesta de investigación (PDF)', 'Aval del tutor'],
        ),
        details(
          'Primer prototipo',
          'Demostrar los primeros resultados.',
          ['El prototipo ejecuta el caso de uso descrito en la propuesta y se entrega con instrucciones.'],
          ['Enlace al repositorio', 'Informe breve de resultados'],
        ),
        details(
          'Presentación final',
          'Defender los resultados.',
          ['Presentación realizada ante el tutor con acta firmada.'],
          ['Acta de la presentación'],
        ),
      ],
    },
    {
      ...base,
      id: 'SCH-003',
      contractId: fakeContractId(3),
      title: 'Beca de Movilidad Erasmus',
      institution: 'Universidad de Jaén',
      status: 'Completed',
      totalAmount: tokens(1200),
      paidAmount: tokens(1200),
      refundedAmount: 0n,
      nextMilestoneId: 3,
      milestones: [
        milestone(0, tokens(400), now - 200 * DAY, 'Paid'),
        milestone(1, tokens(400), now - 120 * DAY, 'Paid'),
        milestone(2, tokens(400), now - 40 * DAY, 'Paid'),
      ],
      milestoneDetails: [
        details('Incorporación', 'Acreditar la llegada al destino.', ['Certificado de incorporación firmado por la universidad de destino.'], ['Certificado de incorporación']),
        details('Seguimiento', 'Informe intermedio.', ['Informe de seguimiento aprobado por el coordinador.'], ['Informe intermedio']),
        details('Finalización', 'Certificado de estancia.', ['Certificado de estancia con las fechas completas.'], ['Certificado de estancia']),
      ],
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `now` se inyecta para poder probar el servicio con un reloj controlado. */
export function createMockDonorService(
  now: () => number = () => Math.floor(Date.now() / 1000),
  latencyMs = 600,
): DonorService {
  let db: DonorScholarship[] = seed(now());
  let counter = db.length;

  const find = (id: string): DonorScholarship => {
    const found = db.find((s) => s.id === id);
    if (!found) throw new ServiceError('NotFound', `No existe la beca ${id}.`);
    return found;
  };

  return {
    async listScholarships(donor) {
      await delay(latencyMs);
      return clone(db.filter((s) => s.donor === donor));
    },

    async createScholarship(donor, input) {
      await delay(latencyMs);
      counter += 1;
      const created: DonorScholarship = {
        id: `SCH-${String(counter).padStart(3, '0')}`,
        contractId: fakeContractId(counter),
        donor,
        beneficiary: input.beneficiary,
        verifier: input.verifier,
        token: input.token,
        title: input.title,
        institution: input.institution,
        status: 'Unfunded',
        totalAmount: input.milestones.reduce((sum, m) => sum + m.amount, 0n),
        paidAmount: 0n,
        refundedAmount: 0n,
        nextMilestoneId: 0,
        milestones: input.milestones.map((m, i) => milestone(i, m.amount, m.deadline, 'Pending')),
        milestoneDetails: input.milestones.map((m) => ({ ...m.details })),
      };
      db = [created, ...db];
      return clone(created);
    },

    async fund(id) {
      await delay(latencyMs);
      const s = find(id);
      if (s.status !== 'Unfunded') throw new ServiceError('AlreadyFunded', 'La beca ya está financiada.');
      s.status = 'Active';
      return clone(s);
    },

    async claimRefund(id) {
      await delay(latencyMs);
      const s = find(id);
      if (s.status === 'Unfunded') throw new ServiceError('NotFunded', 'La beca aún no está financiada.');
      if (s.status === 'Completed' || s.status === 'Refunded') {
        throw new ServiceError('ScholarshipClosed', 'La beca ya está cerrada.');
      }
      if (!canClaimRefund(s, now())) {
        throw new ServiceError('RefundNotAvailable', 'El siguiente hito todavía no ha vencido.');
      }

      const refunded = pendingAmount(s);
      for (const m of s.milestones) {
        if (m.id === s.nextMilestoneId) m.status = 'Expired';
        else if (m.id > s.nextMilestoneId && m.status === 'Pending') m.status = 'Cancelled';
      }
      s.refundedAmount += refunded;
      s.status = 'Refunded';
      return { scholarship: clone(s), refunded };
    },
  };
}

/** Mensaje comprensible para mostrar al usuario. */
export function describeError(error: unknown): string {
  if (error instanceof ServiceError) {
    switch (error.code) {
      case 'NotFound':
        return 'No se encontró la beca.';
      case 'NotFunded':
        return 'La beca todavía no está financiada.';
      case 'AlreadyFunded':
        return 'La beca ya estaba financiada.';
      case 'ScholarshipClosed':
        return 'La beca ya está cerrada.';
      case 'RefundNotAvailable':
        return 'Todavía no se puede reclamar el reembolso: el siguiente hito no ha vencido.';
      case 'MilestoneExpired':
        return 'El plazo del primer hito ya venció: la beca no se puede financiar.';
      case 'InvalidInput':
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Ha ocurrido un error inesperado.';
}

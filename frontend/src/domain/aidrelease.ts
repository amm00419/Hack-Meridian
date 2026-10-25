// Modelo de dominio de AidRelease, según docs/interfaz-contrato.md.
// Los importes son bigint en unidades mínimas (7 decimales) y las fechas son
// timestamps Unix en SEGUNDOS, igual que en el contrato.

export const TOKEN_DECIMALS = 7;
export const UNITS_PER_TOKEN = 10_000_000n;
export const MAX_MILESTONES = 10;
export const MAX_I128 = 2n ** 127n - 1n;

export const USDCDEMO_SYMBOL = 'USDCDEMO';
export const USDCDEMO_CONTRACT =
  'CDFEDKZ6LWUS5JSHOFM5XVKCD6ALYGVDMREZYTYAZNOAFGQ6FJMLRA7Y';

// Límites de los textos descriptivos de cada hito (viven fuera de la cadena).
export const MILESTONE_LIMITS = {
  title: 80,
  description: 500,
  criteria: 1000,
  document: 120,
  maxDocuments: 10,
} as const;

// Estados on-chain (nombres del contrato).
export type ScholarshipStatus = 'Unfunded' | 'Active' | 'Completed' | 'Refunded';
export type MilestoneStatus = 'Pending' | 'Paid' | 'Expired' | 'Cancelled';

export interface Milestone {
  id: number; // 0, 1, 2... (el contrato empieza en 0)
  amount: bigint;
  deadline: number; // Unix, segundos
  status: MilestoneStatus;
  evidenceHash: string | null; // hex de 32 bytes, o null si no hay
}

// Datos que viven en la cadena.
export interface Scholarship {
  id: string; // id interno de la app
  contractId: string; // dirección C... del contrato desplegado
  donor: string;
  beneficiary: string;
  verifier: string;
  token: string; // dirección C... del contrato del token
  status: ScholarshipStatus;
  totalAmount: bigint;
  paidAmount: bigint;
  refundedAmount: bigint;
  nextMilestoneId: number;
  milestones: Milestone[];
}

// Datos que NO caben en el contrato (se guardan fuera de la cadena).
export interface ScholarshipMeta {
  title: string;
  institution: string;
}

/**
 * Qué debe cumplir el estudiante en un hito. Vive FUERA de la cadena: el
 * contrato solo conoce importe y plazo. Se asocia al hito por su posición
 * (milestoneDetails[i] describe al hito con id i).
 * No incluir datos personales de estudiantes (RGPD).
 */
export interface MilestoneMeta {
  title: string;
  description: string; // contexto, opcional
  criteria: string; // criterios que usa el verificador para aprobar
  requiredDocuments: string[]; // documentación que debe aportar el estudiante
}

export type DonorScholarship = Scholarship &
  ScholarshipMeta & {
    milestoneDetails: MilestoneMeta[];
  };

// Lo que el contrato recibe por cada hito en el constructor.
export interface MilestoneInput {
  amount: bigint;
  deadline: number;
}

// Lo que el donante rellena por cada hito: parte on-chain + parte descriptiva.
export interface NewMilestone extends MilestoneInput {
  details: MilestoneMeta;
}

// El donante lo pone la billetera.
export interface NewScholarshipInput extends ScholarshipMeta {
  beneficiary: string;
  verifier: string;
  token: string;
  milestones: NewMilestone[];
}

/** Solo importe y plazo: es lo único que se envía al contrato. */
export function onChainMilestones(input: NewScholarshipInput): MilestoneInput[] {
  return input.milestones.map(({ amount, deadline }) => ({ amount, deadline }));
}

// ---------------------------------------------------------------------------
// Reglas derivadas (réplica de las reglas del contrato, para la interfaz)
// ---------------------------------------------------------------------------

/** total - pagado - reembolsado, solo cuando la beca ya está financiada. */
export function pendingAmount(s: Scholarship): bigint {
  if (s.status === 'Unfunded') return 0n;
  return s.totalAmount - s.paidAmount - s.refundedAmount;
}

/** El siguiente hito por aprobar (solo si la beca está activa). */
export function nextMilestone(s: Scholarship): Milestone | undefined {
  if (s.status !== 'Active') return undefined;
  return s.milestones.find((m) => m.id === s.nextMilestoneId);
}

/** Un hito pendiente cuyo plazo ya pasó (el estado Expired solo se escribe al reembolsar). */
export function isMilestoneOverdue(m: Milestone, nowSec: number): boolean {
  return m.status === 'Pending' && nowSec > m.deadline;
}

/** Regla del contrato: se puede reembolsar si now > deadline del siguiente hito. */
export function canClaimRefund(s: Scholarship, nowSec: number): boolean {
  const next = nextMilestone(s);
  return next !== undefined && nowSec > next.deadline;
}

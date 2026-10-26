
export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'corrections';

export interface Verification {
  id: string;
  scholarshipId: string;
  scholarshipTitle: string;
  studentName: string;
  milestoneId: number;
  milestoneTitle: string;
  amount: number;
  currency: string;
  submittedAt: string;
  documents: number;
  status: VerificationStatus;
}

export const mockVerifications: Verification[] = [
  {
    id: 'VER-001',
    scholarshipId: 'SCH-2026-001',
    scholarshipTitle: 'Beca de Apoyo Universitario',
    studentName: 'Estudiante 01',
    milestoneId: 2,
    milestoneTitle: 'Primer trimestre',
    amount: 300,
    currency: 'USDCDEMO',
    submittedAt: '2026-10-25',
    documents: 3,
    status: 'pending',
  },
  {
    id: 'VER-002',
    scholarshipId: 'SCH-2026-002',
    scholarshipTitle: 'Beca de Investigación en IA',
    studentName: 'Estudiante 02',
    milestoneId: 3,
    milestoneTitle: 'Segundo artículo',
    amount: 400,
    currency: 'USDCDEMO',
    submittedAt: '2026-10-24',
    documents: 2,
    status: 'pending',
  },
  {
    id: 'VER-003',
    scholarshipId: 'SCH-2026-005',
    scholarshipTitle: 'Beca de Formación Tecnológica',
    studentName: 'Estudiante 03',
    milestoneId: 1,
    milestoneTitle: 'Entrega del proyecto',
    amount: 250,
    currency: 'USDCDEMO',
    submittedAt: '2026-10-23',
    documents: 1,
    status: 'pending',
  },
  {
    id: 'VER-004',
    scholarshipId: 'SCH-2026-001',
    scholarshipTitle: 'Beca de Apoyo Universitario',
    studentName: 'Estudiante 01',
    milestoneId: 1,
    milestoneTitle: 'Matrícula universitaria',
    amount: 300,
    currency: 'USDCDEMO',
    submittedAt: '2026-10-20',
    documents: 2,
    status: 'approved',
  },
  {
    id: 'VER-005',
    scholarshipId: 'SCH-2026-006',
    scholarshipTitle: 'Beca de Investigación Médica',
    studentName: 'Estudiante 04',
    milestoneId: 2,
    milestoneTitle: 'Informe de seguimiento',
    amount: 500,
    currency: 'USDCDEMO',
    submittedAt: '2026-10-22',
    documents: 2,
    status: 'corrections',
  },
];

export const verificationLabels: Record<
  VerificationStatus,
  string
> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  corrections: 'Correcciones',
};

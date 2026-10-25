export type MilestoneStatus = 'paid' | 'pending' | 'locked';

export type ScholarshipStatus = 'active' | 'completed' | 'failed';

export interface Milestone {
  id: number;
  title: string;
  description: string;
  amount: number;
  deadline: string;
  status: MilestoneStatus;

  // Información para el estudiante y el verificador
  approvalCriteria?: string[];
  requiredDocuments?: string[];
  verifierInstructions?: string;
}

export interface Scholarship {
  id: string;
  title: string;
  institution: string;
  currency: string;
  totalAmount: number;
  status: ScholarshipStatus;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
}

export const mockScholarships: Scholarship[] = [
  {
    id: 'SCH-2026-001',
    title: 'Beca de Apoyo Universitario',
    institution: 'Fundación AidRelease',
    currency: 'USDCDEMO',
    totalAmount: 1500,
    status: 'active',
    startDate: '2026-09-01',
    endDate: '2027-07-20',
    milestones: [
      {
        id: 1,
        title: 'Matrícula universitaria',
        description: 'Justificante de matrícula validado',
        amount: 300,
        deadline: '2026-11-15',
        status: 'paid',
      },
      {
        id: 2,
        title: 'Primer trimestre',
        description: 'Acreditar el progreso académico',
        amount: 300,
        deadline: '2026-12-20',
        status: 'pending',

        approvalCriteria: [
          'Estar matriculado en el curso académico correspondiente.',
          'Haber superado al menos el 70 % de los créditos evaluados.',
          'Presentar un certificado oficial de calificaciones.',
          'Los documentos deben corresponder al estudiante beneficiario.',
        ],

        requiredDocuments: [
          'Certificado oficial de notas',
          'Justificante de matrícula actualizado',
        ],

        verifierInstructions:
          'Comprobar que los documentos son legibles y corresponden al estudiante. Si falta información o algún documento es incorrecto, solicitar una corrección antes de aprobar el hito.',
      },
      {
        id: 3,
        title: 'Segundo trimestre',
        description: 'Superar las asignaturas previstas',
        amount: 300,
        deadline: '2027-03-20',
        status: 'locked',
      },
      {
        id: 4,
        title: 'Proyecto académico',
        description: 'Presentar el proyecto final',
        amount: 300,
        deadline: '2027-05-20',
        status: 'locked',
      },
      {
        id: 5,
        title: 'Finalización de estudios',
        description: 'Acreditar la finalización del curso',
        amount: 300,
        deadline: '2027-07-20',
        status: 'locked',
      },
    ],
  },
  {
    id: 'SCH-2026-002',
    title: 'Beca de Investigación en IA',
    institution: 'Universidad de Jaén',
    currency: 'USDCDEMO',
    totalAmount: 2000,
    status: 'active',
    startDate: '2026-06-01',
    endDate: '2027-02-15',
    milestones: [
      {
        id: 1,
        title: 'Propuesta de investigación',
        description: 'Presentar el plan inicial',
        amount: 600,
        deadline: '2026-07-15',
        status: 'paid',
      },
      {
        id: 2,
        title: 'Primer prototipo',
        description: 'Demostrar los primeros resultados',
        amount: 600,
        deadline: '2026-09-30',
        status: 'paid',
      },
      {
        id: 3,
        title: 'Segundo artículo',
        description: 'Entregar el borrador del artículo',
        amount: 400,
        deadline: '2026-11-05',
        status: 'pending',
      },
      {
        id: 4,
        title: 'Presentación final',
        description: 'Defender los resultados',
        amount: 400,
        deadline: '2027-02-15',
        status: 'locked',
      },
    ],
  },
  {
    id: 'SCH-2025-003',
    title: 'Beca de Movilidad Erasmus',
    institution: 'Universidad de Jaén',
    currency: 'USDCDEMO',
    totalAmount: 1200,
    status: 'completed',
    startDate: '2025-09-01',
    endDate: '2026-06-30',
    milestones: [
      {
        id: 1,
        title: 'Incorporación',
        description: 'Acreditar la llegada',
        amount: 400,
        deadline: '2025-10-01',
        status: 'paid',
      },
      {
        id: 2,
        title: 'Seguimiento',
        description: 'Informe intermedio',
        amount: 400,
        deadline: '2026-02-01',
        status: 'paid',
      },
      {
        id: 3,
        title: 'Finalización',
        description: 'Certificado de estancia',
        amount: 400,
        deadline: '2026-06-30',
        status: 'paid',
      },
    ],
  },
  {
    id: 'SCH-2025-004',
    title: 'Beca de Mérito Académico',
    institution: 'Fundación Jaén Talento',
    currency: 'USDCDEMO',
    totalAmount: 1000,
    status: 'failed',
    startDate: '2025-09-01',
    endDate: '2026-06-30',
    milestones: [
      {
        id: 1,
        title: 'Primer seguimiento',
        description: 'Acreditar rendimiento',
        amount: 400,
        deadline: '2025-12-15',
        status: 'paid',
      },
      {
        id: 2,
        title: 'Segundo seguimiento',
        description: 'No se cumplió el requisito',
        amount: 300,
        deadline: '2026-03-15',
        status: 'pending',
      },
      {
        id: 3,
        title: 'Evaluación final',
        description: 'Hito cancelado',
        amount: 300,
        deadline: '2026-06-30',
        status: 'locked',
      },
    ],
  },
];

export const mockScholarship = mockScholarships[0];

export function getPaidAmount(scholarship: Scholarship): number {
  return scholarship.milestones
    .filter((milestone) => milestone.status === 'paid')
    .reduce((total, milestone) => total + milestone.amount, 0);
}


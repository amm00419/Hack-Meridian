
import { supabase } from './supabase';
import type {
  Scholarship,
  Milestone,
  MilestoneStatus,
  ScholarshipStatus,
} from './mockScholarships';

const TOKEN_FACTOR = 10_000_000;

type DbMilestone = {
  indice: number;
  titulo: string;
  descripcion: string | null;
  importe: number;
  plazo: number;
  estado: string;
  criterios: string[] | null;
  documentos_requeridos: string[] | null;
  instrucciones_verificador: string | null;
};

type DbScholarship = {
  id: string;
  titulo: string;
  institucion: string;
  moneda: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  hitos: DbMilestone[];
};

function mapMilestoneStatus(status: string): MilestoneStatus {
  if (status === 'paid') return 'paid';

  if (
    status === 'pending' ||
    status === 'submitted' ||
    status === 'correction_requested'
  ) {
    return 'pending';
  }

  return 'locked';
}

function mapScholarshipStatus(status: string): ScholarshipStatus {
  if (status === 'completed') return 'completed';
  if (status === 'refunded') return 'failed';
  return 'active';
}

function formatDeadline(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function mapScholarship(db: DbScholarship): Scholarship {
  const milestones: Milestone[] = [...(db.hitos ?? [])]
    .sort((a, b) => a.indice - b.indice)
    .map((hito) => ({
      id: hito.indice,
      title: hito.titulo,
      description: hito.descripcion ?? '',
      amount: Number(hito.importe) / TOKEN_FACTOR,
      deadline: formatDeadline(Number(hito.plazo)),
      status: mapMilestoneStatus(hito.estado),
      approvalCriteria: hito.criterios ?? [],
      requiredDocuments: hito.documentos_requeridos ?? [],
      verifierInstructions: hito.instrucciones_verificador ?? '',
    }));

  return {
    id: db.id,
    title: db.titulo,
    institution: db.institucion,
    currency: db.moneda,
    status: mapScholarshipStatus(db.estado),
    startDate: db.fecha_inicio,
    endDate: db.fecha_fin ?? '',
    totalAmount: milestones.reduce(
      (total, milestone) => total + milestone.amount,
      0
    ),
    milestones,
  };
}

export async function getScholarships(
  studentAddress: string
): Promise<Scholarship[]> {
  const { data, error } = await supabase
    .from('becas')
    .select(`
      id,
      titulo,
      institucion,
      moneda,
      estado,
      fecha_inicio,
      fecha_fin,
      hitos (
        indice,
        titulo,
        descripcion,
        importe,
        plazo,
        estado,
        criterios,
        documentos_requeridos,
        instrucciones_verificador
      )
    `)
    .eq('estudiante_addr', studentAddress)
    .order('id');

  if (error) {
    console.error('Error consultando las becas:', error);
    throw new Error(error.message);
  }

  return (data ?? []).map((item) =>
    mapScholarship(item as DbScholarship)
  );
}

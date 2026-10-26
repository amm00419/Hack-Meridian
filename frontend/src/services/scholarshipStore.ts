import type { SupabaseClient } from '@supabase/supabase-js';
import type { MilestoneMeta, NewMilestone } from '../domain/aidrelease';

// ---------------------------------------------------------------------------
// Almacén de las fichas de las becas (datos FUERA de la cadena).
//
// El contrato es la autoridad para roles, importes, plazos y estados. Aquí solo
// se guardan los textos y una copia del estado para poder listar. Las tablas son
// `becas` y `hitos` de backend/supabase/migrations.
// ---------------------------------------------------------------------------

export interface NewStoredScholarship {
  contractId: string;
  donor: string;
  beneficiary: string;
  verifier: string;
  token: string;
  title: string;
  institution: string;
  milestones: NewMilestone[];
}

export interface StoredScholarship {
  id: string; // becas.id (SCH-2026-001)
  contractId: string;
  donor: string;
  title: string;
  institution: string;
  /** milestoneDetails[i] describe el hito con índice i del contrato. */
  milestoneDetails: MilestoneMeta[];
}

export interface ScholarshipStore {
  /** Idempotente por contractId: repetirlo no duplica la beca ni los hitos. */
  save(input: NewStoredScholarship): Promise<{ id: string }>;
  /** Solo becas ya desplegadas (contract_id no nulo) de ese donante. */
  listByDonor(donor: string): Promise<StoredScholarship[]>;
  findById(id: string): Promise<StoredScholarship | null>;
  /** Tras un fund() confirmado: beca activa y primer hito disponible. */
  markFunded(contractId: string): Promise<void>;
  /** Tras un claim_refund() confirmado: beca reembolsada, hito vencido y siguientes cancelados. */
  markRefunded(contractId: string, nextMilestoneId: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementación con Supabase
// ---------------------------------------------------------------------------

interface HitoRow {
  indice: number;
  titulo: string;
  descripcion: string | null;
  criterios: unknown;
  documentos_requeridos: unknown;
  instrucciones_verificador: string | null;
}

interface BecaRow {
  id: string;
  contract_id: string | null;
  donante_addr: string;
  titulo: string;
  institucion: string;
  hitos: HitoRow[] | null;
}

const BECA_SELECT =
  'id, contract_id, donante_addr, titulo, institucion, ' +
  'hitos (indice, titulo, descripcion, criterios, documentos_requeridos, instrucciones_verificador)';

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toDateInput(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toStored(row: BecaRow): StoredScholarship | null {
  if (!row.contract_id) return null;
  const details: MilestoneMeta[] = [];
  for (const hito of [...(row.hitos ?? [])].sort((a, b) => a.indice - b.indice)) {
    details[hito.indice] = {
      title: hito.titulo,
      description: hito.descripcion ?? '',
      approvalCriteria: asStringArray(hito.criterios),
      requiredDocuments: asStringArray(hito.documentos_requeridos),
      ...(hito.instrucciones_verificador ? { verifierInstructions: hito.instrucciones_verificador } : {}),
    };
  }
  return {
    id: row.id,
    contractId: row.contract_id,
    donor: row.donante_addr,
    title: row.titulo,
    institution: row.institucion,
    milestoneDetails: details,
  };
}

export function createSupabaseStore(client: SupabaseClient): ScholarshipStore {
  async function becaIdOf(contractId: string): Promise<string> {
    const { data, error } = await client.from('becas').select('id').eq('contract_id', contractId).single();
    if (error) fail('No se encontró la beca en la base de datos', error);
    return (data as { id: string }).id;
  }

  return {
    async save(input) {
      const lastDeadline = Math.max(...input.milestones.map((m) => m.deadline));

      const { data, error } = await client
        .from('becas')
        .upsert(
          {
            contract_id: input.contractId,
            donante_addr: input.donor,
            estudiante_addr: input.beneficiary,
            verificador_addr: input.verifier,
            token_addr: input.token,
            titulo: input.title,
            institucion: input.institution,
            estado: 'unfunded',
            fecha_fin: toDateInput(lastDeadline),
          },
          { onConflict: 'contract_id' },
        )
        .select('id')
        .single();
      if (error) fail('No se pudo guardar la beca', error);
      const id = (data as { id: string }).id;

      // importe va como texto: JSON no admite bigint y bigint de Postgres acepta cadenas.
      const rows = input.milestones.map((m, indice) => ({
        beca_id: id,
        indice,
        titulo: m.details.title,
        descripcion: m.details.description || null,
        importe: m.amount.toString(),
        plazo: m.deadline,
        estado: 'locked',
        criterios: m.details.approvalCriteria,
        documentos_requeridos: m.details.requiredDocuments,
        instrucciones_verificador: m.details.verifierInstructions ?? null,
      }));
      const hitos = await client.from('hitos').upsert(rows, { onConflict: 'beca_id,indice' });
      if (hitos.error) fail('No se pudieron guardar los hitos', hitos.error);

      return { id };
    },

    async listByDonor(donor) {
      const { data, error } = await client
        .from('becas')
        .select(BECA_SELECT)
        .eq('donante_addr', donor)
        .not('contract_id', 'is', null)
        .order('creado_en', { ascending: false });
      if (error) fail('No se pudieron leer las becas', error);
      return ((data ?? []) as unknown as BecaRow[]).flatMap((row) => toStored(row) ?? []);
    },

    async findById(id) {
      const { data, error } = await client.from('becas').select(BECA_SELECT).eq('id', id).maybeSingle();
      if (error) fail('No se pudo leer la beca', error);
      return data ? toStored(data as unknown as BecaRow) : null;
    },

    async markFunded(contractId) {
      const becaId = await becaIdOf(contractId);
      const beca = await client.from('becas').update({ estado: 'active' }).eq('id', becaId);
      if (beca.error) fail('No se pudo actualizar la beca', beca.error);
      const hito = await client
        .from('hitos')
        .update({ estado: 'pending' })
        .eq('beca_id', becaId)
        .eq('indice', 0)
        .eq('estado', 'locked');
      if (hito.error) fail('No se pudo actualizar el primer hito', hito.error);
    },

    async markRefunded(contractId, nextMilestoneId) {
      const becaId = await becaIdOf(contractId);
      const beca = await client.from('becas').update({ estado: 'refunded' }).eq('id', becaId);
      if (beca.error) fail('No se pudo actualizar la beca', beca.error);

      const expired = await client
        .from('hitos')
        .update({ estado: 'expired' })
        .eq('beca_id', becaId)
        .eq('indice', nextMilestoneId)
        .neq('estado', 'paid');
      if (expired.error) fail('No se pudo marcar el hito vencido', expired.error);

      const cancelled = await client
        .from('hitos')
        .update({ estado: 'cancelled' })
        .eq('beca_id', becaId)
        .gt('indice', nextMilestoneId)
        .neq('estado', 'paid');
      if (cancelled.error) fail('No se pudieron cancelar los hitos siguientes', cancelled.error);
    },
  };
}

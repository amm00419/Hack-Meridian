import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { getAddress, getNetwork } from '@stellar/freighter-api';
import { supabase } from '../services/supabase';
import './EvidenceUpload.css';

interface EvidenceUploadProps {
  scholarshipId: string;
  milestoneId: number; // Número visible del hito (1, 2, 3...), no PK de Supabase
  milestoneTitle: string;
}

interface SubmittedFile {
  id: string;
  fileName: string;
  fileSize: number;
}

interface Submission {
  files: SubmittedFile[];
  observations: string;
  submittedAt: string;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

async function getStudentAddress(): Promise<string> {
  const network = await getNetwork();
  if (network.error || network.network !== 'TESTNET') {
    throw new Error('Selecciona Testnet en Freighter.');
  }
  const wallet = await getAddress();
  if (wallet.error || !wallet.address) {
    throw new Error('Conecta Freighter antes de presentar evidencias.');
  }
  return wallet.address;
}

async function findDbMilestone(scholarshipId: string, milestoneTitle: string, address: string) {
  const { data: scholarship, error: scholarshipError } = await supabase
    .from('becas')
    .select('id')
    .eq('id', scholarshipId)
    .eq('estudiante_addr', address)
    .single();

  if (scholarshipError || !scholarship) {
    throw new Error('La beca no pertenece a la billetera conectada.');
  }

  // Buscar por beca y título evita confundir el índice visual con la PK de SQL.
  const { data, error } = await supabase
    .from('hitos')
    .select('id, estado')
    .eq('beca_id', scholarshipId)
    .eq('titulo', milestoneTitle)
    .single();

  if (error || !data) throw new Error('No se encontró el hito en Supabase.');
  return data as { id: number; estado: string };
}

export default function EvidenceUpload({ scholarshipId, milestoneId, milestoneTitle }: EvidenceUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [observations, setObservations] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [milestoneStatus, setMilestoneStatus] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      setLoading(true);
      setError('');
      setSubmission(null);
      setMilestoneStatus('');
      setReviewComment('');
      try {
        const address = await getStudentAddress();
        const milestone = await findDbMilestone(scholarshipId, milestoneTitle, address);
        if (!cancelled) setMilestoneStatus(milestone.estado);
        const { data: existing, error: readError } = await supabase
          .from('presentaciones')
          .select('id, observaciones, creado_en, evidencias(id, nombre, tamano)')
          .eq('hito_id', milestone.id)
          .eq('estudiante_addr', address)
          .order('creado_en', { ascending: false })
          .limit(1);
        if (readError) throw new Error(readError.message);
        if (!cancelled && existing?.length) {
          const entry = existing[0];
          const docs = (entry.evidencias ?? []) as { id: string; nombre: string; tamano: number }[];
          if (milestone.estado === 'correction_requested') {
            const { data: review, error: reviewError } = await supabase
              .from('revisiones')
              .select('comentario, decision')
              .eq('presentacion_id', entry.id)
              .eq('decision', 'correction_requested')
              .order('creado_en', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (reviewError) throw new Error(reviewError.message);
            if (!cancelled) setReviewComment(review?.comentario ?? 'El verificador ha solicitado una nueva presentación.');
          }
          if (!cancelled) setSubmission({
            files: docs.map((d) => ({ id: d.id, fileName: d.nombre, fileSize: d.tamano })),
            observations: entry.observaciones ?? '',
            submittedAt: entry.creado_en,
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo consultar el hito.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadExisting();
    return () => { cancelled = true; };
  }, [scholarshipId, milestoneId, milestoneTitle]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError('');
    const keys = new Set(files.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    const additions: File[] = [];
    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Formato no permitido: ${file.name}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`El archivo ${file.name} supera los 10 MB.`);
        return;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!keys.has(key)) { keys.add(key); additions.push(file); }
    }
    if (files.length + additions.length > MAX_FILES) {
      setError(`Solo puedes adjuntar un máximo de ${MAX_FILES} archivos.`);
      return;
    }
    setFiles((previous) => [...previous, ...additions]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (files.length === 0 || sending || loading || (submission && milestoneStatus !== 'correction_requested')) return;
    setSending(true);
    setError('');
    const uploadedPaths: string[] = [];
    let presentationId: string | null = null;
    try {
      const address = await getStudentAddress();
      const milestone = await findDbMilestone(scholarshipId, milestoneTitle, address);
      if (!['pending', 'correction_requested'].includes(milestone.estado)) {
        throw new Error('Este hito no admite nuevas presentaciones en su estado actual.');
      }
      const { data: existing, error: existingError } = await supabase
        .from('presentaciones').select('id').eq('hito_id', milestone.id)
        .eq('estudiante_addr', address).limit(1);
      if (existingError) throw new Error(existingError.message);
      if (existing?.length && milestone.estado !== 'correction_requested') {
        throw new Error('Este hito ya tiene una presentación registrada. Recarga la página.');
      }

      const prepared = [] as {
        file: File; salt: string; hash: string; path: string;
      }[];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const salt = randomHex(16);
        const salted = new Uint8Array(16 + buffer.byteLength);
        salted.set(Uint8Array.from(salt.match(/../g)!, (v) => parseInt(v, 16)));
        salted.set(new Uint8Array(buffer), 16);
        const hash = await sha256(salted.buffer);
        const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
        prepared.push({ file, salt, hash, path: `becas/${scholarshipId}/${milestone.id}/${crypto.randomUUID()}.${extension}` });
      }
      const combined = prepared.map((item) => item.hash).sort();
      const combinedBytes = new TextEncoder().encode(JSON.stringify(combined));
      const combinedHash = await sha256(combinedBytes.buffer);

      for (const item of prepared) {
        const { error: uploadError } = await supabase.storage
          .from('evidencias').upload(item.path, item.file, { contentType: item.file.type, upsert: false });
        if (uploadError) throw new Error(`Error al subir ${item.file.name}: ${uploadError.message}`);
        uploadedPaths.push(item.path);
      }

      const { data: created, error: insertError } = await supabase
        .from('presentaciones')
        .insert({ hito_id: milestone.id, estudiante_addr: address, observaciones: observations.trim(), hash_conjunto: combinedHash })
        .select('id, creado_en').single();
      if (insertError || !created) throw new Error(insertError?.message ?? 'No se pudo crear la presentación.');
      presentationId = created.id;

      const { error: filesError } = await supabase.from('evidencias').insert(prepared.map((item) => ({
        presentacion_id: created.id,
        ruta_storage: item.path,
        nombre: item.file.name,
        mime: item.file.type,
        tamano: item.file.size,
        sha256: item.hash,
        salt: item.salt,
      })));
      if (filesError) throw new Error(filesError.message);

      const { data: updated, error: statusError } = await supabase.from('hitos')
        .update({ estado: 'submitted' }).eq('id', milestone.id).eq('estado', milestone.estado).select('id');
      if (statusError || !updated?.length) throw new Error(statusError?.message ?? 'El estado del hito ha cambiado. Recarga la página.');

      setSubmission({
        files: prepared.map((item) => ({ id: item.path, fileName: item.file.name, fileSize: item.file.size })),
        observations: observations.trim(), submittedAt: created.creado_en,
      });
      setFiles([]);
      setMilestoneStatus('submitted');
      setReviewComment('');
      setObservations('');
    } catch (err) {
      // Limpieza de mejor esfuerzo si la operación no se completó.
      if (presentationId) await supabase.from('presentaciones').delete().eq('id', presentationId);
      if (uploadedPaths.length) await supabase.storage.from('evidencias').remove(uploadedPaths);
      setError(err instanceof Error ? err.message : 'No se pudieron enviar los documentos.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="ar-evidence-form"><p>Comprobando presentaciones anteriores...</p></div>;

  if (submission && milestoneStatus !== 'correction_requested') {
    return (
      <div className="ar-evidence-success">
        <div className="ar-evidence-success-icon">✓</div>
        <div className="ar-evidence-success-content">
          <span className="ar-evidence-review-badge">{milestoneStatus === 'paid' ? 'Hito pagado' : milestoneStatus === 'submitted' ? 'En revisión' : 'Presentación registrada'}</span>
          <h4>Documentación presentada</h4>
          <p>Has presentado {submission.files.length} {submission.files.length === 1 ? 'documento' : 'documentos'} para <strong>{milestoneTitle}</strong>.</p>
          <div className="ar-evidence-submitted-list">
            {submission.files.map((file) => (
              <div className="ar-evidence-submitted-file" key={file.id}>
                <span>📄</span><div><strong>{file.fileName}</strong><small>{formatSize(file.fileSize)}</small></div>
                <span className="ar-evidence-file-check">✓</span>
              </div>
            ))}
          </div>
          <p className="ar-evidence-submission-date">Enviado el {new Date(submission.submittedAt).toLocaleString('es-ES')}</p>
          {submission.observations && <div className="ar-evidence-observations"><strong>Observaciones</strong><p>{submission.observations}</p></div>}
          <small className="ar-evidence-demo-note">Documentación registrada en Supabase. Demo Testnet.</small>
        </div>
      </div>
    );
  }

  return (
    <form className="ar-evidence-form" onSubmit={handleSubmit}>
      <div className="ar-evidence-form-heading">
        <div className="ar-evidence-form-icon">📄</div>
        <div><h4>{milestoneStatus === 'correction_requested' ? 'Volver a presentar evidencias' : 'Presentar evidencias'}</h4><p>Adjunta los documentos que acreditan el cumplimiento de este hito.</p></div>
      </div>
      {milestoneStatus === 'correction_requested' && (
        <div className="ar-evidence-observations" role="status" style={{ marginBottom: 16, padding: 16, border: '1px solid #e5a742', borderRadius: 8 }}>
          <strong>⚠ Correcciones solicitadas por el verificador</strong>
          <p>{reviewComment || 'Debes presentar una versión corregida de los documentos.'}</p>
          {submission && <small>Tu entrega anterior se conserva. Adjunta los documentos corregidos para una nueva revisión.</small>}
        </div>
      )}
      <label className="ar-evidence-upload-area">
        <span className="ar-evidence-upload-icon">☁</span>
        <strong>Seleccionar uno o varios documentos</strong>
        <small>PDF, JPG o PNG · Máximo 10 MB por archivo</small>
        <small>Hasta {MAX_FILES} documentos por hito</small>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={handleFileChange} disabled={sending || files.length >= MAX_FILES} />
      </label>
      {files.length > 0 && (
        <div className="ar-evidence-selected">
          <div className="ar-evidence-selected-heading"><strong>Documentos seleccionados</strong><span>{files.length}/{MAX_FILES}</span></div>
          <div className="ar-evidence-selected-list">
            {files.map((file, index) => (
              <div className="ar-evidence-selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span className="ar-evidence-file-icon">📄</span>
                <div className="ar-evidence-file-info"><strong>{file.name}</strong><small>{formatSize(file.size)}</small></div>
                <button type="button" className="ar-evidence-remove" onClick={() => { setFiles((previous) => previous.filter((_, i) => i !== index)); setError(''); }} disabled={sending} aria-label={`Eliminar ${file.name}`} title="Eliminar documento">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <label className="ar-evidence-field">
        <span>Observaciones para el verificador</span>
        <textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Ej.: Adjunto el certificado de notas, la matrícula y el informe académico..." rows={4} maxLength={1000} disabled={sending} />
      </label>
      {error && <p className="ar-evidence-error" role="alert">{error}</p>}
      <button type="submit" className="ar-evidence-submit" disabled={files.length === 0 || sending || Boolean(error && error.includes('billetera'))}>
        {sending ? 'Subiendo documentos...' : `${milestoneStatus === 'correction_requested' ? 'Reenviar' : 'Enviar'} ${files.length} ${files.length === 1 ? 'documento' : 'documentos'} para revisión →`}
      </button>
      <p className="ar-evidence-privacy">🔒 Los archivos se guardan en Supabase Storage, no en Stellar. Se registra una huella SHA-256 con sal para cada documento. Utiliza solo archivos ficticios en esta demo.</p>
    </form>
  );
}

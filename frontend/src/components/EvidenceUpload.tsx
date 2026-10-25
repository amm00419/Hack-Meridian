import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  getEvidence,
  saveEvidence,
  type EvidenceFile,
  type EvidenceSubmission,
} from '../services/mockEvidence';
import './EvidenceUpload.css';

interface EvidenceUploadProps {
  scholarshipId: string;
  milestoneId: number;
  milestoneTitle: string;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function EvidenceUpload({
  scholarshipId,
  milestoneId,
  milestoneTitle,
}: EvidenceUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [observations, setObservations] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const [submission, setSubmission] = useState<
    EvidenceSubmission | undefined
  >(() => getEvidence(scholarshipId, milestoneId));

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);

    setError('');
    event.target.value = '';

    if (selectedFiles.length === 0) return;

    const existingKeys = new Set(
      files.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    );

    const newFiles: File[] = [];

    for (const file of selectedFiles) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Formato no permitido: ${file.name}`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`El archivo ${file.name} supera los 10 MB.`);
        return;
      }

      const key = `${file.name}:${file.size}:${file.lastModified}`;

      if (existingKeys.has(key)) continue;

      existingKeys.add(key);
      newFiles.push(file);
    }

    if (files.length + newFiles.length > MAX_FILES) {
      setError(`Solo puedes adjuntar un máximo de ${MAX_FILES} archivos.`);
      return;
    }

    setFiles((previous) => [...previous, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index)
    );
    setError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (files.length === 0 || sending) return;

    setSending(true);
    setError('');

    try {
      const evidenceFiles: EvidenceFile[] = [];

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const evidenceHash = await sha256(buffer);

        evidenceFiles.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          evidenceHash,
        });
      }

      // Ordenamos los hashes para que el orden de selección
      // de los archivos no cambie la huella del conjunto.
      const sortedHashes = evidenceFiles
        .map((file) => file.evidenceHash)
        .sort();

      const combinedData = new TextEncoder().encode(
        JSON.stringify(sortedHashes)
      );

      const combinedHash = await sha256(combinedData.buffer);

      const newSubmission: EvidenceSubmission = {
        scholarshipId,
        milestoneId,
        files: evidenceFiles,
        combinedHash,
        observations: observations.trim(),
        submittedAt: new Date().toISOString(),
        status: 'under_review',
      };

      saveEvidence(newSubmission);
      setSubmission(newSubmission);
      setFiles([]);
    } catch {
      setError('No se pudieron procesar los documentos.');
    } finally {
      setSending(false);
    }
  };

  if (submission) {
    return (
      <div className="ar-evidence-success">
        <div className="ar-evidence-success-icon">✓</div>

        <div className="ar-evidence-success-content">
          <span className="ar-evidence-review-badge">
            En revisión
          </span>

          <h4>Documentación presentada</h4>

          <p>
            Has presentado {submission.files.length}{' '}
            {submission.files.length === 1 ? 'documento' : 'documentos'}{' '}
            para <strong>{milestoneTitle}</strong>.
          </p>

          <div className="ar-evidence-submitted-list">
            {submission.files.map((file) => (
              <div className="ar-evidence-submitted-file" key={file.id}>
                <span>📄</span>
                <div>
                  <strong>{file.fileName}</strong>
                  <small>{formatSize(file.fileSize)}</small>
                </div>
                <span className="ar-evidence-file-check">✓</span>
              </div>
            ))}
          </div>

          <p className="ar-evidence-submission-date">
            Enviado el{' '}
            {new Date(submission.submittedAt).toLocaleString('es-ES')}
          </p>

          {submission.observations && (
            <div className="ar-evidence-observations">
              <strong>Observaciones</strong>
              <p>{submission.observations}</p>
            </div>
          )}

          <small className="ar-evidence-demo-note">
            Demo local: los documentos todavía no se han almacenado
            en el servidor ni enviado al verificador.
          </small>
        </div>
      </div>
    );
  }

  return (
    <form className="ar-evidence-form" onSubmit={handleSubmit}>
      <div className="ar-evidence-form-heading">
        <div className="ar-evidence-form-icon">📄</div>
        <div>
          <h4>Presentar evidencias</h4>
          <p>
            Adjunta los documentos que acreditan el cumplimiento
            de este hito.
          </p>
        </div>
      </div>

      <label className="ar-evidence-upload-area">
        <span className="ar-evidence-upload-icon">☁</span>

        <strong>Seleccionar uno o varios documentos</strong>

        <small>
          PDF, JPG o PNG · Máximo 10 MB por archivo
        </small>

        <small>Hasta {MAX_FILES} documentos por hito</small>

        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          onChange={handleFileChange}
          disabled={sending || files.length >= MAX_FILES}
        />
      </label>

      {files.length > 0 && (
        <div className="ar-evidence-selected">
          <div className="ar-evidence-selected-heading">
            <strong>Documentos seleccionados</strong>
            <span>{files.length}/{MAX_FILES}</span>
          </div>

          <div className="ar-evidence-selected-list">
            {files.map((file, index) => (
              <div
                className="ar-evidence-selected-file"
                key={`${file.name}-${file.size}-${file.lastModified}`}
              >
                <span className="ar-evidence-file-icon">📄</span>

                <div className="ar-evidence-file-info">
                  <strong>{file.name}</strong>
                  <small>{formatSize(file.size)}</small>
                </div>

                <button
                  type="button"
                  className="ar-evidence-remove"
                  onClick={() => removeFile(index)}
                  disabled={sending}
                  aria-label={`Eliminar ${file.name}`}
                  title="Eliminar documento"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="ar-evidence-field">
        <span>Observaciones para el verificador</span>

        <textarea
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
          placeholder="Ej.: Adjunto el certificado de notas, la matrícula y el informe académico..."
          rows={4}
          maxLength={1000}
          disabled={sending}
        />
      </label>

      {error && (
        <p className="ar-evidence-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="ar-evidence-submit"
        disabled={files.length === 0 || sending}
      >
        {sending
          ? 'Procesando documentos...'
          : `Enviar ${files.length} ${
              files.length === 1 ? 'documento' : 'documentos'
            } para revisión →`}
      </button>

      <p className="ar-evidence-privacy">
        🔒 Los documentos no se publican en Stellar.
        Se calcula su huella digital SHA-256 para esta demostración.
      </p>
    </form>
  );
}

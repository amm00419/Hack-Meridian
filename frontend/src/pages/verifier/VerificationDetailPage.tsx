
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  getAddress,
  getNetwork,
  requestAccess,
} from '@stellar/freighter-api';
import { supabase } from '../../services/supabase';
import './VerificationDetailPage.css';

type ScholarshipRow = {
  id: string;
  titulo: string;
  institucion: string;
  moneda: string;
  verificador_addr: string;
};

type MilestoneRow = {
  id: number;
  indice: number;
  titulo: string;
  descripcion: string | null;
  importe: number | string;
  plazo: number | string;
  estado: string;
  criterios: string[] | null;
  documentos_requeridos: string[] | null;
  instrucciones_verificador: string | null;
};

type SubmissionRow = {
  id: string;
  observaciones: string | null;
  hash_conjunto: string;
  creado_en: string;
};

type EvidenceRow = {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  sha256: string;
  ruta_storage: string;
};

type ReviewRow = {
  decision: 'approved' | 'correction_requested';
  comentario: string | null;
  tx_hash: string | null;
  creado_en: string;
};

type Detail = {
  scholarship: ScholarshipRow;
  milestone: MilestoneRow;
  submission: SubmissionRow | null;
  evidence: EvidenceRow[];
  review: ReviewRow | null;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatSize = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export default function VerificationDetailPage() {
  const { id, milestoneId } = useParams<{
    id: string;
    milestoneId: string;
  }>();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        if (
          !id ||
          !milestoneId ||
          !Number.isInteger(Number(milestoneId)) ||
          Number(milestoneId) < 1
        ) {
          throw new Error('La ruta de la solicitud no es válida.');
        }

        const network = await getNetwork();

        if (network.error || network.network !== 'TESTNET') {
          throw new Error('Selecciona Testnet en Freighter.');
        }

        let wallet = await getAddress();

        if (wallet.error || !wallet.address) {
          wallet = await requestAccess();
        }

        if (wallet.error || !wallet.address) {
          throw new Error(
            'Autoriza AidRelease en Freighter para revisar solicitudes.'
          );
        }

        const verifier = wallet.address;

        const {
          data: scholarship,
          error: scholarshipError,
        } = await supabase
          .from('becas')
          .select(
            'id,titulo,institucion,moneda,verificador_addr'
          )
          .eq('id', id)
          .single();

        if (scholarshipError || !scholarship) {
          throw new Error('Beca no encontrada en Supabase.');
        }

        if (scholarship.verificador_addr !== verifier) {
          throw new Error(
            'Esta beca no está asignada a la billetera verificadora conectada.'
          );
        }

        // Las rutas de React empiezan en 1.
        // Los índices de hitos en SQL empiezan en 0.
        const {
          data: milestone,
          error: milestoneError,
        } = await supabase
          .from('hitos')
          .select(
            'id,indice,titulo,descripcion,importe,plazo,estado,criterios,documentos_requeridos,instrucciones_verificador'
          )
          .eq('beca_id', id)
          .eq('indice', Number(milestoneId) - 1)
          .single();

        if (milestoneError || !milestone) {
          throw new Error('Hito no encontrado en Supabase.');
        }

        const {
          data: submission,
          error: submissionError,
        } = await supabase
          .from('presentaciones')
          .select(
            'id,observaciones,hash_conjunto,creado_en'
          )
          .eq('hito_id', milestone.id)
          .order('creado_en', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (submissionError) {
          throw new Error(submissionError.message);
        }

        let evidence: EvidenceRow[] = [];
        let review: ReviewRow | null = null;

        if (submission) {
          const {
            data: files,
            error: filesError,
          } = await supabase
            .from('evidencias')
            .select(
              'id,nombre,mime,tamano,sha256,ruta_storage'
            )
            .eq('presentacion_id', submission.id);

          if (filesError) {
            throw new Error(filesError.message);
          }

          evidence = (files ?? []) as EvidenceRow[];

          const {
            data: latestReview,
            error: reviewError,
          } = await supabase
            .from('revisiones')
            .select(
              'decision,comentario,tx_hash,creado_en'
            )
            .eq('presentacion_id', submission.id)
            .order('creado_en', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (reviewError) {
            throw new Error(reviewError.message);
          }

          review = latestReview as ReviewRow | null;
        }

        if (!cancelled) {
          setAddress(verifier);

          setDetail({
            scholarship: scholarship as ScholarshipRow,
            milestone: milestone as MilestoneRow,
            submission: submission as SubmissionRow | null,
            evidence,
            review,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo cargar la solicitud.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, milestoneId]);

  async function openEvidence(file: EvidenceRow) {
    setError('');

    const { data, error: urlError } =
      await supabase.storage
        .from('evidencias')
        .createSignedUrl(file.ruta_storage, 60);

    if (urlError || !data?.signedUrl) {
      setError(
        `No se pudo abrir ${file.nombre}: ${
          urlError?.message ?? 'URL no disponible'
        }`
      );
      return;
    }

    window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer'
    );
  }

  async function requestCorrections() {
    if (
      !detail?.submission ||
      !address ||
      saving ||
      detail.review
    ) {
      return;
    }

    if (!comment.trim()) {
      setError(
        'Explica qué debe corregir el estudiante.'
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('revisiones')
        .insert({
          presentacion_id: detail.submission.id,
          verificador_addr: address,
          decision: 'correction_requested',
          comentario: comment.trim(),
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      const { error: updateError } = await supabase
        .from('hitos')
        .update({
          estado: 'correction_requested',
        })
        .eq('id', detail.milestone.id)
        .eq('estado', 'submitted');

      if (updateError) {
        throw new Error(updateError.message);
      }

      setDetail((previous) =>
        previous
          ? {
              ...previous,
              milestone: {
                ...previous.milestone,
                estado: 'correction_requested',
              },
              review: {
                decision: 'correction_requested',
                comentario: comment.trim(),
                tx_hash: null,
                creado_en: new Date().toISOString(),
              },
            }
          : previous
      );

      setMessage(
        'Correcciones registradas en Supabase.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la revisión.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="vr-dashboard">
        <p>Cargando solicitud desde Supabase...</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="vr-dashboard">
        <Link
          to="/verifier"
          className="vr-back-link"
        >
          ← Volver al panel del verificador
        </Link>

        <h1>No se pudo cargar la solicitud</h1>

        <p role="alert">{error}</p>
      </main>
    );
  }

  const {
    scholarship,
    milestone,
    submission,
    evidence,
    review,
  } = detail;

  const amount =
    Number(milestone.importe) / 10_000_000;

  const status =
    review?.decision === 'correction_requested'
      ? 'Correcciones solicitadas'
      : review?.decision === 'approved'
        ? 'Aprobada'
        : milestone.estado === 'paid'
          ? 'Pagado'
          : 'Pendiente';

  const criteria = Array.isArray(milestone.criterios)
    ? milestone.criterios
    : [];

  const required = Array.isArray(
    milestone.documentos_requeridos
  )
    ? milestone.documentos_requeridos
    : [];

  return (
    <main className="vr-dashboard">
      <Link
        to="/verifier"
        className="vr-back-link"
      >
        ← Volver a solicitudes
      </Link>

      <header className="vr-header">
        <div>
          <span className="vr-eyebrow">
            AIDRELEASE / VERIFICACIÓN
          </span>

          <h1>Revisión de evidencias</h1>

          <p>
            Comprueba la documentación y las condiciones
            del hito antes de tomar una decisión.
          </p>
        </div>

        <span className="vr-network">
          ● Stellar Testnet
        </span>
      </header>

      <section className="vr-hero">
        <div>
          <span className="vr-hero-label">
            SOLICITUD DE VERIFICACIÓN
          </span>

          <h2>{milestone.titulo}</h2>

          <p>{scholarship.titulo}</p>

          <small>
            {scholarship.institucion} · {scholarship.id}
          </small>
        </div>

        <div className="vr-hero-amount">
          <span>Importe del hito</span>

          <strong>
            {amount.toLocaleString('es-ES')}
          </strong>

          <span>{scholarship.moneda}</span>
        </div>
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>Información de la solicitud</h2>
            <p>
              Datos principales del hito que debes revisar.
            </p>
          </div>

          <span className="vr-badge vr-badge-pending">
            {status}
          </span>
        </div>

        <div className="vr-info-grid">
          <div>
            <span>Beca</span>
            <strong>{scholarship.titulo}</strong>
          </div>

          <div>
            <span>Hito</span>
            <strong>{milestone.titulo}</strong>
          </div>

          <div>
            <span>Fecha límite</span>
            <strong>
              {formatDate(
                new Date(
                  Number(milestone.plazo) * 1000
                ).toISOString()
              )}
            </strong>
          </div>

          <div>
            <span>Importe a liberar</span>
            <strong>
              {amount.toLocaleString('es-ES')}{' '}
              {scholarship.moneda}
            </strong>
          </div>
        </div>
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>📖 Guía de verificación</h2>
            <p>
              Requisitos establecidos para aprobar
              este objetivo.
            </p>
          </div>
        </div>

        <div className="vr-guide-section">
          <h3>Descripción del objetivo</h3>
          <p>
            {milestone.descripcion || 'Sin descripción.'}
          </p>
        </div>

        <div className="vr-guide-section">
          <h3>Condiciones para aprobar el hito</h3>

          {criteria.length ? (
            <ul className="vr-criteria-list">
              {criteria.map((criterion, index) => (
                <li key={index}>
                  <span>✓</span>
                  {criterion}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No hay criterios adicionales registrados.
            </p>
          )}
        </div>

        <div className="vr-guide-section">
          <h3>Documentación requerida</h3>

          {required.length ? (
            <ul className="vr-documents-list">
              {required.map((document, index) => (
                <li key={index}>
                  📄 {document}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No se han especificado documentos obligatorios.
            </p>
          )}
        </div>

        {milestone.instrucciones_verificador && (
          <div className="vr-instructions">
            <strong>
              ℹ️ Instrucciones del donante
            </strong>

            <p>
              {milestone.instrucciones_verificador}
            </p>
          </div>
        )}
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>📁 Evidencias del estudiante</h2>
            <p>
              Documentos y observaciones presentados
              para este hito.
            </p>
          </div>
        </div>

        {!submission ? (
          <div className="vr-empty-evidence">
            <span>📂</span>

            <h3>Sin documentación presentada</h3>

            <p>
              El estudiante todavía no ha enviado
              evidencias para este hito.
            </p>
          </div>
        ) : (
          <div className="vr-guide-section">
            <p>
              <strong>Presentado el:</strong>{' '}
              {new Date(
                submission.creado_en
              ).toLocaleString('es-ES')}
            </p>

            <p>
              <strong>Observaciones:</strong>{' '}
              {submission.observaciones ||
                'Sin observaciones.'}
            </p>

            <p>
              <strong>
                Hash conjunto SHA-256:
              </strong>{' '}
              <code
                style={{
                  overflowWrap: 'anywhere',
                }}
              >
                {submission.hash_conjunto}
              </code>
            </p>

            <h3>
              Documentos ({evidence.length})
            </h3>

            {evidence.map((file) => (
              <div
                key={file.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #ddd',
                }}
              >
                <p>
                  📄 <strong>{file.nombre}</strong>
                  {' · '}
                  {formatSize(Number(file.tamano))}
                </p>

                <p
                  style={{
                    overflowWrap: 'anywhere',
                    fontSize: '0.85rem',
                  }}
                >
                  SHA-256:{' '}
                  <code>{file.sha256}</code>
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void openEvidence(file)
                  }
                >
                  Abrir documento ↗
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>Evaluación del verificador</h2>
            <p>
              Revisa las condiciones antes de
              aprobar el hito.
            </p>
          </div>
        </div>

        {review ? (
          <div className="vr-guide-section">
            <strong>
              {review.decision === 'approved'
                ? 'Hito aprobado'
                : 'Correcciones solicitadas'}
            </strong>

            <p>
              {review.comentario ||
                'Sin comentario.'}
            </p>

            <small>
              {new Date(
                review.creado_en
              ).toLocaleString('es-ES')}
            </small>
          </div>
        ) : (
          <>
            <label
              style={{
                display: 'block',
                marginBottom: 16,
              }}
            >
              <strong>
                Observaciones de la revisión
              </strong>

              <textarea
                value={comment}
                onChange={(event) =>
                  setComment(event.target.value)
                }
                placeholder="Indica qué documentos o condiciones debe corregir el estudiante..."
                maxLength={1000}
                rows={4}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 8,
                  padding: 12,
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <div className="vr-review-actions">
              <button
                type="button"
                className="vr-approve-button"
                disabled
                title="Pendiente de integrar la firma del contrato Soroban"
              >
                ✓ Aprobar hito
              </button>

              <button
                type="button"
                className="vr-correction-button"
                disabled={
                  !submission ||
                  saving ||
                  milestone.estado !== 'submitted'
                }
                onClick={() =>
                  void requestCorrections()
                }
              >
                {saving
                  ? 'Guardando...'
                  : '↻ Solicitar correcciones'}
              </button>
            </div>

            <p className="vr-action-note">
              La aprobación requiere una transacción
              válida del contrato Soroban. La solicitud
              de correcciones se registra en Supabase
              (demo).
            </p>
          </>
        )}

        {error && (
          <p
            role="alert"
            style={{ color: '#b91c1c' }}
          >
            {error}
          </p>
        )}

        {message && (
          <p role="status">
            {message}
          </p>
        )}
      </section>

      <footer className="vr-footer">
        AidRelease · Verificación de hitos ·
        Supabase (demo)
      </footer>
    </main>
  );
}

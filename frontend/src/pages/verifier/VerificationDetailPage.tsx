
import { Link, useParams } from 'react-router-dom';
import { mockScholarships } from '../../services/mockScholarships';
import './VerificationDetailPage.css';

export default function VerificationDetailPage() {
  const { id, milestoneId } = useParams<{
    id: string;
    milestoneId: string;
  }>();

  const scholarship = mockScholarships.find((item) => item.id === id);

  const milestone = scholarship?.milestones.find(
    (item) => item.id === Number(milestoneId)
  );

  if (!scholarship || !milestone) {
    return (
      <main className="vr-dashboard">
        <Link to="/verifier" className="vr-back-link">
          ← Volver al panel del verificador
        </Link>
        <h1>Solicitud no encontrada</h1>
      </main>
    );
  }

  const formatDate = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <main className="vr-dashboard">
      <Link to="/verifier" className="vr-back-link">
        ← Volver a solicitudes
      </Link>

      <header className="vr-header">
        <div>
          <span className="vr-eyebrow">AIDRELEASE / VERIFICACIÓN</span>
          <h1>Revisión de evidencias</h1>
          <p>
            Comprueba la documentación y las condiciones del hito
            antes de tomar una decisión.
          </p>
        </div>

        <span className="vr-network">● Stellar Testnet</span>
      </header>

      <section className="vr-hero">
        <div>
          <span className="vr-hero-label">SOLICITUD DE VERIFICACIÓN</span>
          <h2>{milestone.title}</h2>
          <p>{scholarship.title}</p>
          <small>{scholarship.institution} · {scholarship.id}</small>
        </div>

        <div className="vr-hero-amount">
          <span>Importe del hito</span>
          <strong>{milestone.amount.toLocaleString('es-ES')}</strong>
          <span>{scholarship.currency}</span>
        </div>
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>Información de la solicitud</h2>
            <p>Datos principales del hito que debes revisar.</p>
          </div>
          <span className="vr-badge vr-badge-pending">Pendiente</span>
        </div>

        <div className="vr-info-grid">
          <div>
            <span>Beca</span>
            <strong>{scholarship.title}</strong>
          </div>
          <div>
            <span>Hito</span>
            <strong>{milestone.title}</strong>
          </div>
          <div>
            <span>Fecha límite</span>
            <strong>{formatDate(milestone.deadline)}</strong>
          </div>
          <div>
            <span>Importe a liberar</span>
            <strong>
              {milestone.amount} {scholarship.currency}
            </strong>
          </div>
        </div>
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>📖 Guía de verificación</h2>
            <p>
              Requisitos establecidos para aprobar este objetivo.
            </p>
          </div>
        </div>

        <div className="vr-guide-section">
          <h3>Descripción del objetivo</h3>
          <p>{milestone.description}</p>
        </div>

        <div className="vr-guide-section">
          <h3>Condiciones para aprobar el hito</h3>

          {milestone.approvalCriteria?.length ? (
            <ul className="vr-criteria-list">
              {milestone.approvalCriteria.map((criterion, index) => (
                <li key={index}>
                  <span>✓</span>
                  {criterion}
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay criterios adicionales registrados.</p>
          )}
        </div>

        <div className="vr-guide-section">
          <h3>Documentación requerida</h3>

          {milestone.requiredDocuments?.length ? (
            <ul className="vr-documents-list">
              {milestone.requiredDocuments.map((document, index) => (
                <li key={index}>
                  📄 {document}
                </li>
              ))}
            </ul>
          ) : (
            <p>No se han especificado documentos obligatorios.</p>
          )}
        </div>

        {milestone.verifierInstructions && (
          <div className="vr-instructions">
            <strong>ℹ️ Instrucciones del donante</strong>
            <p>{milestone.verifierInstructions}</p>
          </div>
        )}
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>📁 Evidencias del estudiante</h2>
            <p>
              Documentos y observaciones presentados para este hito.
            </p>
          </div>
        </div>

        <div className="vr-empty-evidence">
          <span>📂</span>
          <h3>Integración de documentos pendiente</h3>
          <p>
            Aquí mostraremos los archivos enviados por el estudiante,
            sus observaciones y sus huellas SHA-256.
          </p>
        </div>
      </section>

      <section className="vr-content-card">
        <div className="vr-section-heading">
          <div>
            <h2>Evaluación del verificador</h2>
            <p>
              Revisa las condiciones antes de aprobar el hito.
            </p>
          </div>
        </div>

        <div className="vr-review-actions">
          <button type="button" className="vr-approve-button" disabled>
            ✓ Aprobar hito
          </button>

          <button type="button" className="vr-correction-button" disabled>
            ↻ Solicitar correcciones
          </button>
        </div>

        <p className="vr-action-note">
          Las acciones se habilitarán cuando conectemos las
          evidencias y el sistema de revisión.
        </p>
      </section>

      <footer className="vr-footer">
        AidRelease · Verificación de hitos · Datos de demostración
      </footer>
    </main>
  );
}

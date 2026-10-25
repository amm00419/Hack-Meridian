import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  mockVerifications,
  verificationLabels,
  type VerificationStatus,
} from '../../services/mockVerifications';
import './VerifierPage.css';

type Filter = 'all' | VerificationStatus;

export default function VerifierPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const pending = mockVerifications.filter(
    (item) => item.status === 'pending'
  ).length;

  const approved = mockVerifications.filter(
    (item) => item.status === 'approved'
  ).length;

  const corrections = mockVerifications.filter(
    (item) => item.status === 'corrections'
  ).length;

  const filteredVerifications = mockVerifications.filter(
    (item) => filter === 'all' || item.status === filter
  );

  const formatDate = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <main className="verifier-dashboard">
      <header className="verifier-header">
        <div>
          <span className="verifier-eyebrow">
            AIDRELEASE / VERIFICADOR
          </span>
          <h1>Centro de verificación</h1>
          <p>
            Revisa las evidencias académicas y supervisa
            los hitos de las ayudas.
          </p>
        </div>

        <span className="verifier-network">
          ● Stellar Testnet
        </span>
      </header>

      <section className="verifier-stats">
        <article className="verifier-stat verifier-stat-pending">
          <span>Por revisar</span>
          <strong>{pending}</strong>
          <small>Solicitudes pendientes</small>
        </article>

        <article className="verifier-stat verifier-stat-approved">
          <span>Aprobados</span>
          <strong>{approved}</strong>
          <small>Hitos validados</small>
        </article>

        <article className="verifier-stat verifier-stat-corrections">
          <span>Correcciones</span>
          <strong>{corrections}</strong>
          <small>Documentación por completar</small>
        </article>
      </section>

      <section className="verifier-content">
        <div className="verifier-section-header">
          <div>
            <h2>Solicitudes de verificación</h2>
            <p>
              Consulta las entregas realizadas por los estudiantes.
            </p>
          </div>
          <span className="verifier-total">
            {filteredVerifications.length} solicitudes
          </span>
        </div>

        <div className="verifier-filters">
          {([
            ['all', 'Todas'],
            ['pending', 'Pendientes'],
            ['approved', 'Aprobadas'],
            ['corrections', 'Correcciones'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`verifier-filter ${
                filter === value ? 'verifier-filter-active' : ''
              }`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="verifier-request-list">
          {filteredVerifications.map((verification) => (
            <Link
              key={verification.id}
              to={`/verifier/review/${verification.scholarshipId}/${verification.milestoneId}`}
              className="verifier-request vr-request-link"
              aria-label={`Revisar ${verification.milestoneTitle} de ${verification.scholarshipTitle}`}
            >
            
              <div className="verifier-request-main">
                <span className="verifier-request-icon">📋</span>

                <div>
                  <h3>{verification.scholarshipTitle}</h3>
                  <p>{verification.studentName}</p>
                  <small>
                    Hito: {verification.milestoneTitle}
                  </small>
                </div>
              </div>

              <div className="verifier-request-meta">
                <div>
                  <span>Documentos</span>
                  <strong>{verification.documents}</strong>
                </div>

                <div>
                  <span>Fecha de entrega</span>
                  <strong>
                    {formatDate(verification.submittedAt)}
                  </strong>
                </div>

                <div>
                  <span>Importe</span>
                  <strong>
                    {verification.amount} {verification.currency}
                  </strong>
                </div>
              </div>

              <div className="verifier-request-actions">
                <span
                  className={`verifier-status verifier-status-${verification.status}`}
                >
                  {verificationLabels[verification.status]}
                </span>

                <span className="verifier-review-placeholder">
                  {verification.status === 'pending'
                    ? 'Revisar solicitud →'
                    : 'Consultar solicitud →'}
                </span>
              </div>
            </Link>
          ))}

          {filteredVerifications.length === 0 && (
            <p className="verifier-empty">
              No hay solicitudes en esta categoría.
            </p>
          )}
        </div>
      </section>

      <footer className="verifier-footer">
        AidRelease · Panel del verificador · Datos de demostración
      </footer>
    </main>
  );
}

import { Link, useParams } from 'react-router-dom';
import {
  mockScholarships,
  getPaidAmount,
  type MilestoneStatus,
  type Scholarship,
} from '../../services/mockScholarships';
import './ScholarshipDetailPage.css';
import EvidenceUpload from '../../components/EvidenceUpload';

const statusLabels = {
  active: 'BECA ACTIVA',
  completed: 'BECA COMPLETADA',
  failed: 'FINALIZADA POR INCUMPLIMIENTO',
};

const milestoneLabels: Record<MilestoneStatus, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  locked: 'Bloqueado',
};

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('es-ES').format(amount);

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Información adicional para la demostración.
// Después se obtendrá de la API y del contrato.
const scholarshipInformation: Record<
  string,
  {
    description: string;
    requirements: string[];
    verifier: string;
  }
> = {
  'SCH-2026-001': {
    description:
      'Ayuda destinada a financiar gastos académicos durante el curso universitario. El importe se libera progresivamente conforme el estudiante acredita los objetivos establecidos.',
    requirements: [
      'Mantener la matrícula universitaria activa.',
      'Presentar las evidencias académicas antes de cada fecha límite.',
      'Superar los hitos establecidos en el acuerdo de financiación.',
    ],
    verifier: 'Entidad verificadora AidRelease',
  },
  'SCH-2026-002': {
    description:
      'Programa de financiación para estudiantes que desarrollan proyectos de investigación en inteligencia artificial.',
    requirements: [
      'Presentar los resultados de investigación previstos.',
      'Entregar los prototipos y documentos requeridos.',
      'Cumplir los plazos establecidos para cada hito.',
    ],
    verifier: 'Comité académico de investigación',
  },
  'SCH-2025-003': {
    description:
      'Ayuda de movilidad académica destinada a cubrir parte de los gastos de una estancia universitaria internacional.',
    requirements: [
      'Acreditar la incorporación a la universidad de destino.',
      'Presentar los informes de seguimiento.',
      'Entregar el certificado final de estancia.',
    ],
    verifier: 'Oficina de Relaciones Internacionales',
  },
  'SCH-2025-004': {
    description:
      'Programa de reconocimiento del rendimiento académico mediante pagos condicionados al cumplimiento de objetivos.',
    requirements: [
      'Mantener el rendimiento académico exigido.',
      'Presentar los justificantes de seguimiento.',
      'Cumplir los objetivos dentro de los plazos establecidos.',
    ],
    verifier: 'Comité de evaluación académica',
  },
};

function InformationSection({ scholarship }: { scholarship: Scholarship }) {
  const information = scholarshipInformation[scholarship.id];

  if (!information) return null;

  return (
    <section className="beneficiary-content-card">
      <div className="beneficiary-section-heading">
        <div>
          <h2>Información de la ayuda</h2>
          <p>Consulta las condiciones y características de tu beca.</p>
        </div>
        <span className="beneficiary-count">Información</span>
      </div>

      <div className="ar-detail-description">
        <h3>Descripción</h3>
        <p>{information.description}</p>
      </div>

      <div className="ar-detail-info-grid">
        <div className="ar-detail-info-item">
          <span>Organismo financiador</span>
          <strong>{scholarship.institution}</strong>
        </div>

        <div className="ar-detail-info-item">
          <span>Beneficiario</span>
          <strong>Estudiante asignado</strong>
        </div>

        <div className="ar-detail-info-item">
          <span>Fecha de inicio</span>
          <strong>{formatDate(scholarship.startDate)}</strong>
        </div>

        <div className="ar-detail-info-item">
          <span>Fecha de finalización</span>
          <strong>{formatDate(scholarship.endDate)}</strong>
        </div>

        <div className="ar-detail-info-item">
          <span>Entidad verificadora</span>
          <strong>{information.verifier}</strong>
        </div>

        <div className="ar-detail-info-item">
          <span>Red blockchain</span>
          <strong>Stellar Testnet</strong>
        </div>
      </div>

      <div className="ar-detail-requirements">
        <h3>Requisitos y condiciones</h3>

        <ul>
          {information.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function ScholarshipDetailPage() {
  const { id } = useParams<{ id: string }>();

  const scholarship = mockScholarships.find((item) => item.id === id);

  if (!scholarship) {
    return (
      <main className="beneficiary-dashboard">
        <Link to="/beneficiary" className="beneficiary-back-link">
          ← Volver a mis ayudas
        </Link>
        <h1>Ayuda no encontrada</h1>
      </main>
    );
  }

  const paidAmount = getPaidAmount(scholarship);
  const remainingAmount = scholarship.totalAmount - paidAmount;

  const progress =
    scholarship.totalAmount > 0
      ? (paidAmount / scholarship.totalAmount) * 100
      : 0;

  const paidMilestones = scholarship.milestones.filter(
    (milestone) => milestone.status === 'paid'
  );

  const nextMilestone =
    scholarship.status === 'active'
      ? scholarship.milestones.find((milestone) => milestone.status === 'pending')
      : undefined;

  const daysRemaining = nextMilestone
    ? Math.ceil(
        (new Date(`${nextMilestone.deadline}T23:59:59`).getTime() -
          Date.now()) /
          86400000
      )
    : null;

  return (
    <main className="beneficiary-dashboard">
      {/* VOLVER AL DASHBOARD */}
      <Link to="/beneficiary" className="beneficiary-back-link">
        ← Volver a mis ayudas
      </Link>

      {/* CABECERA */}
      <header className="beneficiary-header">
        <div>
          <span className="beneficiary-eyebrow">
            AIDRELEASE / DETALLE DE AYUDA
          </span>

          <h1>Detalles de tu beca</h1>

          <p>
            Consulta tus condiciones, objetivos, fechas y pagos.
          </p>
        </div>
      </header>

      {/* TARJETA PRINCIPAL */}
      <section className="beneficiary-hero">
        <div>
          <span className="beneficiary-hero-label">
            {statusLabels[scholarship.status]}
          </span>

          <h2>{scholarship.title}</h2>
          <p>{scholarship.institution}</p>

          <span className="beneficiary-id">
            ID: {scholarship.id}
          </span>
        </div>

        <div className="beneficiary-hero-amount">
          <span>Importe concedido</span>
          <strong>{formatAmount(scholarship.totalAmount)}</strong>
          <span>{scholarship.currency}</span>
        </div>
      </section>

      {/* RESUMEN ECONÓMICO */}
      <section className="beneficiary-stats">
        <article className="beneficiary-stat-card">
          <span>Importe recibido</span>
          <strong>{formatAmount(paidAmount)}</strong>
          <small>{scholarship.currency} desembolsados</small>
        </article>

        <article className="beneficiary-stat-card">
          <span>
            {scholarship.status === 'active'
              ? 'Importe pendiente'
              : 'Importe no recibido'}
          </span>

          <strong>{formatAmount(remainingAmount)}</strong>

          <small>
            {scholarship.status === 'active'
              ? `${scholarship.currency} por liberar`
              : `${scholarship.currency} no desembolsados`}
          </small>
        </article>

        <article className="beneficiary-stat-card">
          <span>Hitos completados</span>

          <strong>
            {paidMilestones.length}
            <span className="beneficiary-stat-total">
              /{scholarship.milestones.length}
            </span>
          </strong>

          <small>Objetivos alcanzados</small>
        </article>
      </section>

      {/* PROGRESO */}
      <section className="beneficiary-content-card">
        <div className="beneficiary-section-heading">
          <div>
            <h2>Progreso de tu beca</h2>
            <p>Porcentaje del importe total que has recibido.</p>
          </div>

          <strong>{progress.toFixed(0)}%</strong>
        </div>

        <div
          className="beneficiary-progress-track"
          role="progressbar"
          aria-label="Progreso de la beca"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="beneficiary-progress-footer">
          <span>Inicio: {formatDate(scholarship.startDate)}</span>
          <span>Fin: {formatDate(scholarship.endDate)}</span>
        </div>
      </section>

      {/* INFORMACIÓN GENERAL */}
      <InformationSection scholarship={scholarship} />

      {/* AVISO DE INCUMPLIMIENTO */}
      {scholarship.status === 'failed' && (
        <section className="beneficiary-failed-notice">
          <strong>✕ Ayuda finalizada por incumplimiento</strong>
          <p>
            No se completaron todos los hitos establecidos.
            Los importes ya recibidos se mantienen, pero el
            saldo restante no se desembolsará.
          </p>
        </section>
      )}

      {/* PRÓXIMO HITO DESTACADO */}
      {nextMilestone && (
        <section className="beneficiary-content-card">
          <div className="beneficiary-section-heading">
            <div>
              <h2>Tu próximo hito</h2>
              <p>Este es el siguiente objetivo que debes completar.</p>
            </div>

            <span className="ar-detail-pending-badge">
              Pendiente
            </span>
          </div>

          <div className="ar-detail-next-milestone">
            <div className="ar-detail-next-main">
              <div>
                <span className="ar-detail-next-label">
                  PRÓXIMO OBJETIVO
                </span>

                <h3>{nextMilestone.title}</h3>
                <p>{nextMilestone.description}</p>
              </div>

              <div className="ar-detail-next-amount">
                <strong>{formatAmount(nextMilestone.amount)}</strong>
                <span>{scholarship.currency}</span>
              </div>
            </div>

            <div className="ar-detail-next-footer">
              <div>
                <span>Fecha límite</span>
                <strong>{formatDate(nextMilestone.deadline)}</strong>
              </div>

              <div>
                <span>Tiempo restante</span>
                <strong>
                  {daysRemaining !== null && daysRemaining > 0
                    ? `${daysRemaining} días`
                    : 'Plazo vencido'}
                </strong>
              </div>
            </div>

            <EvidenceUpload
              key={`${scholarship.id}-${nextMilestone.id}`}
              scholarshipId={scholarship.id}
              milestoneId={nextMilestone.id}
              milestoneTitle={nextMilestone.title}
            />
          </div>
        </section>
      )}

      {/* TODOS LOS HITOS */}
      <section className="beneficiary-content-card">
        <div className="beneficiary-section-heading">
          <div>
            <h2>Mis hitos académicos</h2>
            <p>
              Consulta todos los objetivos y los próximos pagos.
            </p>
          </div>

          <span className="beneficiary-count">
            {scholarship.milestones.length} hitos
          </span>
        </div>

        <div className="beneficiary-milestone-list">
          {scholarship.milestones.map((milestone) => (
            <article
              className={`beneficiary-milestone beneficiary-milestone--${milestone.status}`}
              key={milestone.id}
            >
              <div className="beneficiary-milestone-number">
                {milestone.status === 'paid'
                  ? '✓'
                  : milestone.id}
              </div>

              <div className="beneficiary-milestone-info">
                <h3>{milestone.title}</h3>
                <p>{milestone.description}</p>

                <small>
                  Fecha límite: {formatDate(milestone.deadline)}
                </small>
              </div>

              <div className="beneficiary-milestone-right">
                <strong>
                  {formatAmount(milestone.amount)}{' '}
                  {scholarship.currency}
                </strong>

                <span
                  className={`beneficiary-status beneficiary-status--${milestone.status}`}
                >
                  {scholarship.status === 'failed' &&
                  milestone.status !== 'paid'
                    ? 'No desembolsado'
                    : milestoneLabels[milestone.status]}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* HISTORIAL DE PAGOS */}
      <section className="beneficiary-content-card">
        <div className="beneficiary-section-heading">
          <div>
            <h2>Historial de pagos</h2>
            <p>Importes recibidos por cada objetivo aprobado.</p>
          </div>

          <span className="beneficiary-count">
            {paidMilestones.length} pagos
          </span>
        </div>

        {paidMilestones.length === 0 ? (
          <p className="ar-detail-empty">
            Todavía no se han registrado pagos.
          </p>
        ) : (
          <div className="ar-detail-payment-list">
            {paidMilestones.map((milestone) => (
              <div className="ar-detail-payment" key={milestone.id}>
                <div className="ar-detail-payment-icon">✓</div>

                <div className="ar-detail-payment-info">
                  <strong>{milestone.title}</strong>
                  <span>
                    Pago asociado al hito {milestone.id}
                  </span>
                </div>

                <div className="ar-detail-payment-amount">
                  <strong>
                    +{formatAmount(milestone.amount)}{' '}
                    {scholarship.currency}
                  </strong>
                  <span>Pagado · Demo</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="ar-detail-blockchain-note">
          Las fechas y los enlaces a las transacciones reales
          aparecerán cuando integremos el contrato Soroban.
        </p>
      </section>

      {/* INFORMACIÓN BLOCKCHAIN */}
      <section className="beneficiary-content-card">
        <div className="beneficiary-section-heading">
          <div>
            <h2>Información blockchain</h2>
            <p>Transparencia y seguimiento de la financiación.</p>
          </div>

          <span className="beneficiary-count">
            Stellar Testnet
          </span>
        </div>

        <div className="ar-detail-info-grid">
          <div className="ar-detail-info-item">
            <span>Red</span>
            <strong>Stellar Testnet</strong>
          </div>

          <div className="ar-detail-info-item">
            <span>Activo de demostración</span>
            <strong>{scholarship.currency}</strong>
          </div>

          <div className="ar-detail-info-item">
            <span>Contrato de la beca</span>
            <strong>Pendiente de despliegue</strong>
          </div>

          <div className="ar-detail-info-item">
            <span>Estado de integración</span>
            <strong>Datos simulados</strong>
          </div>
        </div>

        <p className="ar-detail-blockchain-note">
          Esta pantalla utiliza información ficticia.
          Los contratos y transacciones reales de Testnet
          se incorporarán cuando estén disponibles.
        </p>
      </section>

      <footer className="beneficiary-footer">
        AidRelease · Plataforma de becas por hitos · Datos de demostración
      </footer>
    </main>
  );
}

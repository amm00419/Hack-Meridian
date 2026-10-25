import { Link } from 'react-router-dom';
import {
  mockScholarships,
  getPaidAmount,
  type Scholarship,
} from '../../services/mockScholarships';
import './BeneficiaryPage.css';


function ScholarshipCard({ scholarship }: { scholarship: Scholarship }) {
  // Calcular los importes de la ayuda
  const paid = getPaidAmount(scholarship);

  const progress =
    scholarship.totalAmount > 0
      ? Math.round((paid / scholarship.totalAmount) * 100)
      : 0;

  const remaining = scholarship.totalAmount - paid;

  // Buscar el siguiente hito pendiente
  const nextMilestone = scholarship.milestones.find(
    (milestone) => milestone.status === 'pending'
  );

  // Formatear los importes
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('es-ES').format(amount);

  // Calcular los días restantes hasta el siguiente hito
  const daysRemaining = nextMilestone
    ? Math.ceil(
        (new Date(`${nextMilestone.deadline}T23:59:59`).getTime() -
          Date.now()) /
          86400000
      )
    : null;

  // Texto del estado de la ayuda
  const statusText = {
    active: 'En curso',
    completed: 'Completada',
    failed: 'No recibida',
  }[scholarship.status];

  return (
    <Link
      to={`/beneficiary/scholarship/${scholarship.id}`}
      className={`ar-scholarship-card ar-card-${scholarship.status}`}
      aria-label={`Ver detalles de ${scholarship.title}`}
    >
      {/* CABECERA DE LA TARJETA */}
      <div className="ar-card-heading">
        <div className="ar-card-title-group">
          <span className="ar-scholarship-icon">
            {scholarship.status === 'failed' ? '✕' : '✦'}
          </span>

          <div>
            <h3>{scholarship.title}</h3>
            <p>
              {scholarship.institution} · {scholarship.id}
            </p>
          </div>
        </div>

        <span
          className={`ar-scholarship-badge ar-badge-${scholarship.status}`}
        >
          {statusText}
        </span>
      </div>

      {/* PROGRESO E IMPORTES */}
      <div className="ar-card-finances">
        <div
          className="ar-progress-ring"
          style={{
            background: `conic-gradient(${
              scholarship.status === 'failed' ? '#f06464' : '#00a88f'
            } ${progress}%, #e8eff3 ${progress}%)`,
          }}
        >
          <div>
            <strong>{progress}%</strong>
            <small>Progreso</small>
          </div>
        </div>

        <div className="ar-finance-stat">
          <span>Total</span>
          <strong>{formatAmount(scholarship.totalAmount)}</strong>
          <small>{scholarship.currency}</small>
        </div>

        <div className="ar-finance-stat">
          <span>Recibido</span>
          <strong>{formatAmount(paid)}</strong>
          <small>{scholarship.currency}</small>
        </div>

        {scholarship.status === 'active' && (
          <div className="ar-finance-stat">
            <span>Pendiente</span>
            <strong>{formatAmount(remaining)}</strong>
            <small>{scholarship.currency}</small>
          </div>
        )}
      </div>

      {/* PRÓXIMO HITO DE LAS AYUDAS ACTIVAS */}
      {scholarship.status === 'active' && nextMilestone && (
        <div className="ar-next-milestone">
          <div className="ar-next-milestone-info">
            <span>⏳</span>

            <div>
              <strong>Próximo hito: {nextMilestone.title}</strong>
              <small>{nextMilestone.description}</small>
            </div>
          </div>

          <div className="ar-deadline">
            <strong>
              {daysRemaining !== null && daysRemaining > 0
                ? `${daysRemaining} días`
                : 'Plazo vencido'}
            </strong>

            <small>
              {new Date(
                `${nextMilestone.deadline}T12:00:00`
              ).toLocaleDateString('es-ES')}
            </small>
          </div>
        </div>
      )}

      {/* MENSAJE DE LAS AYUDAS FINALIZADAS */}
      {scholarship.status !== 'active' && (
        <div
          className={`ar-finished-message ar-finished-${scholarship.status}`}
        >
          {scholarship.status === 'completed'
            ? '✓ Finalizada con éxito · Todos los hitos completados'
            : '✕ Finalizada por incumplimiento de hitos'}
        </div>
      )}

      {/* INDICADOR VISUAL PARA ENTRAR EN LA AYUDA */}
      <span className="ar-details-button">
        Ver detalles →
      </span>
    </Link>
  );
}


export default function BeneficiaryPage() {
  const active = mockScholarships.filter((item) => item.status === 'active');
  const finished = mockScholarships.filter(
    (item) => item.status !== 'active'
  );

  const totalReceived = mockScholarships.reduce(
    (sum, item) => sum + getPaidAmount(item),
    0
  );

  return (
    <main className="ar-beneficiary-home">
      <section className="ar-welcome">
        <div>
          <h1>Hola, Adrián 👋</h1>
          <p>
            Consulta el estado de todas tus ayudas y sigue tu progreso académico.
          </p>
        </div>

        <div className="ar-welcome-stats">
          <div>
            <strong>{active.length}</strong>
            <span>Ayudas en curso</span>
          </div>
          <div>
            <strong>{finished.length}</strong>
            <span>Ayudas finalizadas</span>
          </div>
          <div>
            <strong>{totalReceived.toLocaleString('es-ES')}</strong>
            <span>USDCDEMO recibidos</span>
          </div>
        </div>
      </section>

      <section className="ar-aid-section">
        <div className="ar-aid-section-heading">
          <span className="ar-section-icon">⌛</span>
          <div>
            <h2>Ayudas pendientes</h2>
            <p>Ayudas en las que estás trabajando actualmente.</p>
          </div>
        </div>

        <div className="ar-scholarship-grid">
          {active.map((scholarship) => (
            <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
          ))}
        </div>
      </section>

      <section className="ar-aid-section">
        <div className="ar-aid-section-heading">
          <span className="ar-section-icon ar-section-icon-success">✓</span>
          <div>
            <h2>Ayudas finalizadas</h2>
            <p>Ayudas que ya han concluido.</p>
          </div>
        </div>

        <div className="ar-scholarship-grid">
          {finished.map((scholarship) => (
            <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
          ))}
        </div>
      </section>

      <footer className="ar-home-footer">
        AidRelease · Datos simulados para demostración · Stellar Testnet
      </footer>
    </main>
  );
}

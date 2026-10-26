import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAddress, getNetwork } from '@stellar/freighter-api';

import {
  getPaidAmount,
  type Scholarship,
} from '../../services/mockScholarships';

import { getScholarships } from '../../services/scholarshipsService';

import './BeneficiaryPage.css';

// ==========================================
// TARJETA DE BECA
// ==========================================

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

// ==========================================
// PANEL DEL ESTUDIANTE
// ==========================================

export default function BeneficiaryPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Cargar las becas reales desde Supabase
  useEffect(() => {
    let cancelled = false;

    async function loadScholarships() {
      try {
        setLoading(true);
        setError(null);

        // 1. Comprobar que Freighter está en Testnet
        const networkResult = await getNetwork();

        if (networkResult.error) {
          throw new Error(networkResult.error);
        }

        if (networkResult.network !== 'TESTNET') {
          throw new Error(
            'Cambia Freighter a Testnet para consultar tus becas.'
          );
        }

        // 2. Obtener la dirección pública de Freighter
        const addressResult = await getAddress();

        if (addressResult.error || !addressResult.address) {
          throw new Error(
            'Conecta tu billetera Freighter para consultar tus becas.'
          );
        }

        const address = addressResult.address;

        // 3. Consultar las becas asociadas a esa dirección
        const data = await getScholarships(address);

        if (!cancelled) {
          setWalletAddress(address);
          setScholarships(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar las becas.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadScholarships();

    return () => {
      cancelled = true;
    };
  }, []);

  // Separar las ayudas activas de las finalizadas
  const active = scholarships.filter(
    (item) => item.status === 'active'
  );

  const finished = scholarships.filter(
    (item) => item.status !== 'active'
  );

  // Calcular el total recibido
  const totalReceived = scholarships.reduce(
    (sum, item) => sum + getPaidAmount(item),
    0
  );

  // ==========================================
  // ESTADO DE CARGA
  // ==========================================

  if (loading) {
    return (
      <main className="ar-beneficiary-home">
        <section className="ar-welcome">
          <div>
            <h1>Cargando tus becas...</h1>
            <p>
              Consultando Supabase y tu billetera Freighter.
            </p>
          </div>
        </section>
      </main>
    );
  }

  // ==========================================
  // ESTADO DE ERROR
  // ==========================================

  if (error) {
    return (
      <main className="ar-beneficiary-home">
        <section className="ar-welcome">
          <div>
            <h1>No se pudieron cargar tus becas</h1>
            <p role="alert">{error}</p>

            <button
              type="button"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          </div>
        </section>
      </main>
    );
  }

  // ==========================================
  // PANEL PRINCIPAL
  // ==========================================

  return (
    <main className="ar-beneficiary-home">
      {/* CABECERA Y ESTADÍSTICAS */}
      <section className="ar-welcome">
        <div>
          <h1>Hola, estudiante 👋</h1>

          <p>
            Consulta el estado de todas tus ayudas y sigue tu
            progreso académico.
          </p>

          {walletAddress && (
            <p>
              Billetera Freighter:{' '}
              {walletAddress.slice(0, 5)}...
              {walletAddress.slice(-4)} · TESTNET
            </p>
          )}
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
            <strong>
              {totalReceived.toLocaleString('es-ES')}
            </strong>
            <span>USDCDEMO recibidos (demo)</span>
          </div>
        </div>
      </section>

      {/* AYUDAS ACTIVAS */}
      <section className="ar-aid-section">
        <div className="ar-aid-section-heading">
          <span className="ar-section-icon">⌛</span>

          <div>
            <h2>Ayudas pendientes</h2>
            <p>
              Ayudas en las que estás trabajando actualmente.
            </p>
          </div>
        </div>

        <div className="ar-scholarship-grid">
          {active.map((scholarship) => (
            <ScholarshipCard
              key={scholarship.id}
              scholarship={scholarship}
            />
          ))}
        </div>

        {active.length === 0 && (
          <p>
            No tienes ayudas activas asociadas a esta billetera.
          </p>
        )}
      </section>

      {/* AYUDAS FINALIZADAS */}
      <section className="ar-aid-section">
        <div className="ar-aid-section-heading">
          <span className="ar-section-icon ar-section-icon-success">
            ✓
          </span>

          <div>
            <h2>Ayudas finalizadas</h2>
            <p>
              Ayudas que ya han concluido.
            </p>
          </div>
        </div>

        <div className="ar-scholarship-grid">
          {finished.map((scholarship) => (
            <ScholarshipCard
              key={scholarship.id}
              scholarship={scholarship}
            />
          ))}
        </div>

        {finished.length === 0 && (
          <p>No tienes ayudas finalizadas.</p>
        )}
      </section>

      {/* PIE DE PÁGINA */}
      <footer className="ar-home-footer">
        AidRelease · Datos de Supabase para demostración · Stellar Testnet
      </footer>
    </main>
  );
}

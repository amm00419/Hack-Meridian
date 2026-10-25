import { useEffect, useState } from 'react';
import {
  pendingAmount,
  USDCDEMO_SYMBOL,
  type DonorScholarship,
  type NewScholarshipInput,
} from '../../domain/aidrelease';
import { formatUnits, shortAddress } from '../../domain/format';
import {
  createMockDonorService,
  describeError,
  MOCK_DONOR_ADDRESS,
  type DonorService,
} from '../../services/donorService';
import CreateScholarshipForm from './CreateScholarshipForm';
import ScholarshipCard from './ScholarshipCard';
import './DonorPage.css';

// Hoy se usa el servicio simulado. Al integrar el contrato real solo hay que
// cambiar esta línea por la implementación con Freighter y el SDK de Stellar.
const service: DonorService = createMockDonorService();
const DONOR = MOCK_DONOR_ADDRESS;

type Notice = { kind: 'ok' | 'error'; text: string };

const nowSeconds = () => Math.floor(Date.now() / 1000);

export default function DonorPage() {
  const [scholarships, setScholarships] = useState<DonorScholarship[]>([]);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    service
      .listScholarships(DONOR)
      .then((data) => {
        if (cancelled) return;
        setScholarships(data);
        setNow(nowSeconds());
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(describeError(error));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresca la hora para que un hito pase a "Vencido" sin recargar la página.
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function replace(updated: DonorScholarship) {
    setScholarships((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleFund(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const updated = await service.fund(id);
      replace(updated);
      setNotice({
        kind: 'ok',
        text: `Beca «${updated.title}» financiada con ${formatUnits(updated.totalAmount)} ${USDCDEMO_SYMBOL}.`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) });
    } finally {
      setBusyId(null);
      setNow(nowSeconds());
    }
  }

  async function handleRefund(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const { scholarship, refunded } = await service.claimRefund(id);
      replace(scholarship);
      setNotice({
        kind: 'ok',
        text: `Reembolso completado: recuperaste ${formatUnits(refunded)} ${USDCDEMO_SYMBOL} de «${scholarship.title}».`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) });
    } finally {
      setBusyId(null);
      setNow(nowSeconds());
    }
  }

  async function handleCreate(input: NewScholarshipInput) {
    // Si falla, la excepción llega al formulario, que la muestra junto a los campos.
    const created = await service.createScholarship(DONOR, input);
    setScholarships((prev) => [created, ...prev]);
    setShowForm(false);
    setNow(nowSeconds());
    setNotice({
      kind: 'ok',
      text: `Beca «${created.title}» creada. Falta financiarla para que el verificador pueda aprobar hitos.`,
    });
  }

  const active = scholarships.filter((s) => s.status === 'Active');
  const inContract = active.reduce((sum, s) => sum + pendingAmount(s), 0n);
  const paid = scholarships.reduce((sum, s) => sum + s.paidAmount, 0n);

  return (
    <main className="ar-donor">
      <header className="ar-donor-header">
        <div>
          <h1>Panel del donante</h1>
          <p className="ar-donor-muted">
            Cuenta de demostración: <code title={DONOR}>{shortAddress(DONOR)}</code>
          </p>
        </div>
        {!showForm && (
          <button type="button" className="ar-donor-btn" onClick={() => setShowForm(true)}>
            Crear beca
          </button>
        )}
      </header>

      <p className="ar-donor-demo" role="note">
        Modo demostración: los datos son simulados y no se mueve dinero. La conexión con Freighter y con el
        contrato real se activará cuando esté desplegado en la red de pruebas.
      </p>

      {notice && (
        <p className={`ar-donor-notice ar-donor-notice-${notice.kind}`} role="status">
          {notice.text}
        </p>
      )}

      {showForm && (
        <CreateScholarshipForm donor={DONOR} onCreate={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {!loading && !loadError && (
        <section className="ar-donor-stats" aria-label="Resumen">
          <div>
            <span>Becas</span>
            <strong>{scholarships.length}</strong>
          </div>
          <div>
            <span>En contratos activos</span>
            <strong>{formatUnits(inContract)} {USDCDEMO_SYMBOL}</strong>
          </div>
          <div>
            <span>Pagado a estudiantes</span>
            <strong>{formatUnits(paid)} {USDCDEMO_SYMBOL}</strong>
          </div>
        </section>
      )}

      {loading && <p className="ar-donor-muted">Cargando becas…</p>}
      {loadError && (
        <p className="ar-donor-notice ar-donor-notice-error" role="alert">
          No se pudieron cargar las becas: {loadError}
        </p>
      )}
      {!loading && !loadError && scholarships.length === 0 && (
        <p className="ar-donor-muted">Todavía no has creado ninguna beca.</p>
      )}

      <section className="ar-donor-list">
        {scholarships.map((s) => (
          <ScholarshipCard
            key={s.id}
            scholarship={s}
            now={now}
            busy={busyId === s.id}
            onFund={handleFund}
            onRefund={handleRefund}
          />
        ))}
      </section>
    </main>
  );
}

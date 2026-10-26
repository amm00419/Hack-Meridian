import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAddress, getNetwork, requestAccess,} from '@stellar/freighter-api';
import { supabase } from '../../services/supabase';
import './VerifierPage.css';

type VerificationStatus = 'pending' | 'approved' | 'corrections';
type Filter = 'all' | VerificationStatus;

type Verification = {
  id: string;
  scholarshipId: string;
  scholarshipTitle: string;
  studentName: string;
  milestoneId: number;
  milestoneTitle: string;
  documents: number;
  submittedAt: string;
  amount: number;
  currency: string;
  status: VerificationStatus;
};

type VerificationRow = {
  presentacion_id: string;
  presentado_en: string;
  hito_id: number;
  indice: number;
  hito_titulo: string;
  hito_estado: string;
  importe: string;
  beca_id: string;
  beca_titulo: string;
  moneda: string;
  estudiante_addr: string;
  estudiante_alias: string | null;
  verificador_addr: string;
  documentos: number;
};

type ReviewRow = {
  presentacion_id: string;
  decision: 'approved' | 'correction_requested';
  creado_en: string;
};

const verificationLabels: Record<VerificationStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  corrections: 'Correcciones',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function getStatus(row: VerificationRow, review?: ReviewRow): VerificationStatus {
  if (review?.decision === 'approved') return 'approved';
  if (review?.decision === 'correction_requested') return 'corrections';
  if (row.hito_estado === 'paid') return 'approved';
  if (row.hito_estado === 'correction_requested') return 'corrections';
  return 'pending';
}

export default function VerifierPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifierAddress, setVerifierAddress] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        

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
            'Freighter no ha autorizado el acceso a la billetera.'
          );
        }

        const address = wallet.address;
  
        const { data, error: queryError } = await supabase
          .from('solicitudes_verificacion')
          .select('presentacion_id,presentado_en,hito_id,indice,hito_titulo,hito_estado,importe,beca_id,beca_titulo,moneda,estudiante_addr,estudiante_alias,verificador_addr,documentos')
          .eq('verificador_addr', address)
          .order('presentado_en', { ascending: false });

        if (queryError) throw new Error(queryError.message);
        
        const rows = (data ?? []) as VerificationRow[];
        const presentationIds = rows.map((row) => row.presentacion_id);
        const reviewMap = new Map<string, ReviewRow>();

        if (presentationIds.length > 0) {
          const { data: reviews, error: reviewError } = await supabase
            .from('revisiones')
            .select('presentacion_id,decision,creado_en')
            .in('presentacion_id', presentationIds)
            .order('creado_en', { ascending: false });
          if (reviewError) throw new Error(reviewError.message);
          for (const review of (reviews ?? []) as ReviewRow[]) {
            if (!reviewMap.has(review.presentacion_id)) {
              reviewMap.set(review.presentacion_id, review);
            }
          }
        }

        const mapped: Verification[] = rows.map((row) => ({
          id: row.presentacion_id,
          scholarshipId: row.beca_id,
          scholarshipTitle: row.beca_titulo,
          studentName: row.estudiante_alias || `${row.estudiante_addr.slice(0, 6)}...${row.estudiante_addr.slice(-4)}`,
          // El índice SQL empieza en 0; las rutas del frontend utilizan 1, 2, 3...
          milestoneId: Number(row.indice) + 1,
          milestoneTitle: row.hito_titulo,
          documents: Number(row.documentos),
          submittedAt: row.presentado_en,
          amount: Number(row.importe) / 10_000_000,
          currency: row.moneda,
          status: getStatus(row, reviewMap.get(row.presentacion_id)),
        }));

        if (!cancelled) {
          setVerifierAddress(address);
          setVerifications(mapped);
        }
      } catch (err) {
        
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const pending = verifications.filter((item) => item.status === 'pending').length;
  const approved = verifications.filter((item) => item.status === 'approved').length;
  const corrections = verifications.filter((item) => item.status === 'corrections').length;
  const filteredVerifications = verifications.filter((item) => filter === 'all' || item.status === filter);

  return (
    <main className="verifier-dashboard">
      <header className="verifier-header">
        <div>
          <span className="verifier-eyebrow">AIDRELEASE / VERIFICADOR</span>
          <h1>Centro de verificación</h1>
          <p>Revisa las evidencias académicas y supervisa los hitos de las ayudas.</p>
          {verifierAddress && <p>Billetera: {verifierAddress.slice(0, 6)}...{verifierAddress.slice(-4)}</p>}
        </div>
        <span className="verifier-network">● Stellar Testnet</span>
      </header>

      <section className="verifier-stats">
        <article className="verifier-stat verifier-stat-pending">
          <span>Por revisar</span><strong>{pending}</strong><small>Solicitudes pendientes</small>
        </article>
        <article className="verifier-stat verifier-stat-approved">
          <span>Aprobados</span><strong>{approved}</strong><small>Hitos validados</small>
        </article>
        <article className="verifier-stat verifier-stat-corrections">
          <span>Correcciones</span><strong>{corrections}</strong><small>Documentación por completar</small>
        </article>
      </section>

      <section className="verifier-content">
        <div className="verifier-section-header">
          <div>
            <h2>Solicitudes de verificación</h2>
            <p>Consulta las entregas realizadas por los estudiantes.</p>
          </div>
          <span className="verifier-total">{filteredVerifications.length} solicitudes</span>
        </div>

        <div className="verifier-filters">
          {([
            ['all', 'Todas'], ['pending', 'Pendientes'],
            ['approved', 'Aprobadas'], ['corrections', 'Correcciones'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button"
              className={`verifier-filter ${filter === value ? 'verifier-filter-active' : ''}`}
              onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>

        {loading && <p className="verifier-empty">Cargando solicitudes desde Supabase...</p>}
        {!loading && error && <p className="verifier-empty" role="alert">{error}</p>}

        {!loading && !error && (
          <div className="verifier-request-list">
            {filteredVerifications.map((verification) => (
              <Link key={verification.id}
                to={`/verifier/review/${verification.scholarshipId}/${verification.milestoneId}`}
                className="verifier-request vr-request-link"
                aria-label={`Revisar ${verification.milestoneTitle} de ${verification.scholarshipTitle}`}>
                <div className="verifier-request-main">
                  <span className="verifier-request-icon">📋</span>
                  <div>
                    <h3>{verification.scholarshipTitle}</h3>
                    <p>{verification.studentName}</p>
                    <small>Hito: {verification.milestoneTitle}</small>
                  </div>
                </div>
                <div className="verifier-request-meta">
                  <div><span>Documentos</span><strong>{verification.documents}</strong></div>
                  <div><span>Fecha de entrega</span><strong>{formatDate(verification.submittedAt)}</strong></div>
                  <div><span>Importe</span><strong>{verification.amount.toLocaleString('es-ES')} {verification.currency}</strong></div>
                </div>
                <div className="verifier-request-actions">
                  <span className={`verifier-status verifier-status-${verification.status}`}>
                    {verificationLabels[verification.status]}
                  </span>
                  <span className="verifier-review-placeholder">
                    {verification.status === 'pending' ? 'Revisar solicitud →' : 'Consultar solicitud →'}
                  </span>
                </div>
              </Link>
            ))}
            {filteredVerifications.length === 0 && (
              <p className="verifier-empty">No hay solicitudes en esta categoría para la billetera conectada.</p>
            )}
          </div>
        )}
      </section>

      <footer className="verifier-footer">AidRelease · Panel del verificador · Datos de Supabase (demo)</footer>
    </main>
  );
}

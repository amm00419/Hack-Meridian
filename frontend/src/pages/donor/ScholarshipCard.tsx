import { useState } from 'react';
import {
  canClaimRefund,
  isMilestoneOverdue,
  nextMilestone,
  pendingAmount,
  USDCDEMO_CONTRACT,
  USDCDEMO_SYMBOL,
  type DonorScholarship,
  type Milestone,
  type ScholarshipStatus,
} from '../../domain/aidrelease';
import { formatDate, formatUnits, percent, shortAddress } from '../../domain/format';

const STATUS_LABEL: Record<ScholarshipStatus, string> = {
  Unfunded: 'Sin financiar',
  Active: 'Activa',
  Completed: 'Completada',
  Refunded: 'Reembolsada',
};

type Tone = 'ok' | 'wait' | 'late' | 'off';

function milestoneBadge(m: Milestone, now: number): { label: string; tone: Tone } {
  if (m.status === 'Paid') return { label: 'Pagado', tone: 'ok' };
  if (m.status === 'Expired') return { label: 'Vencido y reembolsado', tone: 'late' };
  if (m.status === 'Cancelled') return { label: 'Cancelado', tone: 'off' };
  // El contrato solo escribe Expired al reembolsar: un hito pendiente con la
  // fecha pasada se muestra como vencido aunque siga "Pending" en la cadena.
  if (isMilestoneOverdue(m, now)) return { label: 'Vencido', tone: 'late' };
  return { label: 'Pendiente', tone: 'wait' };
}

interface Props {
  scholarship: DonorScholarship;
  now: number;
  busy: boolean;
  onFund: (id: string) => void;
  onRefund: (id: string) => void;
}

export default function ScholarshipCard({ scholarship: s, now, busy, onFund, onRefund }: Props) {
  const [confirming, setConfirming] = useState<'fund' | 'refund' | null>(null);

  const symbol = s.token === USDCDEMO_CONTRACT ? USDCDEMO_SYMBOL : 'tokens';
  const pending = pendingAmount(s);
  const next = nextMilestone(s);
  const refundable = canClaimRefund(s, now);
  const progress = percent(s.paidAmount, s.totalAmount);

  function confirm(action: 'fund' | 'refund') {
    setConfirming(null);
    if (action === 'fund') onFund(s.id);
    else onRefund(s.id);
  }

  return (
    <article className="ar-donor-card">
      <header className="ar-donor-card-head">
        <div>
          <h3>{s.title}</h3>
          <p className="ar-donor-muted">{s.institution}</p>
        </div>
        <span className={`ar-donor-status ar-donor-status-${s.status.toLowerCase()}`}>
          {STATUS_LABEL[s.status]}
        </span>
      </header>

      <dl className="ar-donor-meta">
        <div>
          <dt>Estudiante</dt>
          <dd title={s.beneficiary}>{shortAddress(s.beneficiary)}</dd>
        </div>
        <div>
          <dt>Verificador</dt>
          <dd title={s.verifier}>{shortAddress(s.verifier)}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd title={s.token}>{symbol}</dd>
        </div>
        <div>
          <dt>Contrato</dt>
          <dd title={s.contractId}>{shortAddress(s.contractId)}</dd>
        </div>
      </dl>

      <div className="ar-donor-amounts">
        <div>
          <span>Total</span>
          <strong>{formatUnits(s.totalAmount)} {symbol}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{formatUnits(s.paidAmount)} {symbol}</strong>
        </div>
        <div>
          <span>En el contrato</span>
          <strong>{formatUnits(pending)} {symbol}</strong>
        </div>
        <div>
          <span>Reembolsado</span>
          <strong>{formatUnits(s.refundedAmount)} {symbol}</strong>
        </div>
      </div>

      <div
        className="ar-donor-progress"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Importe pagado"
      >
        <div className="ar-donor-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <ol className="ar-donor-milestones">
        {s.milestones.map((m) => {
          const badge = milestoneBadge(m, now);
          const info = s.milestoneDetails[m.id];
          return (
            <li key={m.id}>
              <div className="ar-donor-ms-top">
                <span className="ar-donor-ms-num">{m.id + 1}</span>
                <span className="ar-donor-ms-title">{info ? info.title : `Hito ${m.id + 1}`}</span>
                <span className="ar-donor-ms-amount">{formatUnits(m.amount)} {symbol}</span>
                <span className="ar-donor-muted">hasta {formatDate(m.deadline)}</span>
                <span className={`ar-donor-badge ar-donor-badge-${badge.tone}`}>{badge.label}</span>
              </div>
              {info && (
                <details className="ar-donor-ms-details">
                  <summary>Ver requisitos del hito</summary>
                  {info.description && <p>{info.description}</p>}
                  <h4>Criterios de aprobación</h4>
                  <p>{info.criteria}</p>
                  <h4>Documentación requerida</h4>
                  <ul>
                    {info.requiredDocuments.map((doc, i) => (
                      <li key={i}>{doc}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="ar-donor-actions">
        {s.status === 'Unfunded' && confirming !== 'fund' && (
          <button type="button" className="ar-donor-btn" disabled={busy} onClick={() => setConfirming('fund')}>
            Financiar beca
          </button>
        )}
        {s.status === 'Unfunded' && confirming === 'fund' && (
          <div className="ar-donor-confirm">
            <p>
              Se transferirán <strong>{formatUnits(s.totalAmount)} {symbol}</strong> desde tu billetera al
              contrato de la beca. ¿Confirmas?
            </p>
            <button type="button" className="ar-donor-btn" disabled={busy} onClick={() => confirm('fund')}>
              Sí, financiar
            </button>
            <button type="button" className="ar-donor-btn ar-donor-btn-ghost" onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        )}

        {s.status === 'Active' && refundable && confirming !== 'refund' && (
          <button
            type="button"
            className="ar-donor-btn ar-donor-btn-warn"
            disabled={busy}
            onClick={() => setConfirming('refund')}
          >
            Reclamar reembolso
          </button>
        )}
        {s.status === 'Active' && refundable && confirming === 'refund' && (
          <div className="ar-donor-confirm">
            <p>
              Recuperarás <strong>{formatUnits(pending)} {symbol}</strong>. Los pagos ya hechos no se tocan y la
              beca se cerrará: <strong>no se podrán aprobar más hitos</strong>. ¿Confirmas?
            </p>
            <button
              type="button"
              className="ar-donor-btn ar-donor-btn-warn"
              disabled={busy}
              onClick={() => confirm('refund')}
            >
              Sí, reclamar
            </button>
            <button type="button" className="ar-donor-btn ar-donor-btn-ghost" onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </div>
        )}
        {s.status === 'Active' && !refundable && next && (
          <p className="ar-donor-muted">
            El reembolso se podrá reclamar si el hito {next.id + 1} no se aprueba antes del{' '}
            {formatDate(next.deadline)}.
          </p>
        )}

        {s.status === 'Completed' && <p className="ar-donor-muted">Todos los hitos están pagados.</p>}
        {s.status === 'Refunded' && (
          <p className="ar-donor-muted">
            Beca cerrada: se devolvieron {formatUnits(s.refundedAmount)} {symbol} al donante.
          </p>
        )}
      </footer>
    </article>
  );
}

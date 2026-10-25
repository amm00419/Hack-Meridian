import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  MAX_MILESTONES,
  USDCDEMO_CONTRACT,
  USDCDEMO_SYMBOL,
  type NewScholarshipInput,
} from '../../domain/aidrelease';
import { shortAddress } from '../../domain/format';
import { parseForm, type ScholarshipForm, type ValidationIssue } from '../../domain/validation';
import { describeError } from '../../services/donorService';

interface Props {
  donor: string;
  onCreate: (input: NewScholarshipInput) => Promise<void>;
  onCancel: () => void;
}

const EMPTY_ROW = { amount: '', date: '' };

const INITIAL: ScholarshipForm = {
  title: '',
  institution: '',
  beneficiary: '',
  verifier: '',
  token: USDCDEMO_CONTRACT,
  milestones: [{ ...EMPTY_ROW }],
};

type TextField = 'title' | 'institution' | 'beneficiary' | 'verifier' | 'token';

export default function CreateScholarshipForm({ donor, onCreate, onCancel }: Props) {
  const [form, setForm] = useState<ScholarshipForm>(INITIAL);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(field: TextField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setRow(index: number, key: 'amount' | 'date', value: string) {
    setForm((prev) => ({
      ...prev,
      milestones: prev.milestones.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    }));
  }

  function addRow() {
    setForm((prev) =>
      prev.milestones.length >= MAX_MILESTONES
        ? prev
        : { ...prev, milestones: [...prev.milestones, { ...EMPTY_ROW }] },
    );
  }

  function removeRow(index: number) {
    setForm((prev) =>
      prev.milestones.length <= 1
        ? prev
        : { ...prev, milestones: prev.milestones.filter((_, i) => i !== index) },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const nowSec = Math.floor(Date.now() / 1000);
    const result = parseForm(donor, form, nowSec);
    setIssues(result.issues);
    if (result.input === null) return;

    setSubmitting(true);
    try {
      await onCreate(result.input);
    } catch (error) {
      setSubmitError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const tokenIsKnown = form.token.trim() === USDCDEMO_CONTRACT;

  return (
    <form className="ar-donor-form" onSubmit={handleSubmit} noValidate>
      <h2>Crear beca</h2>
      <p className="ar-donor-muted">
        Se desplegará un contrato propio para esta beca. Tu billetera ({shortAddress(donor)}) será el donante.
      </p>

      <div className="ar-donor-grid">
        <label htmlFor="beca-titulo">
          Título
          <input
            id="beca-titulo"
            value={form.title}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField('title', e.target.value)}
            placeholder="Beca de Apoyo Universitario"
          />
        </label>
        <label htmlFor="beca-entidad">
          Entidad
          <input
            id="beca-entidad"
            value={form.institution}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField('institution', e.target.value)}
            placeholder="Fundación AidRelease"
          />
        </label>
      </div>

      <label htmlFor="beca-estudiante">
        Dirección del estudiante (G…)
        <input
          id="beca-estudiante"
          value={form.beneficiary}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setField('beneficiary', e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      <label htmlFor="beca-verificador">
        Dirección del verificador (G…)
        <input
          id="beca-verificador"
          value={form.verifier}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setField('verifier', e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      <label htmlFor="beca-token">
        Contrato del token (C…)
        <input
          id="beca-token"
          value={form.token}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setField('token', e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <p className={tokenIsKnown ? 'ar-donor-hint' : 'ar-donor-hint ar-donor-hint-warn'}>
        {tokenIsKnown
          ? `${USDCDEMO_SYMBOL}: token de pruebas de la red de pruebas.`
          : 'Token desconocido. El contrato no valida el token: comprueba esta dirección con cuidado, porque un token falso podría simular pagos.'}
      </p>

      <fieldset className="ar-donor-fieldset">
        <legend>Hitos (entre 1 y {MAX_MILESTONES}, en orden)</legend>
        {form.milestones.map((row, index) => (
          <div className="ar-donor-row" key={index}>
            <span className="ar-donor-ms-num">{index + 1}</span>
            <label htmlFor={`hito-importe-${index}`}>
              Importe ({USDCDEMO_SYMBOL})
              <input
                id={`hito-importe-${index}`}
                inputMode="decimal"
                value={row.amount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRow(index, 'amount', e.target.value)}
                placeholder="300"
              />
            </label>
            <label htmlFor={`hito-fecha-${index}`}>
              Fecha límite
              <input
                id={`hito-fecha-${index}`}
                type="date"
                value={row.date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRow(index, 'date', e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ar-donor-btn ar-donor-btn-ghost"
              onClick={() => removeRow(index)}
              disabled={form.milestones.length <= 1}
              aria-label={`Quitar hito ${index + 1}`}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ar-donor-btn ar-donor-btn-ghost"
          onClick={addRow}
          disabled={form.milestones.length >= MAX_MILESTONES}
        >
          Añadir hito
        </button>
      </fieldset>

      {issues.length > 0 && (
        <ul className="ar-donor-issues" role="alert">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
      {submitError && (
        <p className="ar-donor-issues" role="alert">
          {submitError}
        </p>
      )}

      <div className="ar-donor-actions">
        <button type="submit" className="ar-donor-btn" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear beca'}
        </button>
        <button type="button" className="ar-donor-btn ar-donor-btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

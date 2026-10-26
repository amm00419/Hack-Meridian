import {
  MAX_I128,
  MAX_MILESTONES,
  MILESTONE_LIMITS,
  type NewMilestone,
  type NewScholarshipInput,
} from './aidrelease';
import { dateInputToDeadline, isAccountAddress, isContractAddress, parseUnits } from './format';

export interface MilestoneFormRow {
  title: string;
  description: string;
  approvalCriteria: string; // un criterio por línea
  documents: string; // un documento por línea
  verifierInstructions: string; // opcional
  amount: string; // texto del input, p. ej. "300,5"
  date: string; // texto de input type=date, "YYYY-MM-DD"
}

export interface ScholarshipForm {
  title: string;
  institution: string;
  beneficiary: string;
  verifier: string;
  token: string;
  milestones: MilestoneFormRow[];
}

export const EMPTY_MILESTONE_ROW: MilestoneFormRow = {
  title: '',
  description: '',
  approvalCriteria: '',
  documents: '',
  verifierInstructions: '',
  amount: '',
  date: '',
};

// Los códigos coinciden con ContractError cuando existe equivalente.
export type IssueCode =
  | 'MissingField'
  | 'FieldTooLong'
  | 'InvalidAddress'
  | 'InvalidRoles'
  | 'InvalidMilestones'
  | 'InvalidAmount'
  | 'InvalidDeadline'
  | 'ArithmeticOverflow'
  | 'InvalidToken';

export interface ValidationIssue {
  code: IssueCode;
  message: string;
}

export interface ParseResult {
  input: NewScholarshipInput | null;
  issues: ValidationIssue[];
}

/** "a\n\n b \n" -> ["a", "b"] */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Valida el formulario con las mismas reglas que el constructor del contrato,
 * para avisar antes de pedir la firma. El contrato sigue siendo la autoridad.
 * Los textos descriptivos de los hitos no los conoce el contrato: se validan
 * solo aquí.
 */
export function parseForm(donor: string, form: ScholarshipForm, nowSec: number): ParseResult {
  const issues: ValidationIssue[] = [];
  const add = (code: IssueCode, message: string) => issues.push({ code, message });

  const title = form.title.trim();
  const institution = form.institution.trim();
  const beneficiary = form.beneficiary.trim();
  const verifier = form.verifier.trim();
  const token = form.token.trim();

  if (title.length === 0) add('MissingField', 'Indica un título para la beca.');
  if (institution.length === 0) add('MissingField', 'Indica la entidad que concede la beca.');

  // Direcciones
  if (!isAccountAddress(beneficiary)) {
    add('InvalidAddress', 'La dirección del estudiante debe empezar por G y tener 56 caracteres.');
  }
  if (!isAccountAddress(verifier)) {
    add('InvalidAddress', 'La dirección del verificador debe empezar por G y tener 56 caracteres.');
  }
  if (!isContractAddress(token)) {
    add('InvalidToken', 'La dirección del token debe empezar por C y tener 56 caracteres.');
  }

  // Roles distintos (InvalidRoles)
  if (isAccountAddress(beneficiary) && isAccountAddress(verifier)) {
    if (beneficiary === donor || verifier === donor || beneficiary === verifier) {
      add('InvalidRoles', 'Donante, estudiante y verificador deben ser tres direcciones distintas.');
    }
  }

  // Hitos (InvalidMilestones, InvalidAmount, InvalidDeadline, ArithmeticOverflow)
  const count = form.milestones.length;
  if (count < 1 || count > MAX_MILESTONES) {
    add('InvalidMilestones', `La beca necesita entre 1 y ${MAX_MILESTONES} hitos.`);
  }

  const milestones: NewMilestone[] = [];
  let rowsOk = true;
  let previousDeadline = nowSec;

  form.milestones.forEach((row, index) => {
    const n = index + 1;
    const amount = parseUnits(row.amount);
    const deadline = dateInputToDeadline(row.date);

    // --- Parte on-chain
    if (amount === null || amount <= 0n) {
      add('InvalidAmount', `Hito ${n}: el importe debe ser un número mayor que 0 (máximo 7 decimales).`);
      rowsOk = false;
    }
    if (deadline === null) {
      add('InvalidDeadline', `Hito ${n}: elige una fecha límite.`);
      rowsOk = false;
    } else if (deadline <= previousDeadline) {
      add(
        'InvalidDeadline',
        index === 0
          ? `Hito ${n}: la fecha límite debe estar en el futuro.`
          : `Hito ${n}: la fecha límite debe ser posterior a la del hito ${n - 1}.`,
      );
      rowsOk = false;
    }
    if (deadline !== null) previousDeadline = Math.max(previousDeadline, deadline);

    // --- Parte descriptiva (fuera de la cadena)
    const rowTitle = row.title.trim();
    const description = row.description.trim();
    const approvalCriteria = splitLines(row.approvalCriteria);
    const requiredDocuments = splitLines(row.documents);
    const verifierInstructions = row.verifierInstructions.trim();

    if (rowTitle.length === 0) add('MissingField', `Hito ${n}: indica un título.`);
    else if (rowTitle.length > MILESTONE_LIMITS.title) {
      add('FieldTooLong', `Hito ${n}: el título no puede superar ${MILESTONE_LIMITS.title} caracteres.`);
    }
    if (description.length > MILESTONE_LIMITS.description) {
      add('FieldTooLong', `Hito ${n}: la descripción no puede superar ${MILESTONE_LIMITS.description} caracteres.`);
    }
    if (verifierInstructions.length > MILESTONE_LIMITS.verifierInstructions) {
      add(
        'FieldTooLong',
        `Hito ${n}: las instrucciones para el verificador no pueden superar ${MILESTONE_LIMITS.verifierInstructions} caracteres.`,
      );
    }
    if (approvalCriteria.length === 0) {
      add('MissingField', `Hito ${n}: indica al menos un criterio de aprobación para el verificador.`);
    } else if (approvalCriteria.length > MILESTONE_LIMITS.maxCriteria) {
      add('FieldTooLong', `Hito ${n}: máximo ${MILESTONE_LIMITS.maxCriteria} criterios.`);
    } else if (approvalCriteria.some((c) => c.length > MILESTONE_LIMITS.criterion)) {
      add('FieldTooLong', `Hito ${n}: cada criterio puede tener como máximo ${MILESTONE_LIMITS.criterion} caracteres.`);
    }
    if (requiredDocuments.length === 0) {
      add('MissingField', `Hito ${n}: indica al menos un documento que debe aportar el estudiante.`);
    } else if (requiredDocuments.length > MILESTONE_LIMITS.maxDocuments) {
      add('FieldTooLong', `Hito ${n}: máximo ${MILESTONE_LIMITS.maxDocuments} documentos.`);
    } else if (requiredDocuments.some((d) => d.length > MILESTONE_LIMITS.document)) {
      add('FieldTooLong', `Hito ${n}: cada documento puede tener como máximo ${MILESTONE_LIMITS.document} caracteres.`);
    }

    if (amount !== null && deadline !== null) {
      milestones.push({
        amount,
        deadline,
        details: {
          title: rowTitle,
          description,
          approvalCriteria,
          requiredDocuments,
          ...(verifierInstructions.length > 0 ? { verifierInstructions } : {}),
        },
      });
    }
  });

  if (rowsOk) {
    const total = milestones.reduce((sum, m) => sum + m.amount, 0n);
    if (total > MAX_I128) add('ArithmeticOverflow', 'La suma de los importes es demasiado grande.');
  }

  if (issues.length > 0) return { input: null, issues };

  return {
    input: { title, institution, beneficiary, verifier, token, milestones },
    issues: [],
  };
}

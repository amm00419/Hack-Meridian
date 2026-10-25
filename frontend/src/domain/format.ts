import { TOKEN_DECIMALS } from './aidrelease';

const ACCOUNT_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_RE = /^C[A-Z2-7]{55}$/;

// Solo comprueba el FORMATO (no el checksum). Al conectar el SDK de Stellar se
// sustituye por StrKey.isValidEd25519PublicKey / StrKey.isValidContract.
export function isAccountAddress(value: string): boolean {
  return ACCOUNT_RE.test(value);
}

export function isContractAddress(value: string): boolean {
  return CONTRACT_RE.test(value);
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** 3005000000n -> "300,5" (sin ceros finales, separador es-ES). */
export function formatUnits(value: bigint, decimals: number = TOKEN_DECIMALS): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  const wholeText = whole.toLocaleString('es-ES');
  const text = frac.length > 0 ? `${wholeText},${frac}` : wholeText;
  return negative ? `-${text}` : text;
}

/** "300,5" o "300.5" -> 3005000000n. Devuelve null si no es válido. */
export function parseUnits(input: string, decimals: number = TOKEN_DECIMALS): bigint | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [wholePart, fracPart = ''] = text.split('.');
  if (fracPart.length > decimals) return null;
  const base = 10n ** BigInt(decimals);
  return BigInt(wholePart) * base + BigInt(fracPart.padEnd(decimals, '0') || '0');
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "2026-12-31" (input type=date) -> final de ese día en hora local, en segundos Unix. */
export function dateInputToDeadline(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = new Date(`${value}T23:59:59`).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** Porcentaje entero 0-100 de parte/total, sin perder precisión con bigint. */
export function percent(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const p = Number((part * 100n) / total);
  return Math.max(0, Math.min(100, p));
}

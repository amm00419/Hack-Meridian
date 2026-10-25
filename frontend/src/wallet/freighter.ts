// Adaptador fino sobre @stellar/freighter-api.
// Toda la interacción con la extensión pasa por aquí: si cambia la API de
// Freighter, solo se toca este archivo. Nunca se manejan claves secretas: la
// extensión guarda la clave y firma por nosotros.
import { getAddress, getNetwork, isConnected, requestAccess } from '@stellar/freighter-api';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const FREIGHTER_URL = 'https://www.freighter.app';

export type WalletFailure = 'not-installed' | 'rejected' | 'error';

export type WalletResult =
  | { ok: true; address: string; network: string | null; passphrase: string | null }
  | { ok: false; reason: WalletFailure; message: string };

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Error desconocido de Freighter.';
}

async function readNetwork(): Promise<{ network: string | null; passphrase: string | null }> {
  try {
    const result = await getNetwork();
    if (result.error) return { network: null, passphrase: null };
    return { network: result.network ?? null, passphrase: result.networkPassphrase ?? null };
  } catch {
    return { network: null, passphrase: null };
  }
}

/** true si la red de Freighter es la red de pruebas (testnet). */
export function isTestnet(network: string | null, passphrase: string | null): boolean {
  if (passphrase) return passphrase === TESTNET_PASSPHRASE;
  return network?.toUpperCase() === 'TESTNET';
}

/** Pide acceso a la cuenta (la extensión muestra su ventana de permiso). */
export async function connectFreighter(): Promise<WalletResult> {
  try {
    const installed = await isConnected();
    if (!installed.isConnected) {
      return {
        ok: false,
        reason: 'not-installed',
        message: 'No se detecta la extensión Freighter en este navegador.',
      };
    }

    const access = await requestAccess();
    if (access.error || !access.address) {
      return {
        ok: false,
        reason: 'rejected',
        message: access.error ? errorMessage(access.error) : 'No se concedió acceso a la cuenta.',
      };
    }

    const net = await readNetwork();
    return { ok: true, address: access.address, ...net };
  } catch (error) {
    return { ok: false, reason: 'error', message: errorMessage(error) };
  }
}

/**
 * Reconecta sin ventanas emergentes si el usuario ya había dado permiso a esta
 * web. Devuelve null si no hay permiso previo o no está Freighter.
 */
export async function restoreFreighter(): Promise<WalletResult | null> {
  try {
    const installed = await isConnected();
    if (!installed.isConnected) return null;
    const current = await getAddress();
    if (current.error || !current.address) return null;
    const net = await readNetwork();
    return { ok: true, address: current.address, ...net };
  } catch {
    return null;
  }
}

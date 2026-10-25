import { createContext } from 'react';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletStatus;
  /** Dirección pública G... de la cuenta conectada (nunca la clave secreta). */
  address: string | null;
  network: string | null;
  onTestnet: boolean;
  /** Mensaje del último intento de conexión fallido. */
  error: string | null;
  /** true si el fallo fue que Freighter no está instalada. */
  notInstalled: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletState | null>(null);

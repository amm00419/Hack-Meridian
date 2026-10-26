import { useEffect, useState, type ReactNode } from 'react';
import { connectFreighter, isTestnet, restoreFreighter, type WalletResult } from './freighter';
import { WalletContext, type WalletState, type WalletStatus } from './walletContext';

// Si el usuario pulsa "Desconectar" no volvemos a reconectar solos al recargar.
const DISCONNECT_FLAG = 'ar-wallet-disconnected';

function readFlag(): boolean {
  try {
    return window.sessionStorage.getItem(DISCONNECT_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeFlag(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(DISCONNECT_FLAG, '1');
    else window.sessionStorage.removeItem(DISCONNECT_FLAG);
  } catch {
    // Sin almacenamiento disponible: simplemente no se recuerda.
  }
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [onTestnet, setOnTestnet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);

  function applyConnected(result: Extract<WalletResult, { ok: true }>) {
    setAddress(result.address);
    setNetwork(result.network);
    setOnTestnet(isTestnet(result.network, result.passphrase));
    setError(null);
    setNotInstalled(false);
    setStatus('connected');
  }

  // Reconexión silenciosa si ya había permiso previo.
  useEffect(() => {
    if (readFlag()) return;
    let cancelled = false;
    restoreFreighter().then((result) => {
      if (cancelled || result === null || !result.ok) return;
      applyConnected(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setStatus('connecting');
    setError(null);
    setNotInstalled(false);
    const result = await connectFreighter();
    if (result.ok) {
      writeFlag(false);
      applyConnected(result);
    } else {
      setStatus('disconnected');
      setError(result.message);
      setNotInstalled(result.reason === 'not-installed');
    }
  }

  function disconnect() {
    // Freighter no tiene "cerrar sesión": solo olvidamos la cuenta en esta web.
    writeFlag(true);
    setAddress(null);
    setNetwork(null);
    setOnTestnet(false);
    setError(null);
    setNotInstalled(false);
    setStatus('disconnected');
  }

  const value: WalletState = {
    status,
    address,
    network,
    onTestnet,
    error,
    notInstalled,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

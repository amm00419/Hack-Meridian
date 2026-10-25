import { useContext } from 'react';
import { WalletContext, type WalletState } from './walletContext';

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error('useWallet debe usarse dentro de <WalletProvider>.');
  }
  return context;
}

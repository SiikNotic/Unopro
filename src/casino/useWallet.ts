import { useContext } from 'react';
import { WalletContext } from './walletContext';
import type { WalletContextValue } from './walletContext';

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}

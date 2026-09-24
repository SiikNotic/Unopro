import { createContext } from 'react';

export interface WalletContextValue {
  balance: number;
  /** Takes chips for a bet. Returns false (and takes nothing) when the balance can't cover it. */
  spend: (amount: number) => boolean;
  credit: (amount: number) => void;
  /** Free refill, only while the balance can't cover the smallest bet. */
  refill: () => void;
  canRefill: boolean;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

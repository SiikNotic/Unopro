import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { storage } from '@/storage';
import { canRefill, normalizeBalance, REFILL_CHIPS } from './wallet';
import { WalletContext } from './walletContext';

const STORAGE_KEY = 'carta.chips';

/** Virtual chip balance shared by every casino game, kept only in this browser. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(() => normalizeBalance(storage.get(STORAGE_KEY)));
  // The ref lets several spends in one tick see each other before React re-renders.
  const current = useRef(balance);

  const commit = useCallback((next: number) => {
    current.current = next;
    storage.set(STORAGE_KEY, next);
    setBalance(next);
  }, []);

  const spend = useCallback(
    (amount: number) => {
      if (!(amount > 0) || amount > current.current) return false;
      commit(current.current - Math.floor(amount));
      return true;
    },
    [commit]
  );

  const credit = useCallback(
    (amount: number) => {
      if (amount > 0) commit(current.current + Math.floor(amount));
    },
    [commit]
  );

  const refill = useCallback(() => {
    if (canRefill(current.current)) commit(current.current + REFILL_CHIPS);
  }, [commit]);

  const value = useMemo(() => ({ balance, spend, credit, refill, canRefill: canRefill(balance) }), [balance, spend, credit, refill]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

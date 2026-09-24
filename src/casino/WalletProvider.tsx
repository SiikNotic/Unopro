import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { storage } from '@/storage';
import { canRefill } from './wallet';
import type { CasinoGame, WalletData } from './ledger';
import { normalizeWallet, openRound, raiseStake as raise, RECOVER_AFTER_MS, recoverRounds, refillWallet, settleRound as settle } from './ledger';
import { newId } from './random';
import { WALLET_RESET_EVENT, WalletContext } from './walletContext';

const KEY = 'carta.wallet';
const LEGACY_KEY = 'carta.chips';

/**
 * Virtual chips shared by every casino game, kept only in this browser. Every change re-reads the stored
 * wallet first and writes the whole wallet back in one go, so two tabs never overwrite each other with
 * stale balances, and other tabs are updated through the `storage` event.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  // In-memory copy, used when the browser refuses to store anything (private mode, full storage).
  const memory = useRef<WalletData | null>(null);
  const persistent = useRef(true);

  const read = useCallback((): WalletData => {
    if (persistent.current) {
      const raw = storage.get<unknown>(KEY);
      // Missing means never created or wiped (Settings → reset): start from a fresh wallet either way.
      return raw !== null ? normalizeWallet(raw) : normalizeWallet(null, storage.get<unknown>(LEGACY_KEY));
    }
    return memory.current ?? normalizeWallet(null);
  }, []);

  const [wallet, setWallet] = useState<WalletData>(() => {
    const w = recoverRounds(read(), Date.now());
    memory.current = w;
    persistent.current = storage.set(KEY, w);
    if (persistent.current) storage.remove(LEGACY_KEY);
    return w;
  });

  /** Read → change → write, all synchronous, so it can't interleave with another change in this tab. */
  const mutate = useCallback(
    <T,>(fn: (w: WalletData) => { wallet: WalletData; result: T }): T => {
      const current = read();
      const { wallet: next, result } = fn(current);
      if (next !== current) {
        memory.current = next;
        if (persistent.current) persistent.current = storage.set(KEY, next);
        setWallet(next);
      }
      return result;
    },
    [read]
  );

  // Other tabs changed (or wiped) the wallet: show their state. Settings → reset in this tab too.
  useEffect(() => {
    const reload = () => {
      const next = read();
      memory.current = next;
      setWallet(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(WALLET_RESET_EVENT, reload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WALLET_RESET_EVENT, reload);
    };
  }, [read]);

  // A spin interrupted by a reload is paid once it can no longer be animating anywhere.
  useEffect(() => {
    const id = window.setTimeout(() => {
      mutate((w) => ({ wallet: recoverRounds(w, Date.now()), result: null }));
    }, RECOVER_AFTER_MS + 1000);
    return () => window.clearTimeout(id);
  }, [mutate]);

  const startRound = useCallback(
    (game: CasinoGame, stake: number, payout: number | null) =>
      mutate((w) => {
        const id = newId();
        const r = openRound(w, { id, game, stake, payout, now: Date.now() });
        return { wallet: r.wallet, result: r.ok ? id : null };
      }),
    [mutate]
  );

  const raiseStake = useCallback(
    (id: string, extra: number) =>
      mutate((w) => {
        const r = raise(w, id, extra);
        return { wallet: r.wallet, result: r.ok };
      }),
    [mutate]
  );

  const settleRound = useCallback(
    (id: string, payout: number | null = null) =>
      mutate((w) => {
        const r = settle(w, id, payout, Date.now());
        return { wallet: r.wallet, result: r.credited };
      }),
    [mutate]
  );

  const refill = useCallback(() => {
    mutate((w) => {
      const r = refillWallet(w);
      return { wallet: r.wallet, result: r.ok };
    });
  }, [mutate]);

  const isOpen = useCallback((id: string) => read().open.some((o) => o.id === id), [read]);
  const openStake = useCallback((id: string) => read().open.find((o) => o.id === id)?.stake ?? null, [read]);

  const value = useMemo(
    () => ({
      balance: wallet.balance,
      canRefill: canRefill(wallet.balance),
      refill,
      history: wallet.history,
      stats: wallet.stats,
      startRound,
      raiseStake,
      settleRound,
      isOpen,
      openStake,
    }),
    [wallet, refill, startRound, raiseStake, settleRound, isOpen, openStake]
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

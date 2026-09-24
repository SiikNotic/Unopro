import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { storage } from '@/storage';
import { canRefill } from './wallet';
import type { CasinoGame, InstantRefusal, WalletData } from './ledger';
import { normalizeWallet, openRound, playRound, raiseStake as raise, RECOVER_AFTER_MS, recoverRounds, refillWallet, settleRound as settle } from './ledger';
import { newId } from './random';
import { WALLET_RESET_EVENT, WalletContext } from './walletContext';
import type { WalletContextValue } from './walletContext';
import { useAccount } from '@/account/useAccount';

const KEY = 'carta.wallet';
/** Only the tab holding this lock may place bets (see below). */
const LOCK = 'carta-casino-wallet';

type LockManagerLike = {
  request: (name: string, options: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => Promise<void> | void) => Promise<void>;
};
const lockManager = (): LockManagerLike | null =>
  typeof navigator !== 'undefined' && (navigator as unknown as { locks?: LockManagerLike }).locks ? (navigator as unknown as { locks: LockManagerLike }).locks : null;
const LEGACY_KEY = 'carta.chips';

/**
 * Virtual chips shared by every casino game, kept only in this browser. Every change re-reads the stored
 * wallet first and writes the whole wallet back in one go, and other tabs are updated through the
 * `storage` event.
 *
 * localStorage is not transactional across tabs (another tab can still read a stale copy for a moment),
 * so two tabs betting at the same instant could lose one tab's update. To rule that out, only one tab
 * at a time may place bets: it holds a Web Lock; the others show that play continues elsewhere and can
 * take over with one tap. Browsers without Web Locks keep the previous behaviour.
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

  const locks = useRef(lockManager()).current;
  // True in the tab allowed to bet. Without Web Locks every tab is allowed (previous behaviour).
  const [activeHere, setActiveHere] = useState(!locks);
  const activeRef = useRef(!locks);
  activeRef.current = activeHere;

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

  // The betting lock: held for as long as this tab stays the active one.
  const lockRelease = useRef<(() => void) | null>(null);
  const holdLock = useCallback(
    (options: { ifAvailable?: boolean; steal?: boolean }) => {
      if (!locks) return;
      void locks
        .request(LOCK, options, (lock) => {
          if (!lock) {
            // Another tab is playing: wait in line and take over when it closes.
            setActiveHere(false);
            holdLock({});
            return;
          }
          return new Promise<void>((resolve) => {
            lockRelease.current = resolve;
            // Give the previous holder's last write time to reach this tab, then play on fresh data.
            window.setTimeout(() => {
              const next = read();
              memory.current = next;
              setWallet(next);
              setActiveHere(true);
            }, 250);
          });
        })
        .catch(() => {
          // Taken over by another tab.
          lockRelease.current = null;
          setActiveHere(false);
          holdLock({});
        });
    },
    [locks, read]
  );
  useEffect(() => {
    holdLock({ ifAvailable: true });
    return () => lockRelease.current?.();
  }, [holdLock]);
  const playHere = useCallback(() => holdLock({ steal: true }), [holdLock]);

  // A spin interrupted by a reload is paid once it can no longer be animating anywhere.
  useEffect(() => {
    const id = window.setTimeout(() => {
      mutate((w) => ({ wallet: recoverRounds(w, Date.now()), result: null }));
    }, RECOVER_AFTER_MS + 1000);
    return () => window.clearTimeout(id);
  }, [mutate]);

  const startRound = useCallback(
    (game: CasinoGame, stake: number, payout: number | null) =>
      !activeRef.current ? null : mutate((w) => {
        const id = newId();
        const r = openRound(w, { id, game, stake, payout, now: Date.now() });
        return { wallet: r.wallet, result: r.ok ? id : null };
      }),
    [mutate]
  );

  const raiseStake = useCallback(
    (id: string, extra: number) =>
      !activeRef.current ? false : mutate((w) => {
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
    if (!activeRef.current) return;
    mutate((w) => {
      const r = refillWallet(w);
      return { wallet: r.wallet, result: r.ok };
    });
  }, [mutate]);

  const bookInstantRound = useCallback(
    (id: string, game: CasinoGame, stake: number, payout: number, journal?: (balance: number) => void) =>
      !activeRef.current ? { ok: false as const, reason: 'elsewhere' as const } : mutate<{ ok: true; balance: number } | { ok: false; reason: InstantRefusal }>((w) => {
        const r = playRound(w, { id, game, stake, payout, now: Date.now() });
        if (!r.ok) return { wallet: w, result: { ok: false as const, reason: r.reason } };
        journal?.(r.wallet.balance);
        return { wallet: r.wallet, result: { ok: true as const, balance: r.wallet.balance } };
      }),
    [mutate]
  );

  const wasSettled = useCallback((id: string) => read().paid.includes(id), [read]);

  const isOpen = useCallback((id: string) => read().open.some((o) => o.id === id), [read]);
  const openStake = useCallback((id: string) => read().open.find((o) => o.id === id)?.stake ?? null, [read]);

  const account = useAccount();
  const accountMode = account.status === 'user';
  const accountBalance = account.coins?.balance ?? 0;

  const value = useMemo<WalletContextValue>(() => {
    if (accountMode) {
      // Signed in: the balance is the account's, and nothing here may move coins (the server does).
      return {
        mode: 'account',
        balance: accountBalance,
        canRefill: false,
        refill: () => {},
        history: [],
        stats: wallet.stats,
        startRound: () => null,
        raiseStake: () => false,
        settleRound: () => 0,
        isOpen: () => false,
        openStake: () => null,
        bookInstantRound: () => ({ ok: false, reason: 'elsewhere' }),
        wasSettled: () => false,
        activeHere: true,
        playHere: () => {},
      };
    }
    return {
      mode: 'local',
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
      bookInstantRound,
      wasSettled,
      activeHere,
      playHere,
    };
  }, [accountMode, accountBalance, wallet, refill, startRound, raiseStake, settleRound, isOpen, openStake, bookInstantRound, wasSettled, activeHere, playHere]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

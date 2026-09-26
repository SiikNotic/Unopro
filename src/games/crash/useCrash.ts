// CRASH state for the screen: polls the database (which also moves the rounds forward), keeps the offset
// between the device clock and the database clock, and sends bets and cash-outs. The database decides every
// outcome; this hook only mirrors it and draws the time in between.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/account/useAccount';
import type { RpcErrorCode } from '@/account/rpc';
import { cashOut, fetchState, placeBet } from './api';
import type { CrashState } from './api';

export type CrashPhase = 'betting' | 'countdown' | 'flying' | 'crashed';

/** Countdown shown before take-off (the last seconds of the betting window). */
export const COUNTDOWN_MS = 3000;

/** The phase of a round at `now` (database clock). The crash itself is only known when the server says so. */
export function phaseOf(round: CrashState['round'], now: number): CrashPhase {
  if (round.crashed) return 'crashed';
  if (now < round.startsAt - COUNTDOWN_MS) return 'betting';
  if (now < round.startsAt) return 'countdown';
  return 'flying';
}

const POLL_MS: Record<CrashPhase, number> = { betting: 1000, countdown: 500, flying: 350, crashed: 900 };

export type CrashError = RpcErrorCode | 'round_closed' | 'crashed' | 'disabled';

export interface CrashApi {
  state: CrashState | null;
  /** Database time now (ms), from the device clock and the measured offset. */
  serverNow: () => number;
  loading: boolean;
  offline: boolean;
  betting: boolean;
  cashing: boolean;
  error: CrashError | null;
  /** The cash-out this device made in the current round (shown at once, before the next poll). */
  cashed: { round: number; multiplier: number; payout: number } | null;
  bet: (amount: number, auto: number | null) => Promise<boolean>;
  cashout: () => Promise<boolean>;
  clearError: () => void;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);

export function useCrash(): CrashApi {
  const account = useAccount();
  const signedIn = account.status === 'user';
  const [state, setState] = useState<CrashState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [betting, setBetting] = useState(false);
  const [cashing, setCashing] = useState(false);
  const [error, setError] = useState<CrashError | null>(null);
  const [cashed, setCashed] = useState<CrashApi['cashed']>(null);
  const offset = useRef(0);
  const stateRef = useRef<CrashState | null>(null);
  // The request id of a bet that didn't get an answer: a retry sends the same one (never a second bet).
  const pendingBet = useRef<{ key: string; id: string } | null>(null);
  const setBalance = account.setBalance;

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const apply = useCallback(
    (next: CrashState, sentAt: number, receivedAt: number) => {
      // Offset from the request's midpoint; smoothed so one slow answer doesn't jolt the rocket.
      const measured = next.now - (sentAt + receivedAt) / 2;
      offset.current = stateRef.current ? offset.current * 0.7 + measured * 0.3 : measured;
      stateRef.current = next;
      setState(next);
      if (next.balance !== null && signedIn) setBalance(next.balance);
    },
    [setBalance, signedIn],
  );

  const poll = useCallback(async () => {
    const sentAt = Date.now();
    const res = await fetchState(signedIn);
    const receivedAt = Date.now();
    setLoading(false);
    if (!res.ok) {
      setOffline(true);
      return;
    }
    setOffline(false);
    apply(res.data, sentAt, receivedAt);
  }, [apply, signedIn]);

  useEffect(() => {
    let stop = false;
    let timer: number | null = null;
    const loop = async () => {
      if (stop) return;
      if (!document.hidden) await poll();
      if (stop) return;
      const s = stateRef.current;
      const wait = s ? POLL_MS[phaseOf(s.round, Date.now() + offset.current)] : 1500;
      timer = window.setTimeout(loop, document.hidden ? 2000 : wait);
    };
    void loop();
    const onVisible = () => {
      if (!document.hidden && timer !== null) {
        window.clearTimeout(timer);
        void loop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const failCode = (code: RpcErrorCode, detail: string): CrashError => {
    if (code === 'conflict' && /round_closed/.test(detail)) return 'round_closed';
    if (code === 'conflict' && /crashed/.test(detail)) return 'crashed';
    if (/game_disabled/.test(detail)) return 'disabled';
    return code;
  };

  const bet = useCallback(
    async (amount: number, auto: number | null) => {
      const s = stateRef.current;
      if (!signedIn || !s || betting) return false;
      const key = `${s.round.id}:${amount}:${auto ?? ''}`;
      const id = pendingBet.current?.key === key ? pendingBet.current.id : newId();
      pendingBet.current = { key, id };
      setBetting(true);
      setError(null);
      const res = await placeBet(id, amount, auto);
      setBetting(false);
      if (!res.ok) {
        if (res.code !== 'network') pendingBet.current = null;
        setError(failCode(res.code, res.detail));
        return false;
      }
      pendingBet.current = null;
      if (res.data.balance !== null) setBalance(res.data.balance);
      await poll();
      return true;
    },
    [betting, poll, setBalance, signedIn],
  );

  const cashout = useCallback(async () => {
    const s = stateRef.current;
    if (!signedIn || !s || cashing) return false;
    setCashing(true);
    setError(null);
    const res = await cashOut(s.round.id);
    setCashing(false);
    if (!res.ok) {
      setError(failCode(res.code, res.detail));
      void poll();
      return false;
    }
    setCashed({ round: s.round.id, multiplier: res.data.multiplier, payout: res.data.payout });
    if (res.data.balance !== null) setBalance(res.data.balance);
    void poll();
    return true;
  }, [cashing, poll, setBalance, signedIn]);

  return { state, serverNow, loading, offline, betting, cashing, error, cashed, bet, cashout, clearError: () => setError(null) };
}

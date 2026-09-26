// HORSE RACING state for the screen: polls the database (which also moves the races forward), keeps the offset
// between the device clock and the database clock, and sends bets. The database decides every race; this hook
// only mirrors it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/account/useAccount';
import type { RpcErrorCode } from '@/account/rpc';
import { fetchHorseState, placeHorseBet } from './api';
import type { HorseState } from './api';

export type RacePhase = 'betting' | 'countdown' | 'racing' | 'result';

/** Countdown before the gates open (the last seconds of the betting window). */
export const COUNTDOWN_MS = 3500;

/** The phase of a race at `now` (database clock). */
export function racePhase(race: HorseState['race'], now: number): RacePhase {
  if (race.finished || (race.finishAt !== null && now >= race.finishAt)) return 'result';
  if (now < race.startsAt - COUNTDOWN_MS) return 'betting';
  if (now < race.startsAt) return 'countdown';
  return 'racing';
}

const POLL_MS: Record<RacePhase, number> = { betting: 1500, countdown: 500, racing: 1500, result: 1000 };

export type HorseError = RpcErrorCode | 'race_closed' | 'disabled';

export interface HorseApi {
  state: HorseState | null;
  serverNow: () => number;
  loading: boolean;
  offline: boolean;
  betting: boolean;
  error: HorseError | null;
  bet: (horse: number, amount: number) => Promise<boolean>;
  clearError: () => void;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);

export function useHorseRace(): HorseApi {
  const account = useAccount();
  const signedIn = account.status === 'user';
  const [state, setState] = useState<HorseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [betting, setBetting] = useState(false);
  const [error, setError] = useState<HorseError | null>(null);
  const offset = useRef(0);
  const stateRef = useRef<HorseState | null>(null);
  // The request id of a bet that got no answer: a retry sends the same one (never a second bet).
  const pendingBet = useRef<{ key: string; id: string } | null>(null);
  const setBalance = account.setBalance;

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const poll = useCallback(async () => {
    const sentAt = Date.now();
    const res = await fetchHorseState(signedIn);
    const receivedAt = Date.now();
    setLoading(false);
    if (!res.ok) {
      setOffline(true);
      return;
    }
    setOffline(false);
    const measured = res.data.now - (sentAt + receivedAt) / 2;
    offset.current = stateRef.current ? offset.current * 0.7 + measured * 0.3 : measured;
    stateRef.current = res.data;
    setState(res.data);
    if (res.data.balance !== null && signedIn) setBalance(res.data.balance);
  }, [setBalance, signedIn]);

  useEffect(() => {
    let stop = false;
    let timer: number | null = null;
    const loop = async () => {
      if (stop) return;
      if (!document.hidden) await poll();
      if (stop) return;
      const s = stateRef.current;
      let wait = s ? POLL_MS[racePhase(s.race, Date.now() + offset.current)] : 1500;
      // Right when the gates open or the race ends, ask at once (the paths / the result are due).
      if (s) {
        const now = Date.now() + offset.current;
        const next = [s.race.startsAt + 50, (s.race.finishAt ?? 0) + 50].filter((t) => t > now);
        if (next.length) wait = Math.min(wait, Math.max(100, Math.min(...next) - now));
      }
      timer = window.setTimeout(loop, document.hidden ? 3000 : wait);
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

  const bet = useCallback(
    async (horse: number, amount: number) => {
      const s = stateRef.current;
      if (!signedIn || !s || betting) return false;
      const key = `${s.race.id}:${horse}:${amount}`;
      const id = pendingBet.current?.key === key ? pendingBet.current.id : newId();
      pendingBet.current = { key, id };
      setBetting(true);
      setError(null);
      const res = await placeHorseBet(id, horse, amount);
      setBetting(false);
      if (!res.ok) {
        if (res.code !== 'network') pendingBet.current = null;
        setError(res.code === 'conflict' && /race_closed/.test(res.detail) ? 'race_closed' : /game_disabled/.test(res.detail) ? 'disabled' : res.code);
        return false;
      }
      pendingBet.current = null;
      if (res.data.balance !== null) setBalance(res.data.balance);
      await poll();
      return true;
    },
    [betting, poll, setBalance, signedIn],
  );

  return { state, serverNow, loading, offline, betting, error, bet, clearError: () => setError(null) };
}

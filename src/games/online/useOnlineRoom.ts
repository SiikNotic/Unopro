import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onlineConfig, roomCall, subscribeView } from './client';
import type { LinkState, OnlineConfig } from './client';
import type { RoomErrorCode, RoomRequest, RoomView } from './protocol';
import type { DominoAction } from '@/games/domino/engine';
import type { BingoAction } from '@/games/bingo/engine';

/** How often each client nudges the server clock (bots, balls, timeouts). The server decides if it's time. */
const TICK_MS = { lobby: 3000, domino: 1000, bingo: 700, carta: 800, blackjack: 800, roulette: 1000 } as const;

export interface OnlineRoom {
  view: RoomView | null;
  /** Bumps when a view with new events arrives (effects react once per change). */
  seq: number;
  error: RoomErrorCode | null;
  link: LinkState;
  act: (action: DominoAction | BingoAction | Record<string, unknown>) => Promise<{ ok: boolean; code?: RoomErrorCode; detail?: string }>;
  /** Resolves with the outcome, so a screen can say why a start or rematch was refused. */
  send: (req: { op: 'ready'; ready: boolean } | { op: 'start' | 'leave' | 'rematch' }) => Promise<{ ok: boolean; code?: RoomErrorCode; detail?: string }>;
}

/**
 * Keeps this player's view of an online room current: first a sync, then Realtime pushes, with the
 * periodic tick as the fallback (and the thing that lets the server's clock move on).
 */
export function useOnlineRoom(code: string, config?: OnlineConfig | null): OnlineRoom {
  // One stable config per mount (a new object each render would re-run every effect below).
  const cfg = useMemo(() => (config === undefined ? onlineConfig() : config), [config]);
  const [view, setView] = useState<RoomView | null>(null);
  const [seq, setSeq] = useState(0);
  const [error, setError] = useState<RoomErrorCode | null>(null);
  const [link, setLink] = useState<LinkState>('connecting');
  const current = useRef<RoomView | null>(null);

  const accept = useCallback((v: RoomView) => {
    const cur = current.current;
    if (cur && v.version < cur.version) return;
    if (cur && v.version === cur.version) {
      // Same state (e.g. a tick with nothing new): keep the events already shown, just refresh the clock.
      current.current = { ...cur, serverNow: Math.max(cur.serverNow, v.serverNow) };
      return;
    }
    current.current = v;
    setView(v);
    setSeq((s) => s + 1);
  }, []);

  const call = useCallback(
    async (req: RoomRequest) => {
      if (!cfg) return { ok: false as const, code: 'unauthorized' as const };
      const res = await roomCall(cfg, req);
      if (res.ok) {
        accept(res.view);
        setError(null);
      } else if (res.code !== 'rule') setError(res.code);
      return res;
    },
    [cfg, accept]
  );

  useEffect(() => {
    void call({ op: 'sync', code });
  }, [call, code]);

  // Realtime push, once the room id is known.
  const roomId = view?.roomId;
  useEffect(() => {
    if (!cfg || !roomId) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    subscribeView(cfg, roomId, accept, setLink)
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => setLink('polling'));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [cfg, roomId, accept]);

  // Tick: lets the server run bots/balls/timeouts on its clock, and is the polling fallback.
  const status = view?.status;
  const game = view?.game;
  useEffect(() => {
    if (!status || status === 'closed') return;
    const every = status === 'lobby' ? (game === 'carta' ? 1000 : TICK_MS.lobby) : TICK_MS[game ?? 'domino'];
    const id = window.setInterval(() => {
      if (!document.hidden) void call({ op: status === 'lobby' ? 'sync' : 'tick', code });
    }, every);
    return () => window.clearInterval(id);
  }, [status, game, code, call]);

  const act = useCallback(
    async (action: DominoAction | BingoAction | Record<string, unknown>) => {
      const res = await call({ op: 'act', code, action });
      return res.ok ? { ok: true } : { ok: false, code: res.code, detail: res.detail };
    },
    [call, code]
  );
  const send = useCallback<OnlineRoom['send']>(
    async (req) => {
      const res = await call({ ...req, code } as RoomRequest);
      return res.ok ? { ok: true } : { ok: false, code: res.code, detail: res.detail };
    },
    [call, code]
  );

  return { view, seq, error, link, act, send };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HOUSE, LocalHost } from './multiplayer/host';
import type { GameRules, SeatDriver } from './multiplayer/types';

export interface LocalMatch<S, A, V, E> {
  state: S;
  /** Events produced by the last applied action (sounds, animations). */
  events: E[];
  /** Bumps on every applied action, so effects can react to the same event list only once. */
  version: number;
  view: (playerId: string) => V;
  /** A local seat proposes an action; the host validates it. */
  act: (playerId: string, action: A) => { ok: true } | { ok: false; error: string };
  /** The authority's own actions (e.g. calling the next Bingo number). */
  house: (action: A) => { ok: true } | { ok: false; error: string };
  reset: (state: S) => void;
}

/**
 * Runs a match on this device: a LocalHost holds the authoritative state; local humans propose actions
 * through act(); automated seats (bots, and one day remote players) are driven by their SeatDriver from
 * their own view, after the delay the driver asks for. Nothing here knows any game rules.
 */
export function useLocalMatch<S, A extends { type: string; playerId?: string }, V, E>(
  rules: GameRules<S, A, V, E>,
  initial: () => S,
  drivers: Record<string, SeatDriver<V, A>>,
  options: { paused?: boolean; actorsOf: (state: S) => string[] }
): LocalMatch<S, A, V, E> {
  const hostRef = useRef<LocalHost<S, A, V, E> | null>(null);
  if (!hostRef.current) hostRef.current = new LocalHost(rules, initial());
  const host = hostRef.current;
  const [snap, setSnap] = useState<{ state: S; events: E[]; version: number }>({ state: host.state, events: [], version: 0 });

  useEffect(() => host.subscribe((state, events) => setSnap((s) => ({ state, events, version: s.version + 1 }))), [host]);

  const act = useCallback((playerId: string, action: A) => {
    const r = host.submit(playerId, action);
    return r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error } as const);
  }, [host]);
  const house = useCallback((action: A) => {
    const r = host.submit(HOUSE, action);
    return r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error } as const);
  }, [host]);
  const view = useCallback((playerId: string) => host.view(playerId), [host]);
  const reset = useCallback((state: S) => host.reset(state), [host]);

  // Automated seats: each one that may act now gets one pending decision, taken from its own view. A
  // pending decision survives other seats' actions as long as it is still the same decision (so several
  // bots acting at once don't keep postponing each other); otherwise it is re-decided.
  const { paused = false, actorsOf } = options;
  const pending = useRef(new Map<string, { key: string; timer: number }>());
  useEffect(() => {
    const live = pending.current;
    const keep = new Set<string>();
    if (!paused) {
      for (const id of actorsOf(snap.state)) {
        const driver = drivers[id];
        if (!driver) continue;
        const decision = driver.decide(host.view(id), id);
        if (!decision) continue;
        const key = JSON.stringify(decision.action);
        keep.add(id);
        if (live.get(id)?.key === key) continue;
        if (live.has(id)) window.clearTimeout(live.get(id)!.timer);
        const timer = window.setTimeout(() => {
          live.delete(id);
          host.submit(id, decision.action);
        }, decision.delayMs);
        live.set(id, { key, timer });
      }
    }
    for (const [id, p] of live) {
      if (!keep.has(id)) {
        window.clearTimeout(p.timer);
        live.delete(id);
      }
    }
  }, [snap.version, snap.state, drivers, paused, actorsOf, host]);
  useEffect(() => {
    const live = pending.current;
    return () => {
      for (const p of live.values()) window.clearTimeout(p.timer);
      live.clear();
    };
  }, []);

  return useMemo(() => ({ state: snap.state, events: snap.events, version: snap.version, view, act, house, reset }), [snap, view, act, house, reset]);
}

import type { ApplyResult, GameRules } from './types';

export const HOUSE = '__house__';

export type Submitted<S, E> = ApplyResult<S, E>;

/**
 * The authoritative copy of a match, run on this device. Every action goes through submit(): it is parsed
 * as untrusted input, the proposing seat must be the sender (no acting for someone else), house-only
 * actions are refused from seats, and the rules decide the rest. A server would do exactly this.
 */
export class LocalHost<S, A extends { type: string; playerId?: string }, V, E> {
  private listeners = new Set<(state: S, events: E[]) => void>();

  constructor(
    private readonly rules: GameRules<S, A, V, E>,
    private current: S
  ) {}

  get state(): S {
    return this.current;
  }

  view(playerId: string): V {
    return this.rules.viewFor(this.current, playerId);
  }

  /** `sender` is the seat the action came from (or HOUSE for the authority's own actions). */
  submit(sender: string, raw: unknown): Submitted<S, E> {
    const action = this.rules.parseAction(raw);
    if (!action) return { ok: false, error: 'malformed' };
    const house = this.rules.isHouseAction?.(action) ?? false;
    if (house !== (sender === HOUSE)) return { ok: false, error: house ? 'house_only' : 'forbidden' };
    if (!house && action.playerId !== sender) return { ok: false, error: 'impersonation' };
    const result = this.rules.apply(this.current, action);
    if (result.ok) {
      this.current = result.state;
      for (const l of this.listeners) l(result.state, result.events);
    }
    return result;
  }

  /** Replaces the whole state (a new match). */
  reset(state: S): void {
    this.current = state;
    for (const l of this.listeners) l(state, []);
  }

  subscribe(listener: (state: S, events: E[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

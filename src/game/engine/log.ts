import type { Card, CardColor, GameLogEntry, GameLogType, GameState } from './types';

/** Per-action context. The engine never reads the clock or Math.random directly. */
export interface EngineContext {
  rng: import('./rng').Rng;
  timestamp: number;
}

export function addLog(
  state: GameState,
  ctx: EngineContext,
  type: GameLogType,
  message: string,
  extra: { playerId?: string; card?: Card; color?: CardColor; amount?: number } = {}
): void {
  const last = state.log[state.log.length - 1];
  const entry: GameLogEntry = {
    seq: last ? last.seq + 1 : 1,
    type,
    roundNumber: state.roundNumber,
    turnNumber: state.turnNumber,
    timestamp: ctx.timestamp,
    message,
    ...extra,
  };
  state.log.push(entry);
}

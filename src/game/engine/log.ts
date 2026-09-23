import type { CardColor, GameLogEntry, GameLogType } from './types';

export function createLogEntry(
  type: GameLogType,
  message: string,
  extra?: { playerId?: string; cardId?: string; color?: CardColor; amount?: number }
): GameLogEntry {
  return {
    type,
    timestamp: Date.now(),
    message,
    ...extra,
  };
}

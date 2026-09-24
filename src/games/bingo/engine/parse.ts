// Strict parsing of untrusted Bingo actions. Anything unexpected → null.
import type { BingoAction } from './types';

const ID = /^[A-Za-z0-9_-]{1,32}$/;

export function parseBingoAction(raw: unknown): BingoAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(',');
  switch (r.type) {
    case 'CALL_NUMBER':
    case 'CLOSE_ROUND':
      return keys === 'type' ? { type: r.type } : null;
    case 'MARK_NUMBER':
      if (keys !== 'number,playerId,type' || typeof r.playerId !== 'string' || !ID.test(r.playerId)) return null;
      return Number.isInteger(r.number) && (r.number as number) >= 1 && (r.number as number) <= 75 ? { type: 'MARK_NUMBER', playerId: r.playerId, number: r.number as number } : null;
    case 'CLAIM':
    case 'NEXT_ROUND':
      if (keys !== 'playerId,type' || typeof r.playerId !== 'string' || !ID.test(r.playerId)) return null;
      return { type: r.type, playerId: r.playerId };
    default:
      return null;
  }
}

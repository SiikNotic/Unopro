// Strict parsing of untrusted actions (network, storage, tests). Anything unexpected → null.
import type { DominoAction } from './types';

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const TILE = /^[0-6]-[0-6]$/;

export function parseDominoAction(raw: unknown): DominoAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.playerId !== 'string' || !ID.test(r.playerId)) return null;
  const keys = Object.keys(r).sort().join(',');
  switch (r.type) {
    case 'PLAY_TILE':
      if (keys !== 'end,playerId,tileId,type') return null;
      if (typeof r.tileId !== 'string' || !TILE.test(r.tileId) || (r.end !== 'left' && r.end !== 'right')) return null;
      return { type: 'PLAY_TILE', playerId: r.playerId, tileId: r.tileId, end: r.end };
    case 'DRAW':
    case 'PASS':
    case 'NEXT_ROUND':
      if (keys !== 'playerId,type') return null;
      return { type: r.type, playerId: r.playerId };
    default:
      return null;
  }
}

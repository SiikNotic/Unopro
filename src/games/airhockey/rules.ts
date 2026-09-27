// AIR HOCKEY: what a match for coins may be. The entries are the same list as the staked online rooms, and the
// winner takes the pot (the entry of both sides), the rule of a two-player staked room.
import { STAKES } from '@/games/online/protocol';
import { AI_LEVEL_IDS } from './ai';
import type { AiLevel } from './ai';

/** Entries for coins (0 = a free practice match, played locally and never booked). */
export const AH_STAKES = STAKES.filter((s) => s > 0) as readonly number[];
export const AH_ENTRY_OPTIONS = STAKES as readonly number[];
export const DEFAULT_ENTRY = 500;

export const isAiLevel = (x: unknown): x is AiLevel => AI_LEVEL_IDS.includes(x as AiLevel);

/** What a result pays back for an entry: the pot for a win, the entry for a draw, nothing for a loss. */
export function payoutFor(outcome: 'won' | 'lost' | 'draw', entry: number): number {
  return outcome === 'won' ? entry * 2 : outcome === 'draw' ? entry : 0;
}

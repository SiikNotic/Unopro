// Bingo bots: they watch the called balls and their own card (their BingoView) and daub like a person —
// one number at a time, after a reaction delay that depends on the difficulty, sometimes late. They shout
// BINGO only for a line they really have (the engine would reject anything else anyway).
import { createRng, hashSeed } from '@/games/shared/rng';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import type { BingoAction } from '../engine/types';
import type { BingoView } from '../engine/view';
import type { Difficulty } from '@/games/shared/setup';

/** [min, max] reaction time in ms for daubing and for shouting BINGO, and how often they're distracted. */
const PACE: Record<Difficulty, { mark: [number, number]; claim: [number, number]; distracted: number }> = {
  easy: { mark: [1300, 2600], claim: [1400, 2800], distracted: 0.3 },
  normal: { mark: [750, 1500], claim: [800, 1600], distracted: 0.12 },
  hard: { mark: [420, 850], claim: [380, 760], distracted: 0.03 },
};

export function decideBingo(view: BingoView, difficulty: Difficulty, seed: number): { action: BingoAction; delayMs: number } | null {
  if (view.status === 'round_over') return null;
  const pace = PACE[difficulty];
  const rng = createRng(hashSeed(`${seed}|${view.me}|${view.round}|${view.called.length}|${view.toMark.join(',')}|${view.canClaim}`));
  const within = ([lo, hi]: [number, number]) => lo + rng.next() * (hi - lo);
  if (view.canClaim && view.called.length >= view.claimBlockedUntil) {
    return { action: { type: 'CLAIM', playerId: view.me }, delayMs: within(pace.claim) };
  }
  if (view.toMark.length > 0) {
    // The newest ball first (that's what they just heard); a distracted player notices a few seconds late.
    const number = view.toMark[view.toMark.length - 1];
    const late = rng.next() < pace.distracted ? 1800 + rng.next() * 2200 : 0;
    return { action: { type: 'MARK_NUMBER', playerId: view.me, number }, delayMs: within(pace.mark) + late };
  }
  return null;
}

export function bingoBotDriver(difficulty: Difficulty, seed: number): SeatDriver<BingoView, BingoAction> {
  return { decide: (view) => decideBingo(view, difficulty, seed) };
}

// AIR HOCKEY: the opponent. Deterministic (seeded) so the server can replay a match exactly: see engine.ts.
//
// The AI looks at the table only every `react` ticks (its reaction time) and keeps going to the spot it chose
// in between; its mallet can't move faster than `speed`. When the puck is in its half it lines up behind the
// puck and strikes it towards the player's goal (aim noise, and now and then a real mistake); otherwise it
// guards its goal, placing itself where it predicts the puck will arrive.
import type { Rng } from '@/game/engine/rng';
import { AI_HOME, GOAL_X0, GOAL_X1, MALLET_R, MID, PUCK_R, W, H, clamp } from './table';
import type { MatchState } from './engine';

export type AiLevel = 'easy' | 'normal' | 'hard';
export const AI_LEVEL_IDS: AiLevel[] = ['easy', 'normal', 'hard'];

export interface AiParams {
  /** Ticks between two looks at the table. */
  react: number;
  /** Top mallet speed, units per second. */
  speed: number;
  /** Aim error, units. */
  noise: number;
  /** Chance of a clear mistake on a strike. */
  miss: number;
  /** How far in front of its goal it waits. */
  guard: number;
  /** How far ahead it predicts the puck (0..1). */
  foresight: number;
}

export const AI_LEVELS: Record<AiLevel, AiParams> = {
  easy: { react: 14, speed: 1250, noise: 130, miss: 0.3, guard: 200, foresight: 0.45 },
  normal: { react: 8, speed: 1750, noise: 75, miss: 0.17, guard: 175, foresight: 0.75 },
  hard: { react: 3, speed: 2650, noise: 24, miss: 0.04, guard: 150, foresight: 1 },
};

export interface AiMemory {
  tx: number;
  ty: number;
  /** Ticks until the next look. */
  wait: number;
  /** The shot planned while the puck is in its half: an aim point beyond the player's goal line (x), or null. */
  aim: number | null;
}

const REACH = PUCK_R + MALLET_R;
const span = W - 2 * PUCK_R;

/** Where a puck moving at x with speed vx will be after time t, bouncing off the side walls. */
function foldX(x: number, vx: number, t: number): number {
  let u = x - PUCK_R + vx * t;
  const period = 2 * span;
  u -= Math.floor(u / period) * period;
  if (u > span) u = period - u;
  return u + PUCK_R;
}

export function aiThink(s: MatchState, rng: Rng): AiMemory {
  const mem = s.mem;
  if (mem.wait > 0) return { ...mem, wait: mem.wait - 1 };
  const lv = AI_LEVELS[s.level];
  let aim = mem.aim;
  const next = (tx: number, ty: number): AiMemory => ({ tx: clamp(tx, MALLET_R, W - MALLET_R), ty: clamp(ty, MALLET_R, MID - MALLET_R), wait: lv.react - 1, aim });
  const jitter = () => (rng.next() - 0.5) * 2 * lv.noise;

  if (s.phase !== 'play') {
    aim = null;
    return next(AI_HOME.x, AI_HOME.y);
  }

  const p = s.puck;
  const m = s.ai;

  if (p.y < MID - 4) {
    // The puck is in our half.
    if (p.y < m.y - 12) {
      // It got behind the mallet: go round it (never push it into our own goal).
      const side = p.x < W / 2 ? 1 : -1;
      return next(p.x + side * (REACH + 30), p.y - 40);
    }
    if (aim === null) {
      // Plan the shot: into a corner of the goal, or off a side wall (aiming at the mirror image of a corner).
      const corner = rng.next() < 0.5 ? GOAL_X0 + 45 : GOAL_X1 - 45;
      const kind = rng.next();
      // A bank shot only when the puck is far enough from that wall for the angle to work.
      if (kind < 0.25 && p.x > 280) aim = 2 * PUCK_R - corner;
      else if (kind < 0.5 && p.x < W - 280) aim = 2 * (W - PUCK_R) - corner;
      else aim = corner;
    }
    const aimX = aim + jitter();
    const aimY = H + 60;
    let dx = aimX - p.x;
    let dy = aimY - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    dx /= d;
    dy /= d;
    // Behind the puck, on the line to the aim point?
    const bx = m.x - p.x;
    const by = m.y - p.y;
    const along = bx * dx + by * dy;
    const across = bx * dy - by * dx;
    if (along < -REACH * 0.6 && across * across < 60 * 60) {
      let tx = p.x + dx * 150;
      const ty = p.y + dy * 150;
      if (rng.next() < lv.miss) tx += (rng.next() - 0.5) * 520;
      return next(tx, ty);
    }
    return next(p.x - dx * (REACH + 28) + jitter() * 0.3, p.y - dy * (REACH + 28));
  }

  // The puck is in the player's half: guard the goal.
  aim = null;
  let px = p.x;
  if (p.vy < -60) {
    const t = ((p.y - lv.guard) / -p.vy) * lv.foresight;
    px = foldX(p.x, p.vx, t);
  }
  const centre = W / 2;
  const tx = clamp(centre + (px - centre) * 0.7 + jitter() * 0.5, GOAL_X0 - 50, GOAL_X1 + 50);
  return next(tx, lv.guard);
}

// The computer player. It plays the way a person thinks a shot through, with the real physics:
//   1. for every legal ball and every pocket, find the ghost-ball aim point and keep only the shots a player
//      could actually make (clear path to the ball, clear path to the pocket, a cut it can play);
//   2. judge the power each needs from the friction model;
//   3. play the best few through the same simulation and rules the game uses, keeping those that really
//      pocket the ball without a foul (stronger levels also try follow and draw, and look at what the cue
//      ball leaves for the next shot);
//   4. if nothing goes in, play a safe legal hit instead;
//   5. then miss like a person: angle and power errors that shrink with the level.
// Deterministic for a given state and seed (the caller adds the thinking pause).
import { BALL_D, BALL_R, HEAD_X, POCKETS, TABLE_H, TABLE_W } from './table';
import { MAX_SPEED, MIN_SPEED, rollDistance, speedAfter, speedToRoll } from './physics';
import { applyShot, canPlaceCue, legalTargets, onEight } from './rules';
import type { BilliardsState, Shot } from './rules';
import type { BallState } from './physics';
import { createRng } from '@/games/shared/rng';
import type { Rng } from '@/games/shared/rng';

export type BotLevel = 'easy' | 'normal' | 'hard' | 'expert';
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard', 'expert'];

interface LevelSpec {
  /** Aim error, standard deviation (radians). */
  aim: number;
  /** Power error, relative standard deviation. */
  power: number;
  /** Candidates played through the simulation. */
  tries: number;
  /** Plays the best shot this often, otherwise one of the next best. */
  focus: number;
  /** Tries follow / draw and judges the leave. */
  position: boolean;
  /** Thinking pause range (ms). */
  think: [number, number];
}

export const LEVELS: Record<BotLevel, LevelSpec> = {
  easy: { aim: 0.042, power: 0.18, tries: 3, focus: 0.45, position: false, think: [900, 1500] },
  normal: { aim: 0.019, power: 0.09, tries: 5, focus: 0.75, position: false, think: [800, 1400] },
  hard: { aim: 0.009, power: 0.05, tries: 8, focus: 0.92, position: true, think: [700, 1300] },
  expert: { aim: 0.0042, power: 0.03, tries: 12, focus: 1, position: true, think: [650, 1200] },
};

export interface BotPlan {
  shot: Shot;
  /** How long to "think" before shooting (ms). */
  thinkMs: number;
  /** For debugging and tests: the ball and pocket it went for (null: a safety). */
  target: number | null;
  pocket: number | null;
}

interface Candidate {
  target: number;
  pocket: number;
  cue: { x: number; y: number };
  dx: number;
  dy: number;
  power: number;
  score: number;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Distance from point P to segment AB. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return dist(px, py, ax + ex * t, ay + ey * t);
}

/** Is the straight path from A to B free of every ball except the ones listed? */
function clearPath(balls: readonly BallState[], ax: number, ay: number, bx: number, by: number, skip: number[]): boolean {
  for (const b of balls) {
    if (b.down || skip.includes(b.id)) continue;
    if (segDist(b.x, b.y, ax, ay, bx, by) < BALL_D - 0.05) return false;
  }
  return true;
}

/** The shots a player could actually make from `cue`, best first. */
function findShots(s: BilliardsState, balls: readonly BallState[], cue: { x: number; y: number }, targets: number[]): Candidate[] {
  const out: Candidate[] = [];
  for (const id of targets) {
    const ob = balls.find((b) => b.id === id && !b.down);
    if (!ob) continue;
    for (let p = 0; p < POCKETS.length; p++) {
      const pk = POCKETS[p];
      const toP = dist(ob.x, ob.y, pk.aimX, pk.aimY);
      if (toP < 1) continue;
      const ux = (pk.aimX - ob.x) / toP;
      const uy = (pk.aimY - ob.y) / toP;
      // Side pockets only take balls coming in at a reasonable angle.
      if (pk.side && Math.abs(uy) < 0.42) continue;
      const gx = ob.x - ux * BALL_D;
      const gy = ob.y - uy * BALL_D;
      const toG = dist(cue.x, cue.y, gx, gy);
      if (toG < 0.5) continue;
      const ax = (gx - cue.x) / toG;
      const ay = (gy - cue.y) / toG;
      const cos = ax * ux + ay * uy;
      if (cos < 0.2) continue; // cuts thinner than ~78° aren't played
      if (!clearPath(balls, cue.x, cue.y, gx, gy, [0, id])) continue;
      if (!clearPath(balls, ob.x, ob.y, pk.aimX, pk.aimY, [0, id])) continue;
      // Power: the object ball must reach the pocket, so the cue ball must arrive fast enough.
      const need = speedToRoll(toP + 18) / Math.max(0.25, cos);
      const start = speedToRoll(toG + rollDistance(need));
      const power = Math.min(1, Math.max(0.08, (start * 1.08 - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));
      const ease = pk.side ? 0.85 : 1;
      const score = cos * cos * ease * (1 / (1 + toG / 160)) * (1 / (1 + toP / 120));
      out.push({ target: id, pocket: p, cue, dx: ax, dy: ay, power, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Places for the cue ball when the bot has it in hand: straight-in positions behind each makeable ball. */
function cueSpots(s: BilliardsState, targets: number[]): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const kitchen = s.phase === 'break';
  for (const id of targets) {
    const ob = s.balls.find((b) => b.id === id && !b.down);
    if (!ob) continue;
    for (const pk of POCKETS) {
      const toP = dist(ob.x, ob.y, pk.aimX, pk.aimY);
      const ux = (pk.aimX - ob.x) / toP;
      const uy = (pk.aimY - ob.y) / toP;
      for (const back of [22, 38]) {
        const x = ob.x - ux * (BALL_D + back);
        const y = ob.y - uy * (BALL_D + back);
        if (canPlaceCue(s, x, y)) spots.push({ x, y });
      }
    }
  }
  if (!spots.length) {
    // Anywhere free: a coarse grid.
    for (let x = 20; x < (kitchen ? HEAD_X : TABLE_W - 10); x += 18) for (let y = 12; y < TABLE_H - 10; y += 16) if (canPlaceCue(s, x, y)) spots.push({ x, y });
  }
  return spots;
}

/** How many makeable shots the player to move would have from this position (the leave). */
function leaveScore(s: BilliardsState): number {
  const cue = s.balls.find((b) => b.id === 0 && !b.down);
  if (!cue || s.phase === 'over') return 0;
  const shots = findShots(s, s.balls, cue, legalTargets(s, s.turn));
  return shots.slice(0, 3).reduce((t, c) => t + c.score, 0);
}

function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Turns (dx, dy) by `a` radians. */
function rotate(dx: number, dy: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dx * c - dy * s, dx * s + dy * c];
}

/** The bot's decision for the player to move. */
export function planShot(s: BilliardsState, level: BotLevel, seed: number): BotPlan {
  const spec = LEVELS[level];
  const rng = createRng((seed ^ Math.imul(s.shots + 1, 0x9e3779b1)) >>> 0);
  const think = Math.round(spec.think[0] + rng.next() * (spec.think[1] - spec.think[0]));
  const me = s.turn;

  if (s.phase === 'break') {
    // Break from near the head spot at the apex ball, as hard as the level allows.
    const y = TABLE_H / 2 + (rng.next() - 0.5) * 20;
    const apex = s.balls.reduce((a, b) => (!b.down && b.id !== 0 && b.x < a.x ? b : a), { id: -1, x: Infinity, y: 0, down: false } as BallState);
    const dx = apex.x - HEAD_X;
    const dy = apex.y - y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const [ex, ey] = rotate(dx / len, dy / len, gauss(rng) * spec.aim * 0.5);
    const power = Math.min(1, (level === 'easy' ? 0.82 : 0.95) + rng.next() * 0.05);
    return { shot: { dx: ex, dy: ey, power, cueX: HEAD_X - 1, cueY: y }, thinkMs: think, target: null, pocket: null };
  }

  const targets = legalTargets(s, me);
  const inHand = s.ballInHand;
  const cue = s.balls.find((b) => b.id === 0)!;
  const starts = inHand ? cueSpots(s, targets) : [{ x: cue.x, y: cue.y }];
  let cands: Candidate[] = [];
  for (const st of starts) {
    const balls = s.balls.map((b) => (b.id === 0 ? { ...b, x: st.x, y: st.y, down: false } : b));
    cands.push(...findShots(s, balls, st, targets));
  }
  cands.sort((a, b) => b.score - a.score);
  // Keep the best few, one per ball/pocket pair (in hand, many spots give the same shot).
  const seen = new Set<string>();
  cands = cands.filter((c) => {
    const k = `${c.target}-${c.pocket}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pool = cands.slice(0, spec.tries);
  const calling = onEight(s, me);

  type Tested = { c: Candidate; shot: Shot; value: number };
  const tested: Tested[] = [];
  for (const c of pool) {
    const spins = spec.position ? [0, 0.6, -0.6] : [0];
    for (const spinY of spins) {
      const shot: Shot = { dx: c.dx, dy: c.dy, power: c.power, spinY, ...(inHand ? { cueX: c.cue.x, cueY: c.cue.y } : {}), ...(calling ? { pocket: c.pocket } : {}) };
      const res = applyShot(s, shot);
      if (!res.ok) continue;
      const after = res.state;
      const made = after.last?.potted.includes(c.target) && !after.last.foul;
      if (!made) continue;
      if (after.phase === 'over' && after.winner !== me) continue;
      let value = c.score + 1;
      if (after.phase === 'over') value += 10;
      else if (spec.position && after.turn === me) value += leaveScore(after) * 0.8;
      tested.push({ c, shot, value });
    }
  }
  tested.sort((a, b) => b.value - a.value);

  let chosen: Tested | null = null;
  if (tested.length) {
    const i = rng.next() < spec.focus ? 0 : Math.min(tested.length - 1, 1 + Math.floor(rng.next() * Math.min(2, tested.length - 1)));
    chosen = tested[i];
  }

  if (!chosen) {
    // No shot goes in: a legal hit that leaves the opponent as little as possible.
    const safety = safetyShot(s, starts, targets, spec.position);
    return { shot: withError(safety, spec, rng), thinkMs: think, target: null, pocket: null };
  }
  return { shot: withError(chosen.shot, spec, rng), thinkMs: think, target: chosen.c.target, pocket: chosen.c.pocket };
}

/** A legal, safe hit: tested through the simulation, avoiding fouls (and, for strong bots, open leaves). */
function safetyShot(s: BilliardsState, starts: { x: number; y: number }[], targets: number[], smart: boolean): Shot {
  const st = starts[0];
  const inHand = s.ballInHand;
  const calling = onEight(s, s.turn);
  let best: { shot: Shot; value: number } | null = null;
  for (const id of targets) {
    const ob = s.balls.find((b) => b.id === id && !b.down);
    if (!ob) continue;
    for (const off of [0, -0.6, 0.6]) {
      const dx0 = ob.x - st.x;
      const dy0 = ob.y - st.y;
      const len = Math.sqrt(dx0 * dx0 + dy0 * dy0);
      if (len < 0.5) continue;
      // Hit fuller or thinner by offsetting the aim sideways by up to a ball radius.
      const px = (-dy0 / len) * off * BALL_R;
      const py = (dx0 / len) * off * BALL_R;
      const dx = dx0 + px;
      const dy = dy0 + py;
      for (const power of [0.32, 0.48]) {
        const shot: Shot = { dx, dy, power, ...(inHand ? { cueX: st.x, cueY: st.y } : {}), ...(calling ? { pocket: 0 } : {}) };
        const res = applyShot(s, shot);
        if (!res.ok) continue;
        const after = res.state;
        if (after.phase === 'over' && after.winner !== s.turn) continue;
        let value = after.last?.foul ? -10 : 0;
        if (after.turn === s.turn && !after.last?.foul) value += 5;
        if (smart && !after.last?.foul) value -= leaveScore(after);
        if (!best || value > best.value) best = { shot, value };
      }
    }
  }
  if (best) return best.shot;
  const ob = s.balls.find((b) => targets.includes(b.id) && !b.down)!;
  return { dx: ob.x - st.x, dy: ob.y - st.y, power: 0.5, ...(inHand ? { cueX: st.x, cueY: st.y } : {}), ...(calling ? { pocket: 0 } : {}) };
}

function withError(shot: Shot, spec: LevelSpec, rng: Rng): Shot {
  const len = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy);
  const [dx, dy] = rotate(shot.dx / len, shot.dy / len, gauss(rng) * spec.aim);
  const power = Math.min(1, Math.max(0.05, shot.power * (1 + gauss(rng) * spec.power)));
  return { ...shot, dx, dy, power };
}

/** Speed checks used by the tests: the physics helpers stay consistent with each other. */
export const _internals = { findShots, speedAfter };

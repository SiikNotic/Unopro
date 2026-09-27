// AIR HOCKEY: the match, as a pure and deterministic simulation.
//
// The same code runs in the browser (to play) and in the `casino` edge function (to check a match played for
// coins): the server gets the match seed it drew and the player's input log, replays every tick and decides
// the result itself. For both runs to agree bit for bit the simulation uses only +, -, *, / and Math.sqrt
// (all exactly rounded by IEEE 754 in every engine), a fixed time step, integer inputs and the seeded
// mulberry32 generator. No Math.sin / cos / atan2 / hypot / random anywhere in here or in ai.ts.
//
// Units: the table is W × H units, the player defends the bottom goal and the AI the top one. One tick is
// 1/60 s, split into SUB physics steps so a fast puck can never jump through a wall or a mallet.
import { createRng } from '@/game/engine/rng';
import { aiThink, AI_LEVELS } from './ai';
import type { AiLevel, AiMemory } from './ai';
import { AI_HOME, clamp, GOAL_W, GOAL_X0, GOAL_X1, H, MALLET_R, MID, PLAYER_HOME, PUCK_R, W } from './table';

export { W, H, MID, PUCK_R, MALLET_R, GOAL_W, GOAL_X0, GOAL_X1, PLAYER_HOME, AI_HOME, clamp };

export const TICK_HZ = 60;
export const SUB = 4;
const DT = 1 / (TICK_HZ * SUB);

export const WIN_SCORE = 7;
/** A match can't last longer than this (a tie at the bell is a draw). */
export const MAX_TICKS = TICK_HZ * 60 * 8;

const PUCK_MAX = 2600;
const PLAYER_SPEED = 3400;
const WALL_E = 0.88;
const MALLET_E = 0.9;
/** Per physics step: the air cushion lets the puck glide, but it slows down a little. */
const FRICTION = 0.99935;
/** Time without a touch before a slow puck is nudged back into play. */
const STALL_TICKS = TICK_HZ * 3;
/** Time the puck may stay in one half before it's served to the other side (no holding the puck forever). */
const HALF_TICKS = TICK_HZ * 9;

const COUNTDOWN_TICKS = TICK_HZ * 3;
const GOAL_TICKS = Math.round(TICK_HZ * 1.4);
const SERVE_TICKS = Math.round(TICK_HZ * 0.8);

export type Side = 'player' | 'ai';
export type Phase = 'countdown' | 'play' | 'goal' | 'serve' | 'over';
export type Outcome = 'won' | 'lost' | 'draw';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface MatchState {
  level: AiLevel;
  tick: number;
  phase: Phase;
  /** Ticks left in the current phase (countdown, goal, serve). */
  left: number;
  puck: Body;
  player: Body;
  ai: Body;
  score: { player: number; ai: number };
  /** Who conceded last (serves next). */
  serveTo: Side;
  lastScorer: Side | null;
  rng: number;
  mem: AiMemory;
  stall: number;
  inHalf: number;
  outcome: Outcome | null;
}

/** What happened during one tick, for sounds and effects (never needed to decide the match). */
export type MatchEvent =
  | { type: 'hit'; by: Side; power: number }
  | { type: 'wall'; power: number }
  | { type: 'goal'; scorer: Side }
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'over'; outcome: Outcome };

export interface Input {
  x: number;
  y: number;
}


/** A player's input, as it is logged and replayed: whole units inside the player's half. */
export function clampInput(x: number, y: number): Input {
  return { x: Math.round(clamp(x, MALLET_R, W - MALLET_R)), y: Math.round(clamp(y, MID + MALLET_R, H - MALLET_R)) };
}

function servePuck(s: MatchState, to: Side) {
  const r = createRng(s.rng);
  // A little sideways offset so no two serves are the same.
  const off = (r.next() - 0.5) * 240;
  s.rng = r.state();
  s.puck = { x: W / 2 + off, y: to === 'player' ? H * 0.7 : H * 0.3, vx: 0, vy: 0 };
  s.stall = 0;
  s.inHalf = 0;
}

export function createMatch(seed: number, level: AiLevel): MatchState {
  const s: MatchState = {
    level,
    tick: 0,
    phase: 'countdown',
    left: COUNTDOWN_TICKS,
    puck: { x: W / 2, y: H * 0.7, vx: 0, vy: 0 },
    player: { ...PLAYER_HOME, vx: 0, vy: 0 },
    ai: { ...AI_HOME, vx: 0, vy: 0 },
    score: { player: 0, ai: 0 },
    serveTo: 'player',
    lastScorer: null,
    rng: seed >>> 0,
    mem: { tx: AI_HOME.x, ty: AI_HOME.y, wait: 0, aim: null },
    stall: 0,
    inHalf: 0,
    outcome: null,
  };
  servePuck(s, 'player');
  return s;
}

/** Moves a mallet towards its target, never faster than `speed` and never out of its half. */
function moveMallet(m: Body, tx: number, ty: number, speed: number, top: boolean) {
  const lo = top ? MALLET_R : MID + MALLET_R;
  const hi = top ? MID - MALLET_R : H - MALLET_R;
  tx = clamp(tx, MALLET_R, W - MALLET_R);
  ty = clamp(ty, lo, hi);
  const dx = tx - m.x;
  const dy = ty - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const step = speed * DT;
  let nx = tx;
  let ny = ty;
  if (d > step) {
    nx = m.x + (dx / d) * step;
    ny = m.y + (dy / d) * step;
  }
  m.vx = (nx - m.x) / DT;
  m.vy = (ny - m.y) / DT;
  m.x = nx;
  m.y = ny;
}

function capSpeed(p: Body) {
  const v2 = p.vx * p.vx + p.vy * p.vy;
  if (v2 > PUCK_MAX * PUCK_MAX) {
    const k = PUCK_MAX / Math.sqrt(v2);
    p.vx *= k;
    p.vy *= k;
  }
}

/** Mallet → puck. The mallet is held by a hand: it pushes, it isn't pushed back. */
function hitMallet(p: Body, m: Body, by: Side, events: MatchEvent[]): boolean {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const reach = PUCK_R + MALLET_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return false;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : by === 'player' ? -1 : 1;
  p.x = m.x + nx * reach;
  p.y = m.y + ny * reach;
  const rel = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (rel < 0) {
    p.vx -= (1 + MALLET_E) * rel * nx;
    p.vy -= (1 + MALLET_E) * rel * ny;
    capSpeed(p);
    events.push({ type: 'hit', by, power: Math.min(1, -rel / 2200) });
  }
  return true;
}

/** Bounces off a goal post (a point at the corner of the mouth). */
function hitPost(p: Body, px: number, py: number): number {
  const dx = p.x - px;
  const dy = p.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= PUCK_R * PUCK_R || d2 < 1e-9) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  p.x = px + nx * PUCK_R;
  p.y = py + ny * PUCK_R;
  const rel = p.vx * nx + p.vy * ny;
  if (rel < 0) {
    p.vx -= (1 + WALL_E) * rel * nx;
    p.vy -= (1 + WALL_E) * rel * ny;
    return -rel;
  }
  return 0;
}

/** Keeps the puck on the table; returns the strongest impact (0 = none) and the goal, if one was scored. */
function walls(p: Body): { impact: number; goal: Side | null } {
  let impact = 0;
  if (p.x < PUCK_R) {
    p.x = PUCK_R;
    if (p.vx < 0) {
      impact = Math.max(impact, -p.vx);
      p.vx = -p.vx * WALL_E;
    }
  } else if (p.x > W - PUCK_R) {
    p.x = W - PUCK_R;
    if (p.vx > 0) {
      impact = Math.max(impact, p.vx);
      p.vx = -p.vx * WALL_E;
    }
  }
  const inMouth = p.x > GOAL_X0 && p.x < GOAL_X1;
  if (inMouth) {
    // Through the mouth: a goal once the centre crosses the line.
    if (p.y < 0) return { impact, goal: 'player' };
    if (p.y > H) return { impact, goal: 'ai' };
    impact = Math.max(impact, hitPost(p, GOAL_X0, 0), hitPost(p, GOAL_X1, 0), hitPost(p, GOAL_X0, H), hitPost(p, GOAL_X1, H));
  } else {
    if (p.y < PUCK_R) {
      p.y = PUCK_R;
      if (p.vy < 0) {
        impact = Math.max(impact, -p.vy);
        p.vy = -p.vy * WALL_E;
      }
    } else if (p.y > H - PUCK_R) {
      p.y = H - PUCK_R;
      if (p.vy > 0) {
        impact = Math.max(impact, p.vy);
        p.vy = -p.vy * WALL_E;
      }
    }
  }
  return { impact, goal: null };
}

function scoreGoal(s: MatchState, scorer: Side, events: MatchEvent[]) {
  s.score = { ...s.score, [scorer]: s.score[scorer] + 1 };
  s.lastScorer = scorer;
  s.serveTo = scorer === 'player' ? 'ai' : 'player';
  s.phase = 'goal';
  s.left = GOAL_TICKS;
  s.puck = { x: s.puck.x, y: scorer === 'player' ? -PUCK_R * 2 : H + PUCK_R * 2, vx: 0, vy: 0 };
  events.push({ type: 'goal', scorer });
}

function finish(s: MatchState, events: MatchEvent[]) {
  const { player, ai } = s.score;
  s.outcome = player > ai ? 'won' : player < ai ? 'lost' : 'draw';
  s.phase = 'over';
  s.left = 0;
  events.push({ type: 'over', outcome: s.outcome });
}

/** Advances the match by one tick with the player's input. Mutates and returns `s`. */
export function step(s: MatchState, input: Input, events: MatchEvent[] = []): MatchState {
  if (s.phase === 'over') return s;
  s.tick++;
  const target = clampInput(input.x, input.y);

  // The AI decides where to go (it has a reaction time: see ai.ts).
  const r = createRng(s.rng);
  s.mem = aiThink(s, r);
  s.rng = r.state();
  const aiSpeed = AI_LEVELS[s.level].speed;

  const live = s.phase === 'play';
  for (let k = 0; k < SUB; k++) {
    moveMallet(s.player, target.x, target.y, PLAYER_SPEED, false);
    moveMallet(s.ai, s.mem.tx, s.mem.ty, aiSpeed, true);
    if (!live) {
      s.player.vx = s.player.vy = s.ai.vx = s.ai.vy = 0;
      continue;
    }
    const p = s.puck;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    const hitP = hitMallet(p, s.player, 'player', events);
    const hitA = hitMallet(p, s.ai, 'ai', events);
    if (hitP || hitA) s.stall = 0;
    const w = walls(p);
    if (w.goal) {
      scoreGoal(s, w.goal, events);
      break;
    }
    // Squeezed between a mallet and a wall: the wall wins, the puck slides out along it.
    if (hitMallet(p, s.player, 'player', events) || hitMallet(p, s.ai, 'ai', events)) walls(p);
    if (w.impact > 120) events.push({ type: 'wall', power: Math.min(1, w.impact / 2200) });
  }

  if (s.phase === 'play') {
    const p = s.puck;
    const slow = p.vx * p.vx + p.vy * p.vy < 45 * 45;
    s.stall = slow ? s.stall + 1 : 0;
    // Ticks in the same half: positive in the player's, negative in the AI's.
    if (p.y > MID) s.inHalf = s.inHalf > 0 ? s.inHalf + 1 : 1;
    else s.inHalf = s.inHalf < 0 ? s.inHalf - 1 : -1;
    if (s.stall > STALL_TICKS) {
      // A dead puck (in a corner, against a wall…): a gentle push towards the centre of the table.
      p.vx = (W / 2 - p.x) * 0.9;
      p.vy = p.y > MID ? -420 : 420;
      s.stall = 0;
    } else if (Math.abs(s.inHalf) > HALF_TICKS) {
      // Holding the puck in your half too long hands the serve to the other side.
      s.phase = 'serve';
      s.left = SERVE_TICKS;
      servePuck(s, s.inHalf > 0 ? 'ai' : 'player');
    }
  } else if (s.phase === 'countdown') {
    if (s.left % TICK_HZ === 0 && s.left > 0) events.push({ type: 'count', n: s.left / TICK_HZ });
    if (--s.left <= 0) {
      s.phase = 'play';
      events.push({ type: 'go' });
    }
  } else if (s.phase === 'goal') {
    if (--s.left <= 0) {
      if (s.score.player >= WIN_SCORE || s.score.ai >= WIN_SCORE) finish(s, events);
      else {
        s.phase = 'serve';
        s.left = SERVE_TICKS;
        servePuck(s, s.serveTo);
      }
    }
  } else if (s.phase === 'serve') {
    if (--s.left <= 0) s.phase = 'play';
  }

  if (s.outcome === null && s.tick >= MAX_TICKS) finish(s, events);
  return s;
}

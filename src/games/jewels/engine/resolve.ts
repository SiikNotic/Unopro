// A move (or a power-up), then resolve until the board is stable. Pure and deterministic — it returns the
// new state and the steps the UI plays (swap / booster, clear, fall, shuffle, end). While the UI plays them
// the board takes no input; the logical state is already final.
//
// State machine the UI follows for every move:
//   IDLE → SWAPPING → RESOLVING → CLEARING → FALLING/REFILLING → (CASCADING → CLEARING → FALLING)* → IDLE
//   … or LEVEL_COMPLETE / LEVEL_FAILED after the last step.
import { createRng } from '@/games/shared/rng';
import type { Rng } from '@/games/shared/rng';
import type { LevelDef } from './levels';
import { adjacent, cloneBoard, commonestKind, findGroups, findMove, generateBoard, key, randomKind, reshuffle } from './board';
import type { Group } from './board';
import { cascadeFactor, groupPoints, SCORE } from './scoring';
import type { Activation, Board, Booster, BoosterResult, ClearedJewel, Jewel, JewelState, Pos, Special, Step, SwapResult } from './types';
import { PRISM_KIND, STONE_KIND } from './types';

export { SCORE };

const ALL_SPECIALS: Special[] = ['lineH', 'lineV', 'bomb', 'prism'];

export function createGame(level: LevelDef, seed: number): JewelState {
  const rng = createRng(seed);
  let id = 1;
  const board = generateBoard(level.rows, level.cols, level.kinds, rng, () => id++, level.stones);
  const ice = Array.from({ length: level.rows }, (_, r) => Array.from({ length: level.cols }, (_, c) => level.ice?.[r]?.[c] === '#'));
  const stones = board.flat().filter((j) => j?.kind === STONE_KIND).length;
  return {
    levelId: level.id,
    rows: level.rows,
    cols: level.cols,
    kinds: level.kinds,
    specials: level.specials ?? ALL_SPECIALS,
    board,
    ice,
    rng: rng.state(),
    seed,
    nextId: id,
    score: 0,
    movesLeft: level.moves,
    movesUsed: 0,
    collected: Array(6).fill(0),
    iceLeft: ice.flat().filter(Boolean).length,
    iceTotal: ice.flat().filter(Boolean).length,
    stonesLeft: stones,
    stonesTotal: stones,
    matches: 0,
    combos: 0,
    specialsFired: 0,
    goals: level.goals,
    starScores: level.stars,
    status: 'playing',
  };
}

// ------------------------------------------------------------------ progress

export interface GoalProgress {
  goal: JewelState['goals'][number];
  current: number;
  target: number;
  done: boolean;
}

type ProgressSource = Pick<JewelState, 'goals' | 'collected' | 'score' | 'iceLeft' | 'iceTotal' | 'stonesLeft' | 'stonesTotal' | 'matches' | 'combos' | 'specialsFired'>;

export function goalProgress(s: ProgressSource): GoalProgress[] {
  const count = (goal: GoalProgress['goal'], have: number, target: number): GoalProgress => ({ goal, current: Math.min(target, have), target, done: have >= target });
  return s.goals.map((goal) => {
    switch (goal.type) {
      case 'collect':
        return count(goal, s.collected[goal.kind] ?? 0, goal.count);
      case 'score':
        return count(goal, s.score, goal.target);
      case 'ice':
        return count(goal, s.iceTotal - s.iceLeft, s.iceTotal);
      case 'stone':
        return count(goal, s.stonesTotal - s.stonesLeft, s.stonesTotal);
      case 'matches':
        return count(goal, s.matches, goal.count);
      case 'combos':
        return count(goal, s.combos, goal.count);
      case 'specials':
        return count(goal, s.specialsFired, goal.count);
    }
  });
}

export const goalsDone = (s: ProgressSource) => goalProgress(s).every((g) => g.done);

/** Stars earned for a score (0 when below the first threshold). */
export const starsFor = (score: number, thresholds: [number, number, number]) => thresholds.filter((t) => score >= t).length;

// ------------------------------------------------------------------ effects

function inside(s: { rows: number; cols: number }, r: number, c: number) {
  return r >= 0 && c >= 0 && r < s.rows && c < s.cols;
}

function square(s: { rows: number; cols: number }, p: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let r = p.r - radius; r <= p.r + radius; r++) for (let c = p.c - radius; c <= p.c + radius; c++) if (inside(s, r, c)) out.push({ r, c });
  return out;
}
const row = (s: { cols: number }, r: number): Pos[] => Array.from({ length: s.cols }, (_, c) => ({ r, c }));
const col = (s: { rows: number }, c: number): Pos[] => Array.from({ length: s.rows }, (_, r) => ({ r, c }));
const ofKind = (w: { rows: number; cols: number; board: Board }, k: number): Pos[] => {
  const out: Pos[] = [];
  for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.board[r][c]?.kind === k) out.push({ r, c });
  return out;
};

/** Cells a special hits when it goes off at `p`. */
export function effectArea(w: Work, j: Jewel, p: Pos, kind?: number): Pos[] {
  switch (j.special) {
    case 'lineH':
      return row(w, p.r);
    case 'lineV':
      return col(w, p.c);
    case 'bomb':
      return square(w, p, 1);
    case 'prism':
      return ofKind(w, kind ?? commonestKind(w.board));
    default:
      return [];
  }
}

// ------------------------------------------------------------------ working state of one move

interface Work {
  rows: number;
  cols: number;
  board: Board;
  ice: boolean[][];
  rng: Rng;
  nextId: number;
  score: number;
  collected: number[];
  iceLeft: number;
  stonesLeft: number;
  matches: number;
  combos: number;
  specialsFired: number;
  kindsInPlay: number;
  specials: Special[];
}

interface ClearOutcome {
  cleared: ClearedJewel[];
  activations: Activation[];
  iceBroken: Pos[];
  stonesHit: ClearedJewel[];
}

const workOf = (s: JewelState): Work => ({
  rows: s.rows,
  cols: s.cols,
  board: cloneBoard(s.board),
  ice: s.ice.map((r) => r.slice()),
  rng: createRng(s.rng),
  nextId: s.nextId,
  score: s.score,
  collected: s.collected.slice(),
  iceLeft: s.iceLeft,
  stonesLeft: s.stonesLeft,
  matches: s.matches,
  combos: s.combos,
  specialsFired: s.specialsFired,
  kindsInPlay: s.kinds,
  specials: s.specials,
});

/**
 * Removes the pieces on `cells` (except `keep`), setting off every special it hits, which can set off
 * others: a breadth-first chain, each cell at most once. A marble seal loses one hit instead.
 */
function clearCells(w: Work, cells: Pos[], keep: Set<number>, extraActivations: Activation[] = []): ClearOutcome {
  const out: ClearOutcome = { cleared: [], activations: extraActivations, iceBroken: [], stonesHit: [] };
  const queue = cells.slice();
  const seen = new Set<number>();
  while (queue.length) {
    const p = queue.shift()!;
    const k = key(p.r, p.c);
    if (seen.has(k) || keep.has(k)) continue;
    seen.add(k);
    const j = w.board[p.r][p.c];
    if (!j) continue;
    if (j.kind === STONE_KIND) {
      const hp = (j.hp ?? 1) - 1;
      if (hp > 0) {
        w.board[p.r][p.c] = { ...j, hp };
        out.stonesHit.push({ ...j, hp, r: p.r, c: p.c });
        continue;
      }
      w.stonesLeft--;
    }
    if (j.special) {
      const area = effectArea(w, j, p);
      out.activations.push({ r: p.r, c: p.c, special: j.special, cells: area });
      queue.push(...area);
    }
    out.cleared.push({ ...j, r: p.r, c: p.c });
    w.board[p.r][p.c] = null;
    if (w.ice[p.r][p.c]) {
      w.ice[p.r][p.c] = false;
      w.iceLeft--;
      out.iceBroken.push(p);
    }
  }
  return out;
}

/** Adds up a clear's points and counters. `base` is what the matches (or the combo) themselves are worth. */
function tally(w: Work, o: ClearOutcome, cascade: number, base: number, matchedCells: number): number {
  const fired = o.activations.filter((a) => a.special !== 'combo').length;
  const jewels = o.cleared.filter((j) => j.kind !== STONE_KIND).length;
  const stones = o.stonesHit.length + o.cleared.filter((j) => j.kind === STONE_KIND).length;
  const raw = base + Math.max(0, jewels - matchedCells) * SCORE.extra + fired * SCORE.activation + stones * SCORE.stone + o.iceBroken.length * SCORE.ice;
  const { mult, bonus } = cascadeFactor(cascade);
  const points = Math.round(raw * mult + (raw > 0 ? bonus : 0));
  for (const j of o.cleared) if (j.kind >= 0) w.collected[j.kind]++;
  w.specialsFired += fired + o.activations.filter((a) => a.special === 'combo').length;
  if (cascade >= 2) w.combos++;
  w.score += points;
  return points;
}

/** The special a group makes, if any: 5 in a line → Trident; T / L → Temple; 4 in a line → Lightning. */
export function specialFor(g: Group, allowed: Special[] = ALL_SPECIALS): Special | null {
  const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  const corner = g.runs.some((r) => r.dir === 'h') && g.runs.some((r) => r.dir === 'v');
  const wish: Special | null = longest.cells.length >= 5 ? 'prism' : corner ? 'bomb' : longest.cells.length === 4 ? (longest.dir === 'h' ? 'lineV' : 'lineH') : null;
  if (!wish || allowed.includes(wish)) return wish;
  // A level without that special: the next one down that it has.
  const fallback: Special[] = wish === 'prism' ? ['bomb', longest.dir === 'h' ? 'lineV' : 'lineH'] : wish === 'bomb' ? [longest.dir === 'h' ? 'lineV' : 'lineH'] : [];
  return fallback.find((s) => allowed.includes(s)) ?? null;
}

/** Where a group's special appears: on the moved jewel if it's in the group, else the crossing / middle. */
function spotFor(w: Work, g: Group, preferred: Pos[]): Pos | null {
  const inGroup = (p: Pos) => g.cells.some((q) => q.r === p.r && q.c === p.c);
  const free = (p: Pos) => !w.board[p.r][p.c]?.special;
  const h = g.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells);
  const crossing = g.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells).filter((p) => h.some((q) => q.r === p.r && q.c === p.c));
  const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a)).cells;
  const middle = [...longest.slice(Math.floor((longest.length - 1) / 2)), ...longest.slice(0, Math.floor((longest.length - 1) / 2)).reverse()];
  const candidates = [...preferred.filter(inGroup), ...crossing, ...middle, ...g.cells];
  return candidates.find(free) ?? null;
}

/** Marble seals next to a match take a hit. */
function sealsNextTo(w: Work, cells: Pos[]): Pos[] {
  const out: Pos[] = [];
  for (const p of cells)
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = p.r + dr;
      const c = p.c + dc;
      if (inside(w, r, c) && w.board[r][c]?.kind === STONE_KIND) out.push({ r, c });
    }
  return out;
}

type ClearStep = Extract<Step, { type: 'clear' }>;

/** Clears every match on the board (making specials where due). Returns null when there is none. */
function clearMatches(w: Work, cascade: number, preferred: Pos[]): ClearStep | null {
  const groups = findGroups(w.board);
  if (groups.length === 0) return null;
  const keep = new Set<number>();
  const created: ClearedJewel[] = [];
  let base = 0;
  const shapes: ClearStep['groups'] = [];
  for (const g of groups) {
    const corner = g.runs.some((r) => r.dir === 'h') && g.runs.some((r) => r.dir === 'v');
    const longest = Math.max(...g.runs.map((r) => r.cells.length));
    base += groupPoints(longest, corner);
    shapes.push({ size: corner ? g.cells.length : longest, shape: corner ? 'corner' : 'line' });
    const special = specialFor(g, w.specials);
    if (!special) continue;
    const spot = spotFor(w, g, preferred);
    if (!spot) continue;
    const old = w.board[spot.r][spot.c]!;
    const jewel: Jewel = { id: old.id, kind: special === 'prism' ? PRISM_KIND : old.kind, special };
    w.board[spot.r][spot.c] = jewel;
    keep.add(key(spot.r, spot.c));
    created.push({ ...jewel, r: spot.r, c: spot.c });
    // The matched jewel that became a special counts for collect goals too.
    if (old.kind >= 0) w.collected[old.kind]++;
  }
  w.matches += groups.length;
  const matched = groups.flatMap((g) => g.cells);
  const o = clearCells(w, [...matched, ...sealsNextTo(w, matched)], keep);
  const points = tally(w, o, cascade, base, matched.length - created.length);
  return { type: 'clear', cascade, cleared: o.cleared, created, activations: o.activations, iceBroken: o.iceBroken, stonesHit: o.stonesHit, groups: shapes, points };
}

/** Pieces fall into the gaps (marble seals too), new jewels drop in from above. */
function collapse(w: Work): Extract<Step, { type: 'fall' }> {
  const moves: { id: number; from: Pos; to: Pos }[] = [];
  const spawns: (ClearedJewel & { fromRow: number })[] = [];
  for (let c = 0; c < w.cols; c++) {
    let write = w.rows - 1;
    for (let r = w.rows - 1; r >= 0; r--) {
      const j = w.board[r][c];
      if (!j) continue;
      if (write !== r) {
        w.board[write][c] = j;
        w.board[r][c] = null;
        moves.push({ id: j.id, from: { r, c }, to: { r: write, c } });
      }
      write--;
    }
    const missing = write + 1;
    for (let r = write; r >= 0; r--) {
      const j: Jewel = { id: w.nextId++, kind: randomKind(w.rng, w.kindsInPlay), special: null };
      w.board[r][c] = j;
      spawns.push({ ...j, r, c, fromRow: r - missing });
    }
  }
  return { type: 'fall', moves, spawns };
}

/** Two specials swapped together (or a Trident with anything): their combined effect. */
function comboClear(w: Work, a: Pos, b: Pos): ClearStep {
  const ja = w.board[a.r][a.c]!;
  const jb = w.board[b.r][b.c]!;
  const [prism, other, otherPos] = ja.special === 'prism' ? [ja, jb, b] : jb.special === 'prism' ? [jb, ja, a] : [null, null, null];
  const activations: Activation[] = [];
  let cells: Pos[];
  let base = SCORE.combo;
  if (prism && other && otherPos) {
    const prismPos = prism === ja ? a : b;
    if (other.special === 'prism') {
      // Two Tridents: the whole board.
      cells = square(w, { r: 0, c: 0 }, Math.max(w.rows, w.cols));
      activations.push({ r: b.r, c: b.c, special: 'combo', cells });
    } else if (other.special) {
      // Trident + Lightning / Temple: every jewel of that kind becomes that special, then they all go off.
      const targets: Pos[] = [];
      let n = 0;
      for (let r = 0; r < w.rows; r++)
        for (let c = 0; c < w.cols; c++) {
          const j = w.board[r][c];
          if (j && j.kind === other.kind && !j.special) {
            const special: Special = other.special === 'bomb' ? 'bomb' : n++ % 2 ? 'lineV' : 'lineH';
            w.board[r][c] = { ...j, special };
            targets.push({ r, c });
          }
        }
      cells = [prismPos, otherPos, ...targets];
      activations.push({ r: prismPos.r, c: prismPos.c, special: 'combo', cells: targets });
      w.board[prismPos.r][prismPos.c] = { ...prism, special: null };
    } else {
      // Trident + a jewel: every jewel of that kind.
      cells = [prismPos, ...effectArea(w, prism, prismPos, other.kind)];
      activations.push({ r: prismPos.r, c: prismPos.c, special: 'prism', cells });
      w.board[prismPos.r][prismPos.c] = { ...prism, special: null };
      base = 0;
    }
  } else {
    const lines = [ja, jb].filter((j) => j.special === 'lineH' || j.special === 'lineV').length;
    const bombs = [ja, jb].filter((j) => j.special === 'bomb').length;
    if (lines === 2) cells = [...row(w, b.r), ...col(w, b.c)];
    else if (bombs === 2) cells = square(w, b, 2);
    else cells = [b.r - 1, b.r, b.r + 1].filter((r) => r >= 0 && r < w.rows).flatMap((r) => row(w, r)).concat([b.c - 1, b.c, b.c + 1].filter((c) => c >= 0 && c < w.cols).flatMap((c) => col(w, c)));
    activations.push({ r: b.r, c: b.c, special: 'combo', cells });
    // The two specials are spent by the combo (they don't also go off on their own).
    w.board[a.r][a.c] = { ...ja, special: null };
    w.board[b.r][b.c] = { ...jb, special: null };
    cells = [a, b, ...cells];
  }
  if (base > 0) w.combos++;
  const o = clearCells(w, cells, new Set(), activations);
  const points = tally(w, o, 1, base, 0);
  return { type: 'clear', cascade: 1, cleared: o.cleared, created: [], activations: o.activations, iceBroken: o.iceBroken, stonesHit: o.stonesHit, groups: [], points };
}

/** Plays the first clear and every cascade after it into `steps`. */
function resolveFrom(w: Work, first: ClearStep, steps: Step[]) {
  let cascade = 1;
  let clear: ClearStep | null = first;
  while (clear) {
    steps.push(clear);
    steps.push(collapse(w));
    cascade++;
    clear = clearMatches(w, cascade, []);
    if (cascade > 60) break; // unreachable in practice; never loop forever
  }
}

/** Applies the working state and decides what's next: won, lost, a reshuffle, or play on. */
function finish(state: JewelState, w: Work, steps: Step[], usedMove: boolean): JewelState {
  const next: JewelState = {
    ...state,
    board: w.board,
    ice: w.ice,
    nextId: w.nextId,
    score: w.score,
    collected: w.collected,
    iceLeft: w.iceLeft,
    stonesLeft: w.stonesLeft,
    matches: w.matches,
    combos: w.combos,
    specialsFired: w.specialsFired,
    movesLeft: state.movesLeft - (usedMove ? 1 : 0),
    movesUsed: state.movesUsed + (usedMove ? 1 : 0),
    rng: w.rng.state(),
  };
  if (goalsDone(next)) {
    const bonus = next.movesLeft * SCORE.moveLeft;
    next.score += bonus;
    next.status = 'won';
    steps.push({ type: 'end', status: 'won', bonus });
  } else if (next.movesLeft <= 0) {
    next.status = 'lost';
    steps.push({ type: 'end', status: 'lost', bonus: 0 });
  } else if (!findMove(next.board)) {
    next.board = reshuffle(next.board, w.rng);
    next.rng = w.rng.state();
    steps.push({ type: 'shuffle', board: next.board });
  }
  return next;
}

/** The player swaps the jewels at `a` and `b`. Only a swap that makes a match (or a combo) is played. */
export function trySwap(state: JewelState, a: Pos, b: Pos): SwapResult {
  if (state.status !== 'playing' || state.movesLeft <= 0) return { ok: false, reason: 'not_playing', steps: [] };
  if (!inside(state, a.r, a.c) || !inside(state, b.r, b.c) || !adjacent(a, b)) return { ok: false, reason: 'not_adjacent', steps: [] };
  const ja = state.board[a.r][a.c];
  const jb = state.board[b.r][b.c];
  if (!ja || !jb) return { ok: false, reason: 'empty', steps: [] };
  if (ja.kind === STONE_KIND || jb.kind === STONE_KIND) return { ok: false, reason: 'blocked', steps: [] };

  const w = workOf(state);
  w.board[a.r][a.c] = jb;
  w.board[b.r][b.c] = ja;

  const combo = ja.special === 'prism' || jb.special === 'prism' || (!!ja.special && !!jb.special);
  const first = combo ? comboClear(w, a, b) : clearMatches(w, 1, [b, a]);
  if (!first) return { ok: false, reason: 'no_match', steps: [{ type: 'swap', a, b, valid: false }] };
  const steps: Step[] = [{ type: 'swap', a, b, valid: true }];
  resolveFrom(w, first, steps);
  return { ok: true, state: finish(state, w, steps, true), steps };
}

/** Cells a power-up hits at `target` (empty when the target isn't valid for it). */
export function boosterArea(state: Pick<JewelState, 'rows' | 'cols' | 'board'>, booster: Booster, target: Pos | null): Pos[] {
  if (booster === 'shuffle') return [];
  if (!target || !inside(state, target.r, target.c)) return [];
  const j = state.board[target.r][target.c];
  if (!j) return [];
  if (booster === 'hammer') return [target];
  if (booster === 'lightning') return [...row(state, target.r), ...col(state, target.c).filter((p) => p.r !== target.r)];
  // Olympus Power: every jewel of the target's kind (on a seal or a Trident: the 3×3 around it).
  return j.kind >= 0 ? ofKind(state, j.kind) : square(state, target, 1);
}

/** A power-up: it doesn't use a move. Divine Shuffle needs no target; the others hit `target`. */
export function applyBooster(state: JewelState, booster: Booster, target: Pos | null): BoosterResult {
  if (state.status !== 'playing' || state.movesLeft <= 0) return { ok: false, reason: 'not_playing' };
  const w = workOf(state);
  const steps: Step[] = [];
  if (booster === 'shuffle') {
    steps.push({ type: 'booster', booster, target: null, cells: [] });
    const board = reshuffle(w.board, w.rng);
    w.board = board;
    steps.push({ type: 'shuffle', board });
    return { ok: true, state: finish(state, w, steps, false), steps };
  }
  const cells = boosterArea(w, booster, target);
  if (cells.length === 0) return { ok: false, reason: 'bad_target' };
  steps.push({ type: 'booster', booster, target, cells });
  const o = clearCells(w, cells, new Set());
  const points = tally(w, o, 1, 0, 0);
  resolveFrom(w, { type: 'clear', cascade: 1, cleared: o.cleared, created: [], activations: o.activations, iceBroken: o.iceBroken, stonesHit: o.stonesHit, groups: [], points }, steps);
  return { ok: true, state: finish(state, w, steps, false), steps };
}

/** A legal move to hint to an idle player. */
export const hint = (s: JewelState) => (s.status === 'playing' ? findMove(s.board) : null);

/**
 * Test helper: a board from rows of letters (A–F = kinds 0–5; lowercase h/v/b after a letter = special;
 * P = Trident; 1 / 2 = marble seal with that many hits; . = empty).
 */
export function boardFrom(rowsText: string[], startId = 1): Board {
  let id = startId;
  return rowsText.map((line) => {
    const cells: (Jewel | null)[] = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '.') cells.push(null);
      else if (ch === 'P') cells.push({ id: id++, kind: PRISM_KIND, special: 'prism' });
      else if (ch === '1' || ch === '2') cells.push({ id: id++, kind: STONE_KIND, special: null, hp: Number(ch) });
      else if (/[A-F]/.test(ch)) {
        const mark = line[i + 1];
        const special: Special | null = mark === 'h' ? 'lineH' : mark === 'v' ? 'lineV' : mark === 'b' ? 'bomb' : null;
        if (special) i++;
        cells.push({ id: id++, kind: ch.charCodeAt(0) - 65, special });
      }
    }
    return cells;
  });
}

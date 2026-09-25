// The move: swap two jewels, then resolve until the board is stable. Pure and deterministic — it returns
// the new state and the steps the UI plays (swap, clear, fall, shuffle, end). While the UI plays them the
// board takes no input; the logical state is already final.
//
// State machine the UI follows for every move:
//   IDLE → SWAPPING → CHECKING_MATCHES → CLEARING → COLLAPSING/REFILLING → CHECKING_MATCHES … → IDLE
import { createRng } from '@/games/shared/rng';
import type { Rng } from '@/games/shared/rng';
import type { LevelDef } from './levels';
import { adjacent, cloneBoard, commonestKind, findGroups, findMove, generateBoard, key, randomKind, reshuffle } from './board';
import type { Group } from './board';
import type { Activation, Board, ClearedJewel, Jewel, JewelState, Pos, Special, Step, SwapResult } from './types';
import { PRISM_KIND } from './types';

export const SCORE = {
  /** Per jewel cleared, times the cascade number (1 for the move, 2, 3… for each cascade). */
  jewel: 10,
  /** Per special that goes off. */
  activation: 40,
  created: { lineH: 60, lineV: 60, bomb: 90, prism: 150 } as Record<Special, number>,
  /** Per move left when the level is won. */
  moveLeft: 150,
};

export function createGame(level: LevelDef, seed: number): JewelState {
  const rng = createRng(seed);
  let id = 1;
  const board = generateBoard(level.rows, level.cols, level.kinds, rng, () => id++);
  const ice = Array.from({ length: level.rows }, (_, r) => Array.from({ length: level.cols }, (_, c) => level.ice?.[r]?.[c] === '#'));
  return {
    levelId: level.id,
    rows: level.rows,
    cols: level.cols,
    kinds: level.kinds,
    board,
    ice,
    rng: rng.state(),
    nextId: id,
    score: 0,
    movesLeft: level.moves,
    movesUsed: 0,
    collected: Array(6).fill(0),
    iceLeft: ice.flat().filter(Boolean).length,
    iceTotal: ice.flat().filter(Boolean).length,
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

export function goalProgress(s: Pick<JewelState, 'goals' | 'collected' | 'score' | 'iceLeft' | 'iceTotal'>): GoalProgress[] {
  return s.goals.map((goal) => {
    if (goal.type === 'collect') return { goal, current: Math.min(goal.count, s.collected[goal.kind] ?? 0), target: goal.count, done: (s.collected[goal.kind] ?? 0) >= goal.count };
    if (goal.type === 'score') return { goal, current: Math.min(goal.target, s.score), target: goal.target, done: s.score >= goal.target };
    return { goal, current: s.iceTotal - s.iceLeft, target: s.iceTotal, done: s.iceLeft === 0 };
  });
}

export const goalsDone = (s: JewelState) => goalProgress(s).every((g) => g.done);

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

/** Cells a special hits when it goes off at `p`. */
export function effectArea(w: Work, j: Jewel, p: Pos, kind?: number): Pos[] {
  switch (j.special) {
    case 'lineH':
      return row(w, p.r);
    case 'lineV':
      return col(w, p.c);
    case 'bomb':
      return square(w, p, 1);
    case 'prism': {
      const k = kind ?? commonestKind(w.board);
      const out: Pos[] = [];
      for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.board[r][c]?.kind === k) out.push({ r, c });
      return out;
    }
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
  kindsInPlay: number;
}

interface ClearOutcome {
  cleared: ClearedJewel[];
  activations: Activation[];
  iceBroken: Pos[];
}

/**
 * Removes the jewels on `cells` (except `keep`), setting off every special it hits, which can set off
 * others: a breadth-first chain, each cell at most once.
 */
function clearCells(w: Work, cells: Pos[], keep: Set<number>, extraActivations: Activation[] = []): ClearOutcome {
  const out: ClearOutcome = { cleared: [], activations: extraActivations, iceBroken: [] };
  const queue = cells.slice();
  const seen = new Set<number>();
  while (queue.length) {
    const p = queue.shift()!;
    const k = key(p.r, p.c);
    if (seen.has(k) || keep.has(k)) continue;
    seen.add(k);
    const j = w.board[p.r][p.c];
    if (!j) continue;
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

function tally(w: Work, o: ClearOutcome, cascade: number, created: ClearedJewel[]): number {
  let points = o.cleared.length * SCORE.jewel * cascade + o.activations.filter((a) => a.special !== 'combo').length * SCORE.activation;
  for (const j of created) points += SCORE.created[j.special!];
  for (const j of o.cleared) if (j.kind >= 0) w.collected[j.kind]++;
  w.score += points;
  return points;
}

/** The special a group makes, if any: 5 in a line → prism; T / L → bomb; 4 in a line → line (across it). */
export function specialFor(g: Group): Special | null {
  const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
  if (longest.cells.length >= 5) return 'prism';
  if (g.runs.some((r) => r.dir === 'h') && g.runs.some((r) => r.dir === 'v')) return 'bomb';
  if (longest.cells.length === 4) return longest.dir === 'h' ? 'lineV' : 'lineH';
  return null;
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

/** Clears every match on the board (making specials where due). Returns null when there is none. */
function clearMatches(w: Work, cascade: number, preferred: Pos[]): Extract<Step, { type: 'clear' }> | null {
  const groups = findGroups(w.board);
  if (groups.length === 0) return null;
  const keep = new Set<number>();
  const created: ClearedJewel[] = [];
  for (const g of groups) {
    const special = specialFor(g);
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
  const o = clearCells(
    w,
    groups.flatMap((g) => g.cells),
    keep
  );
  return { type: 'clear', cascade, cleared: o.cleared, created, activations: o.activations, iceBroken: o.iceBroken, points: tally(w, o, cascade, created) };
}

/** Jewels fall into the gaps, new ones drop in from above. */
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

/** Two specials swapped together (or a prism with anything): their combined effect. */
function comboClear(w: Work, a: Pos, b: Pos): Extract<Step, { type: 'clear' }> {
  const ja = w.board[a.r][a.c]!;
  const jb = w.board[b.r][b.c]!;
  const [prism, other, otherPos] = ja.special === 'prism' ? [ja, jb, b] : jb.special === 'prism' ? [jb, ja, a] : [null, null, null];
  const activations: Activation[] = [];
  let cells: Pos[];
  if (prism && other && otherPos) {
    const prismPos = prism === ja ? a : b;
    if (other.special === 'prism') {
      // Two prisms: the whole board.
      cells = square(w, { r: 0, c: 0 }, Math.max(w.rows, w.cols));
      activations.push({ r: b.r, c: b.c, special: 'combo', cells });
    } else if (other.special) {
      // Prism + line / bomb: every jewel of that kind becomes that special, then they all go off.
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
      // Prism + a jewel: every jewel of that kind.
      cells = [prismPos, ...effectArea(w, prism, prismPos, other.kind)];
      activations.push({ r: prismPos.r, c: prismPos.c, special: 'prism', cells });
      w.board[prismPos.r][prismPos.c] = { ...prism, special: null };
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
  const o = clearCells(w, cells, new Set(), activations);
  return { type: 'clear', cascade: 1, cleared: o.cleared, created: [], activations: o.activations, iceBroken: o.iceBroken, points: tally(w, o, 1, []) };
}

/** The player swaps the jewels at `a` and `b`. */
export function trySwap(state: JewelState, a: Pos, b: Pos): SwapResult {
  if (state.status !== 'playing' || state.movesLeft <= 0) return { ok: false, reason: 'not_playing', steps: [] };
  if (!inside(state, a.r, a.c) || !inside(state, b.r, b.c) || !adjacent(a, b)) return { ok: false, reason: 'not_adjacent', steps: [] };
  const ja = state.board[a.r][a.c];
  const jb = state.board[b.r][b.c];
  if (!ja || !jb) return { ok: false, reason: 'empty', steps: [] };

  const w: Work = {
    rows: state.rows,
    cols: state.cols,
    board: cloneBoard(state.board),
    ice: state.ice.map((r) => r.slice()),
    rng: createRng(state.rng),
    nextId: state.nextId,
    score: state.score,
    collected: state.collected.slice(),
    iceLeft: state.iceLeft,
    kindsInPlay: state.kinds,
  };
  w.board[a.r][a.c] = jb;
  w.board[b.r][b.c] = ja;

  const combo = ja.special === 'prism' || jb.special === 'prism' || (!!ja.special && !!jb.special);
  const steps: Step[] = [];
  let cascade = 1;
  let clear = combo ? comboClear(w, a, b) : clearMatches(w, 1, [b, a]);
  if (!clear) return { ok: false, reason: 'no_match', steps: [{ type: 'swap', a, b, valid: false }] };
  steps.push({ type: 'swap', a, b, valid: true });
  while (clear) {
    steps.push(clear);
    steps.push(collapse(w));
    cascade++;
    clear = clearMatches(w, cascade, []);
    if (cascade > 60) break; // unreachable in practice; never loop forever
  }

  const next: JewelState = {
    ...state,
    board: w.board,
    ice: w.ice,
    nextId: w.nextId,
    score: w.score,
    collected: w.collected,
    iceLeft: w.iceLeft,
    movesLeft: state.movesLeft - 1,
    movesUsed: state.movesUsed + 1,
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
  return { ok: true, state: next, steps };
}

/** A legal move to hint to an idle player. */
export const hint = (s: JewelState) => (s.status === 'playing' ? findMove(s.board) : null);

/** Test helper: a board from rows of letters (A–F = kinds 0–5; lowercase h/v/b after a letter = special; P = prism). */
export function boardFrom(rowsText: string[], startId = 1): Board {
  let id = startId;
  return rowsText.map((line) => {
    const cells: (Jewel | null)[] = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '.') cells.push(null);
      else if (ch === 'P') cells.push({ id: id++, kind: PRISM_KIND, special: 'prism' });
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

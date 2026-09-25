// Board helpers: runs and groups of matching jewels, possible moves, generation and reshuffling.
import type { Rng } from '@/games/shared/rng';
import type { Board, Jewel, Pos } from './types';
import { PRISM_KIND } from './types';

export const key = (r: number, c: number) => r * 64 + c;
export const cloneBoard = (b: Board): Board => b.map((row) => row.slice());
export const adjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

const matchable = (j: Jewel | null): j is Jewel => !!j && j.kind >= 0;

export interface Run {
  dir: 'h' | 'v';
  cells: Pos[];
}

/** Every horizontal and vertical line of 3+ jewels of the same kind. */
export function findRuns(board: Board): Run[] {
  const rows = board.length;
  const cols = board[0].length;
  const runs: Run[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const j = board[r][c];
      let end = c + 1;
      if (matchable(j)) while (end < cols && matchable(board[r][end]) && board[r][end]!.kind === j.kind) end++;
      if (matchable(j) && end - c >= 3) runs.push({ dir: 'h', cells: Array.from({ length: end - c }, (_, i) => ({ r, c: c + i })) });
      c = end;
    }
  }
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const j = board[r][c];
      let end = r + 1;
      if (matchable(j)) while (end < rows && matchable(board[end][c]) && board[end][c]!.kind === j.kind) end++;
      if (matchable(j) && end - r >= 3) runs.push({ dir: 'v', cells: Array.from({ length: end - r }, (_, i) => ({ r: r + i, c })) });
      r = end;
    }
  }
  return runs;
}

/** Runs that share a cell form one group (a T or an L is one group with a horizontal and a vertical run). */
export interface Group {
  runs: Run[];
  cells: Pos[];
}

export function findGroups(board: Board): Group[] {
  const runs = findRuns(board);
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const p of run.cells) {
      const k = key(p.r, p.c);
      const other = owner.get(k);
      if (other === undefined) owner.set(k, i);
      else parent[find(i)] = find(other);
    }
  });
  const groups = new Map<number, Group>();
  runs.forEach((run, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { runs: [], cells: [] };
    g.runs.push(run);
    groups.set(root, g);
  });
  for (const g of groups.values()) {
    const seen = new Set<number>();
    for (const run of g.runs)
      for (const p of run.cells)
        if (!seen.has(key(p.r, p.c))) {
          seen.add(key(p.r, p.c));
          g.cells.push(p);
        }
  }
  return [...groups.values()];
}

/** Length of the line of the same kind through `p` (the longest of its row and column). */
function lineAt(board: Board, p: Pos): number {
  const j = board[p.r][p.c];
  if (!matchable(j)) return 0;
  const same = (r: number, c: number) => r >= 0 && c >= 0 && r < board.length && c < board[0].length && matchable(board[r][c]) && board[r][c]!.kind === j.kind;
  let h = 1;
  for (let c = p.c - 1; same(p.r, c); c--) h++;
  for (let c = p.c + 1; same(p.r, c); c++) h++;
  let v = 1;
  for (let r = p.r - 1; same(r, p.c); r--) v++;
  for (let r = p.r + 1; same(r, p.c); r++) v++;
  return Math.max(h, v);
}

/** Whether swapping these two cells is a legal move (makes a match, or involves a prism / two specials). */
export function isProductive(board: Board, a: Pos, b: Pos): boolean {
  const ja = board[a.r][a.c];
  const jb = board[b.r][b.c];
  if (!ja || !jb) return false;
  if (ja.special === 'prism' || jb.special === 'prism' || (ja.special && jb.special)) return true;
  board[a.r][a.c] = jb;
  board[b.r][b.c] = ja;
  const ok = lineAt(board, a) >= 3 || lineAt(board, b) >= 3;
  board[a.r][a.c] = ja;
  board[b.r][b.c] = jb;
  return ok;
}

/** A legal move, or null. Scans in a fixed order (used for hints and for "no moves left"). */
export function findMove(board: Board): [Pos, Pos] | null {
  const rows = board.length;
  const cols = board[0].length;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && isProductive(board, { r, c }, { r, c: c + 1 })) return [{ r, c }, { r, c: c + 1 }];
      if (r + 1 < rows && isProductive(board, { r, c }, { r: r + 1, c })) return [{ r, c }, { r: r + 1, c }];
    }
  return null;
}

export const randomKind = (rng: Rng, kinds: number) => Math.floor(rng.next() * kinds) % kinds;

/** A full board with no match on it and at least one legal move. */
export function generateBoard(rows: number, cols: number, kinds: number, rng: Rng, nextId: () => number): Board {
  for (let attempt = 0; attempt < 200; attempt++) {
    const board: Board = Array.from({ length: rows }, () => Array<Jewel | null>(cols).fill(null));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const banned = new Set<number>();
        if (c >= 2 && board[r][c - 1]!.kind === board[r][c - 2]!.kind) banned.add(board[r][c - 1]!.kind);
        if (r >= 2 && board[r - 1][c]!.kind === board[r - 2][c]!.kind) banned.add(board[r - 1][c]!.kind);
        const allowed = Array.from({ length: kinds }, (_, k) => k).filter((k) => !banned.has(k));
        board[r][c] = { id: 0, kind: allowed[Math.floor(rng.next() * allowed.length) % allowed.length], special: null };
      }
    if (findMove(board)) {
      for (const row of board) for (const j of row) j!.id = nextId();
      return board;
    }
  }
  throw new Error('could not generate a playable board');
}

/** Rearranges the same jewels until there is no match and at least one move (when no move is left). */
export function reshuffle(board: Board, rng: Rng): Board {
  const jewels = board.flat().filter((j): j is Jewel => !!j);
  for (let attempt = 0; attempt < 300; attempt++) {
    const pool = jewels.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const k = Math.floor(rng.next() * (i + 1));
      [pool[i], pool[k]] = [pool[k], pool[i]];
    }
    let n = 0;
    const next: Board = board.map((row) => row.map((j) => (j ? pool[n++] : null)));
    if (findRuns(next).length === 0 && findMove(next)) return next;
  }
  return board;
}

/** The most common kind on the board (a prism set off by another special takes this one). */
export function commonestKind(board: Board): number {
  const counts = new Map<number, number>();
  for (const row of board) for (const j of row) if (j && j.kind !== PRISM_KIND) counts.set(j.kind, (counts.get(j.kind) ?? 0) + 1);
  let best = 0;
  let max = -1;
  for (const [k, n] of [...counts.entries()].sort((a, b) => a[0] - b[0]))
    if (n > max) {
      best = k;
      max = n;
    }
  return best;
}

import { describe, expect, it } from 'vitest';
import { boardFrom, createGame, findGroups, findMove, goalProgress, hint, LEVELS, levelById, specialFor, starsFor, trySwap, SCORE } from '../engine';
import type { Board, JewelState, Step } from '../engine';
import { EMPTY_PROGRESS, MAX_BOOSTERS, normalizeProgress, recordResult, spendBooster, STARTING_BOOSTERS } from '../progress';

/** A game on a hand-made board (refills stay deterministic from the seed). */
function game(rows: string[], patch: Partial<JewelState> = {}): JewelState {
  const board = boardFrom(rows);
  const base = createGame({ id: 99, rows: board.length, cols: board[0].length, kinds: 6, moves: 10, goals: [{ type: 'score', target: 1e9 }], stars: [1, 2, 3], difficulty: 'easy', reward: 'hammer' }, 7);
  return { ...base, board, nextId: 1000, ...patch };
}
const clears = (steps: Step[]) => steps.filter((s): s is Extract<Step, { type: 'clear' }> => s.type === 'clear');
const count = (b: Board) => b.flat().filter(Boolean).length;
const noNulls = (b: Board) => b.every((r) => r.every((j) => j !== null));

describe('board generation', () => {
  it('starts full, without matches, with a legal move, on every level and many seeds', () => {
    for (const level of LEVELS)
      for (let seed = 1; seed <= 30; seed++) {
        const s = createGame(level, seed);
        const stones = (level.stones ?? []).join('').replace(/\./g, '').length;
        expect(s.stonesTotal).toBe(stones);
        expect(s.board).toHaveLength(level.rows);
        expect(s.board[0]).toHaveLength(level.cols);
        expect(noNulls(s.board)).toBe(true);
        expect(findGroups(s.board)).toHaveLength(0);
        expect(findMove(s.board)).not.toBeNull();
        expect(new Set(s.board.flat().map((j) => j!.id)).size).toBe(level.rows * level.cols);
        expect(Math.max(...s.board.flat().map((j) => j!.kind))).toBeLessThan(level.kinds);
        for (const j of s.board.flat()) if (j!.kind === -2) expect(j!.hp).toBeGreaterThanOrEqual(1);
      }
  });

  it('is deterministic for a seed', () => {
    expect(createGame(LEVELS[3], 42)).toEqual(createGame(LEVELS[3], 42));
    expect(createGame(LEVELS[3], 42).board).not.toEqual(createGame(LEVELS[3], 43).board);
  });
});

describe('moves', () => {
  const rows = ['ABCDE', 'BACDE', 'CDEAB', 'DEABC', 'EABCD'];

  it('a swap that makes no match is refused and changes nothing', () => {
    const s = game(rows);
    const r = trySwap(s, { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(r.ok).toBe(false);
    expect(r.steps).toEqual([{ type: 'swap', a: { r: 0, c: 0 }, b: { r: 0, c: 1 }, valid: false }]);
  });

  it('non-adjacent and out-of-board swaps are refused', () => {
    const s = game(rows);
    expect(trySwap(s, { r: 0, c: 0 }, { r: 1, c: 1 })).toMatchObject({ ok: false, reason: 'not_adjacent' });
    expect(trySwap(s, { r: 0, c: 0 }, { r: 0, c: -1 })).toMatchObject({ ok: false, reason: 'not_adjacent' });
  });

  it('a match of 3 clears, collapses, refills and spends a move', () => {
    // swapping (0,2) C with (1,2) C does nothing; make a real one: row 0 "AAB A" pattern
    const s = game(['AABAC', 'BCABD', 'CDEEB', 'DEBCA', 'EBCDE']);
    const r = trySwap(s, { r: 0, c: 3 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const first = clears(r.steps)[0];
    expect(first.cleared.map((j) => j.kind)).toEqual([0, 0, 0]);
    expect(first.points).toBe(SCORE.match[3]);
    expect(r.state.movesLeft).toBe(s.movesLeft - 1);
    expect(noNulls(r.state.board)).toBe(true);
    expect(count(r.state.board)).toBe(25);
    expect(findGroups(r.state.board)).toHaveLength(0);
    expect(r.steps[0]).toEqual({ type: 'swap', a: { r: 0, c: 3 }, b: { r: 0, c: 2 }, valid: true });
    expect(r.steps[2].type).toBe('fall');
  });

  it('cascades score more for each chain and never leave matches behind', () => {
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = createGame(LEVELS[6], seed);
      for (let i = 0; i < 15 && s.status === 'playing'; i++) {
        const m = hint(s)!;
        const r = trySwap(s, m[0], m[1]);
        expect(r.ok).toBe(true);
        if (!r.ok) break;
        const cs = clears(r.steps);
        cs.forEach((c, k) => expect(c.cascade).toBe(k === 0 ? 1 : cs[k - 1].cascade + 1));
        total += cs.length > 1 ? 1 : 0;
        s = r.state;
        expect(noNulls(s.board)).toBe(true);
        expect(findGroups(s.board)).toHaveLength(0);
        if (s.status === 'playing') expect(findMove(s.board)).not.toBeNull();
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe('specials', () => {
  it('4 in a line makes a line special on the moved jewel', () => {
    const s = game(['AACAB', 'BCADC', 'CDEEB', 'DEBCA', 'EBCDE']);
    const r = trySwap(s, { r: 1, c: 2 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = clears(r.steps)[0];
    expect(c.cleared).toHaveLength(3);
    expect(c.created).toEqual([expect.objectContaining({ r: 0, c: 2, kind: 0, special: 'lineV' })]);
  });

  it('5 in a line makes a prism, a T or L makes a bomb', () => {
    const five = findGroups(boardFrom(['AAAAA', 'BCDEB', 'CDEBC']));
    expect(specialFor(five[0])).toBe('prism');
    const tee = findGroups(boardFrom(['AAAB', 'CADB', 'DAEC']));
    expect(tee).toHaveLength(1);
    expect(specialFor(tee[0])).toBe('bomb');
    const ell = findGroups(boardFrom(['ABCD', 'ACDB', 'AAAC']));
    expect(specialFor(ell[0])).toBe('bomb');
    expect(specialFor(findGroups(boardFrom(['AAAB', 'BCDE']))[0])).toBeNull();
  });

  it('a line special in a match clears its whole row', () => {
    // (0,3) is an A with lineH; moving (1,2)'s A up makes A A A Ah: a match of 4 that includes the special
    const s = game(['AABAhCD', 'BCADEF', 'CDEFAB', 'DEFABC', 'EFABCD']);
    const r = trySwap(s, { r: 1, c: 2 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = clears(r.steps)[0];
    expect(c.activations.some((a) => a.special === 'lineH' && a.cells.length === 6)).toBe(true);
    // the rest of the row goes; the new special made by this match stays
    expect(c.cleared.filter((j) => j.r === 0)).toHaveLength(5);
    expect(c.created).toEqual([expect.objectContaining({ r: 0, c: 2, special: 'lineV' })]);
  });

  it('a bomb clears the 3×3 around it', () => {
    const s = game(['BCDEF', 'CDAbEB', 'DEFAC', 'EFABD', 'FBCDE'].map((x) => x));
    // (1,2) is a bomb A; bring A's to (1,2) column: (2,3)A,(3,2)A... use a direct run: col 2 rows 1..3? rows: r1c2=Ab, r2c2=F, r3c2=A
    const r = trySwap(s, { r: 2, c: 3 }, { r: 2, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const act = clears(r.steps)[0].activations.find((a) => a.special === 'bomb')!;
    expect(act.cells).toHaveLength(9);
  });

  it('a prism swapped with a jewel clears every jewel of that kind', () => {
    const s = game(['PABCD', 'BCDAB', 'CDABC', 'DABCD', 'ABCDA']);
    const as = s.board.flat().filter((j) => j!.kind === 0).length;
    const r = trySwap(s, { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = clears(r.steps)[0];
    expect(c.cleared.filter((j) => j.kind === 0)).toHaveLength(as);
    expect(c.cleared.some((j) => j.special === 'prism' || j.kind === -1)).toBe(true);
  });

  it('special combos: line+line crosses, bomb+bomb 5×5, prism+prism clears the board', () => {
    const cross = trySwap(game(['AhBvCDEF', 'BCDEAB', 'CDEABC', 'DEABCD', 'EABCDE', 'ABCDEA']), { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(cross.ok).toBe(true);
    if (cross.ok) expect(clears(cross.steps)[0].cleared.length).toBe(6 + 6 - 1);

    const bombs = trySwap(game(['BCDEFAB', 'CDEFABC', 'DEFAbBbD', 'EFABCDE', 'FABCDEF', 'ABCDEFA', 'BCDEFAB']), { r: 2, c: 3 }, { r: 2, c: 4 });
    expect(bombs.ok).toBe(true);
    if (bombs.ok) expect(clears(bombs.steps)[0].activations.find((a) => a.special === 'combo')!.cells).toHaveLength(25);

    const board = ['PPBCD', 'BCDAB', 'CDABC', 'DABCD', 'ABCDA'];
    const both = trySwap(game(board), { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(both.ok).toBe(true);
    if (both.ok) expect(clears(both.steps)[0].cleared).toHaveLength(25);
  });

  it('prism + line turns that kind into lines that all go off', () => {
    const s = game(['PBhCDEF', 'BCDEAB', 'CDEABC', 'DEBBCD', 'EBBCDE', 'ABCDEB']);
    const bs = s.board.flat().filter((j) => j!.kind === 1 && !j!.special).length;
    const r = trySwap(s, { r: 0, c: 0 }, { r: 0, c: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = clears(r.steps)[0];
    expect(c.activations.filter((a) => a.special === 'lineH' || a.special === 'lineV').length).toBeGreaterThanOrEqual(bs);
  });
});

describe('goals, end and progress', () => {
  it('collect goals count cleared jewels; winning adds the bonus for moves left', () => {
    const s = game(['AABAC', 'BCABD', 'CDEEB', 'DEBCA', 'EBCDE'], { goals: [{ type: 'collect', kind: 0, count: 3 }], movesLeft: 5 });
    const r = trySwap(s, { r: 0, c: 3 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe('won');
    expect(r.steps.at(-1)).toEqual({ type: 'end', status: 'won', bonus: 4 * SCORE.moveLeft });
    expect(goalProgress(r.state)[0]).toMatchObject({ current: 3, target: 3, done: true });
  });

  it('running out of moves without the goal loses; no move is accepted after', () => {
    const s = game(['AABAC', 'BCABD', 'CDEEB', 'DEBCA', 'EBCDE'], { goals: [{ type: 'collect', kind: 5, count: 99 }], movesLeft: 1 });
    const r = trySwap(s, { r: 0, c: 3 }, { r: 0, c: 2 });
    expect(r.ok && r.state.status).toBe('lost');
    if (r.ok) expect(trySwap(r.state, { r: 0, c: 0 }, { r: 0, c: 1 })).toMatchObject({ ok: false, reason: 'not_playing' });
  });

  it('crystal breaks under cleared jewels', () => {
    const level = levelById(6);
    let s = createGame(level, 3);
    const total = s.iceTotal;
    expect(total).toBe(16);
    for (let i = 0; i < 20 && s.status === 'playing'; i++) {
      const m = hint(s)!;
      const r = trySwap(s, m[0], m[1]);
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.iceLeft).toBeLessThan(total);
    expect(goalProgress(s)[0].current).toBe(total - s.iceLeft);
  });

  it('stars follow the thresholds', () => {
    expect(starsFor(0, [10, 20, 30])).toBe(0);
    expect(starsFor(25, [10, 20, 30])).toBe(2);
    expect(starsFor(30, [10, 20, 30])).toBe(3);
  });

  it('restarting a level with the same seed replays exactly', () => {
    const play = () => {
      let s = createGame(LEVELS[1], 11);
      for (let i = 0; i < 8; i++) {
        const m = hint(s)!;
        const r = trySwap(s, m[0], m[1]);
        if (!r.ok) break;
        s = r.state;
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('progress: winning unlocks the next level, keeps the best score, rewards the first win; storage is validated', () => {
    let o = recordResult(EMPTY_PROGRESS, 1, true, 4000, 2);
    expect(o.reward).toBe(LEVELS[0].reward);
    let p = o.progress;
    expect(p).toMatchObject({ unlocked: 2, current: 2, best: { 1: { score: 4000, stars: 2 } } });
    expect(p.boosters[LEVELS[0].reward]).toBe(EMPTY_PROGRESS.boosters[LEVELS[0].reward] + 1);
    o = recordResult(p, 1, true, 3000, 3);
    expect(o.reward).toBeNull();
    p = o.progress;
    expect(p.best[1]).toEqual({ score: 4000, stars: 3 });
    p = recordResult(p, 2, false, 100, 0).progress;
    expect(p).toMatchObject({ unlocked: 2, current: 2 });
    expect(normalizeProgress({ unlocked: 999, current: 5, best: { 1: { score: -5, stars: 9 }, x: 1 }, boosters: { hammer: 99, shuffle: -3, lightning: 'x' } })).toEqual({
      unlocked: 1,
      current: 1,
      best: { 1: { score: 0, stars: 3 } },
      boosters: { hammer: MAX_BOOSTERS, shuffle: 0, lightning: 0, olympus: 0 },
    });
    expect(normalizeProgress(null).boosters).toEqual(STARTING_BOOSTERS);
    expect(normalizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(spendBooster(p, 'hammer').boosters.hammer).toBe(p.boosters.hammer - 1);
    expect(spendBooster({ ...p, boosters: { ...p.boosters, olympus: 0 } }, 'olympus').boosters.olympus).toBe(0);
  });
});

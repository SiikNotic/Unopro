import { describe, expect, it } from 'vitest';
import { boardFrom, boosterArea, cascadeFactor, createGame, findGroups, findMove, goalProgress, groupPoints, reshuffle, SCORE, specialFor, trySwap, applyBooster } from '../engine';
import type { Board, JewelState, Step } from '../engine';
import { createRng } from '@/games/shared/rng';

function game(rows: string[], patch: Partial<JewelState> = {}): JewelState {
  const board = boardFrom(rows);
  const base = createGame({ id: 99, rows: board.length, cols: board[0].length, kinds: 6, moves: 10, goals: [{ type: 'score', target: 1e9 }], stars: [1, 2, 3], difficulty: 'easy', reward: 'hammer' }, 7);
  const stones = board.flat().filter((j) => j?.kind === -2).length;
  return { ...base, board, nextId: 1000, stonesLeft: stones, stonesTotal: stones, ...patch };
}
const clears = (steps: Step[]) => steps.filter((s): s is Extract<Step, { type: 'clear' }> => s.type === 'clear');
const noNulls = (b: Board) => b.every((r) => r.every((j) => j !== null));

describe('scoring', () => {
  it('is centralised: 3 / 4 / 5 in a line and T / L', () => {
    expect(groupPoints(3, false)).toBe(SCORE.match[3]);
    expect(groupPoints(4, false)).toBe(SCORE.match[4]);
    expect(groupPoints(5, false)).toBe(SCORE.match[5]);
    expect(groupPoints(7, false)).toBe(SCORE.match[5]);
    expect(groupPoints(5, true)).toBe(SCORE.corner);
    expect(cascadeFactor(1)).toEqual({ mult: 1, bonus: 0 });
    expect(cascadeFactor(3)).toEqual({ mult: 1 + 2 * SCORE.cascadeStep, bonus: 2 * SCORE.cascadeBonus });
  });

  it('a match of 4 scores the match-4 value and makes Lightning', () => {
    const s = game(['AACAB', 'BCADC', 'CDEEB', 'DEBCA', 'EBCDE']);
    const r = trySwap(s, { r: 1, c: 2 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = clears(r.steps)[0];
    expect(c.groups).toEqual([{ size: 4, shape: 'line' }]);
    expect(c.points).toBe(SCORE.match[4]);
    expect(c.created[0].special).toBe('lineV');
  });

  it('a match of 5 scores the match-5 value and makes a Trident; a T scores the corner value and makes a Temple', () => {
    const five = trySwap(game(['AABAA', 'CDAEF', 'DEFBC', 'EFBCD', 'FBCDE']), { r: 1, c: 2 }, { r: 0, c: 2 });
    expect(five.ok).toBe(true);
    if (five.ok) {
      expect(clears(five.steps)[0].groups).toEqual([{ size: 5, shape: 'line' }]);
      expect(clears(five.steps)[0].created[0].special).toBe('prism');
      expect(clears(five.steps)[0].points).toBe(SCORE.match[5]);
    }
    // L: A A _ with A A below the gap; the A from (0,3) fills it.
    const ell = trySwap(game(['AABAF', 'CDAEF', 'DEAFB', 'EFBCD', 'FBCDE']), { r: 0, c: 3 }, { r: 0, c: 2 });
    expect(ell.ok).toBe(true);
    if (ell.ok) {
      const c = clears(ell.steps)[0];
      expect(c.groups[0].shape).toBe('corner');
      expect(c.created[0].special).toBe('bomb');
      expect(c.points).toBe(SCORE.corner);
    }
  });

  it('a level without Tridents makes the next special down instead', () => {
    const g = findGroups(boardFrom(['AAAAA', 'BCDEB']))[0];
    expect(specialFor(g, ['lineH', 'lineV'])).toBe('lineV');
    expect(specialFor(g, [])).toBeNull();
  });
});

describe('marble seals', () => {
  it("can't be swapped and never match", () => {
    const s = game(['1ABCD', 'BCDAB', 'CDABC', 'DABCD', 'ABCDA']);
    expect(trySwap(s, { r: 0, c: 0 }, { r: 0, c: 1 })).toMatchObject({ ok: false, reason: 'blocked' });
    expect(findGroups(boardFrom(['111', 'ABC']))).toHaveLength(0);
  });

  it('crack when a match is next to them, and break after their last hit', () => {
    // A A . A in row 1 with a 2-hit seal above the gap: two matches next to it break it.
    let s = game(['BC2DE', 'AABAC', 'CDADE', 'DEBCD', 'EBCDE'], { goals: [{ type: 'stone' }] });
    let r = trySwap(s, { r: 1, c: 3 }, { r: 1, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const hit = clears(r.steps)[0].stonesHit;
    expect(hit).toHaveLength(1);
    expect(hit[0].hp).toBe(1);
    expect(r.state.stonesLeft).toBe(1);
    s = { ...game(['BC1DE', 'AABAC', 'CDADE', 'DEBCD', 'EBCDE'], { goals: [{ type: 'stone' }] }) };
    r = trySwap(s, { r: 1, c: 3 }, { r: 1, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(clears(r.steps)[0].cleared.some((j) => j.kind === -2)).toBe(true);
    expect(r.state.stonesLeft).toBe(0);
    expect(r.state.status).toBe('won');
    expect(goalProgress(r.state)[0]).toMatchObject({ current: 1, target: 1, done: true });
  });

  it('fall with the jewels and stay in place when the board is reshuffled', () => {
    // A 2-hit seal over the match: it cracks (1 hit left) and falls into the gap below it.
    const s = game(['2ABCD', 'AABAC', 'CDADE', 'DEBCD', 'EBCDE']);
    const r = trySwap(s, { r: 1, c: 3 }, { r: 1, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fall = r.steps.find((x): x is Extract<Step, { type: 'fall' }> => x.type === 'fall')!;
    expect(fall.moves.some((m) => m.from.r === 0 && m.from.c === 0 && m.to.r === 1)).toBe(true);
    expect(r.state.board[1][0]).toMatchObject({ kind: -2, hp: 1 });
    expect(noNulls(r.state.board)).toBe(true);
    const board = boardFrom(['1BCDA', 'BCDA2', 'CDABC', 'DABCD', 'ABCDA']);
    const shuffled = reshuffle(board, createRng(5));
    expect(shuffled[0][0]!.kind).toBe(-2);
    expect(shuffled[1][4]!.kind).toBe(-2);
  });
});

describe('goals', () => {
  it('count matches, cascade combos and specials that went off', () => {
    const s = game(['AhACAB', 'BCADCF', 'CDEEBA', 'DEBCAD', 'EBCDEF', 'FABCDE'], {
      goals: [
        { type: 'matches', count: 1 },
        { type: 'specials', count: 1 },
      ],
    });
    const r = trySwap(s, { r: 1, c: 2 }, { r: 0, c: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.matches).toBeGreaterThanOrEqual(1);
    expect(r.state.specialsFired).toBeGreaterThanOrEqual(1);
    expect(r.state.status).toBe('won');
    const cs = clears(r.steps);
    expect(r.state.combos).toBe(cs.filter((c) => c.cascade >= 2).length);
  });
});

describe('power-ups', () => {
  const rows = ['ABCDEF', 'BCDEFA', 'CDEFAB', 'DEFABC', 'EFABCD', 'FABCDE'];

  it("don't use a move and resolve cascades", () => {
    const s = game(rows);
    for (const b of ['hammer', 'lightning', 'olympus'] as const) {
      const r = applyBooster(s, b, { r: 2, c: 2 });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.movesLeft).toBe(s.movesLeft);
      expect(r.steps[0]).toMatchObject({ type: 'booster', booster: b });
      expect(noNulls(r.state.board)).toBe(true);
      expect(findGroups(r.state.board)).toHaveLength(0);
    }
  });

  it('hit what they say: one jewel, a row and a column, every jewel of one kind', () => {
    const s = game(rows);
    expect(boosterArea(s, 'hammer', { r: 1, c: 1 })).toEqual([{ r: 1, c: 1 }]);
    expect(boosterArea(s, 'lightning', { r: 1, c: 1 })).toHaveLength(6 + 5);
    const kind = s.board[1][1]!.kind;
    expect(boosterArea(s, 'olympus', { r: 1, c: 1 })).toHaveLength(s.board.flat().filter((j) => j!.kind === kind).length);
    expect(boosterArea(s, 'olympus', { r: 9, c: 9 })).toEqual([]);
    expect(applyBooster(s, 'hammer', { r: 9, c: 9 })).toMatchObject({ ok: false, reason: 'bad_target' });
  });

  it('the hammer cracks a seal; Divine Shuffle rearranges without a target and keeps a legal move', () => {
    const s = game(['2BCDEF', 'BCDEFA', 'CDEFAB', 'DEFABC', 'EFABCD', 'FABCDE']);
    const r = applyBooster(s, 'hammer', { r: 0, c: 0 });
    expect(r.ok && r.state.board[0][0]).toMatchObject({ kind: -2, hp: 1 });
    const sh = applyBooster(s, 'shuffle', null);
    expect(sh.ok).toBe(true);
    if (!sh.ok) return;
    expect(sh.steps.map((x) => x.type)).toEqual(['booster', 'shuffle']);
    expect(findMove(sh.state.board)).not.toBeNull();
    expect(findGroups(sh.state.board)).toHaveLength(0);
    expect(sh.state.board[0][0]!.kind).toBe(-2);
  });

  it('can finish a level (won, with the bonus for moves left); not after it ended', () => {
    const s = game(rows, { goals: [{ type: 'collect', kind: 0, count: 6 }], movesLeft: 3 });
    const r = applyBooster(s, 'olympus', { r: 0, c: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe('won');
    expect(r.steps.at(-1)).toEqual({ type: 'end', status: 'won', bonus: 3 * SCORE.moveLeft });
    expect(applyBooster(r.state, 'hammer', { r: 0, c: 0 })).toMatchObject({ ok: false, reason: 'not_playing' });
  });

  it('is deterministic', () => {
    const s = game(rows);
    expect(applyBooster(s, 'lightning', { r: 3, c: 3 })).toEqual(applyBooster(s, 'lightning', { r: 3, c: 3 }));
  });
});

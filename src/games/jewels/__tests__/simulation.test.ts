// Many simulated games on every level: a bot plays (mostly the best move, sometimes a random one, now and
// then a power-up) and every state is checked for things that must never happen: holes, leftover matches,
// duplicated pieces, counters out of sync, a stuck board, runaway cascades, illegal moves accepted.
import { describe, expect, it } from 'vitest';
import { createRng } from '@/games/shared/rng';
import { BOOSTERS, createGame, findGroups, findMove, goalProgress, isProductive, LEVELS, trySwap, applyBooster } from '../engine';
import type { JewelState, LevelDef, Pos, Step } from '../engine';

function productive(s: JewelState): [Pos, Pos][] {
  const out: [Pos, Pos][] = [];
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      if (c + 1 < s.cols && isProductive(s.board, { r, c }, { r, c: c + 1 })) out.push([{ r, c }, { r, c: c + 1 }]);
      if (r + 1 < s.rows && isProductive(s.board, { r, c }, { r: r + 1, c })) out.push([{ r, c }, { r: r + 1, c }]);
    }
  return out;
}

function checkState(s: JewelState, before: JewelState) {
  expect(s.board.every((row) => row.every((j) => j !== null))).toBe(true);
  expect(findGroups(s.board)).toHaveLength(0);
  const ids = s.board.flat().map((j) => j!.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(s.board.flat().filter((j) => j!.kind === -2).length).toBe(s.stonesLeft);
  expect(s.ice.flat().filter(Boolean).length).toBe(s.iceLeft);
  expect(s.score).toBeGreaterThanOrEqual(before.score);
  expect(s.movesLeft).toBeGreaterThanOrEqual(0);
  if (s.status === 'playing') expect(findMove(s.board)).not.toBeNull();
  if (s.status === 'won') expect(goalProgress(s).every((g) => g.done)).toBe(true);
  if (s.status === 'lost') expect(s.movesLeft).toBe(0);
}

function checkSteps(steps: Step[]) {
  const clears = steps.filter((x) => x.type === 'clear');
  expect(clears.length).toBeLessThan(60);
  const ends = steps.filter((x) => x.type === 'end');
  expect(ends.length).toBeLessThanOrEqual(1);
  if (ends.length) expect(steps.at(-1)!.type).toBe('end');
}

function playBot(level: LevelDef, seed: number) {
  let s = createGame(level, seed);
  const rnd = createRng(seed * 31 + level.id);
  let boosters = 0;
  for (let guard = 0; guard < 120 && s.status === 'playing'; guard++) {
    // An illegal swap now and then: refused, nothing changes.
    if (rnd.next() < 0.1) {
      const r = Math.floor(rnd.next() * s.rows);
      const c = Math.floor(rnd.next() * (s.cols - 1));
      if (!isProductive(s.board, { r, c }, { r, c: c + 1 })) {
        const res = trySwap(s, { r, c }, { r, c: c + 1 });
        expect(res.ok).toBe(false);
      }
      expect(trySwap(s, { r: 0, c: 0 }, { r: 2, c: 2 })).toMatchObject({ ok: false, reason: 'not_adjacent' });
    }
    // A power-up now and then (at most three per game).
    if (boosters < 3 && rnd.next() < 0.06) {
      const b = BOOSTERS[Math.floor(rnd.next() * BOOSTERS.length)];
      const target = { r: Math.floor(rnd.next() * s.rows), c: Math.floor(rnd.next() * s.cols) };
      const res = applyBooster(s, b, target);
      if (res.ok) {
        boosters++;
        expect(res.state.movesLeft).toBe(s.movesLeft);
        checkSteps(res.steps);
        checkState(res.state, s);
        s = res.state;
        continue;
      }
    }
    const options = productive(s)
      .map((m) => {
        const r = trySwap(s, m[0], m[1]);
        return r.ok ? { r, v: goalProgress(r.state).reduce((a, g) => a + Math.min(1, g.current / g.target), 0) * 1000 + r.state.score / 50 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    expect(options.length).toBeGreaterThan(0);
    options.sort((a, b) => b.v - a.v);
    const pick = rnd.next() < 0.6 ? options[0] : options[Math.floor(rnd.next() * options.length)];
    expect(pick.r.state.movesLeft).toBe(s.movesLeft - 1);
    checkSteps(pick.r.steps);
    checkState(pick.r.state, s);
    s = pick.r.state;
  }
  expect(s.status).not.toBe('playing');
  // The finished game takes no more moves or power-ups.
  expect(trySwap(s, { r: 0, c: 0 }, { r: 0, c: 1 })).toMatchObject({ ok: false, reason: 'not_playing' });
  expect(applyBooster(s, 'shuffle', null)).toMatchObject({ ok: false, reason: 'not_playing' });
  return s;
}

describe('simulated games', () => {
  it('every level: no impossible state, no deadlock, no runaway cascade, and the bot can win', () => {
    for (const level of LEVELS) {
      const games = Array.from({ length: 8 }, (_, i) => playBot(level, 500 + i));
      const wins = games.filter((g) => g.status === 'won').length;
      // A decent player wins most games; the hardest levels still at least some of the time.
      expect(wins, `level ${level.id} won ${wins}/8`).toBeGreaterThanOrEqual(level.difficulty === 'divine' ? 3 : 5);
    }
  }, 240000);

  it('the same seed and the same moves always give the same game', () => {
    const level = LEVELS[9];
    expect(playBot(level, 77)).toEqual(playBot(level, 77));
  }, 60000);
});

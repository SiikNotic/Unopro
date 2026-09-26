import { describe, expect, it } from 'vitest';
import { seedHash } from '@/casino/table/fair';
import { drawRace, progressAt, verifyRace } from '../fair';
import { parseHorseState } from '../api';
import { racePhase } from '../useHorseRace';

const hex = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

describe('race draw (same as the database)', () => {
  // Vectors computed by public.horse_draw in Postgres.
  it('matches the SQL function', () => {
    const a = drawRace('ab'.repeat(32), 7, 9600);
    expect(a.runners.map((r) => [r.horse, r.odds])).toEqual([[1, 460], [2, 620], [3, 351], [4, 489], [5, 2664], [6, 2254], [7, 2084], [8, 2254]]);
    expect(a.order).toEqual([3, 4, 1, 2, 8, 7, 6, 5]);
    const b = drawRace('01'.repeat(32), 123, 9000);
    expect(b.runners.map((r) => [r.horse, r.odds])).toEqual([[2, 342], [3, 437], [4, 526], [5, 464], [6, 1950], [7, 750]]);
    expect(b.order).toEqual([5, 2, 4, 6, 7, 3]);
  });

  it('returns about the RTP on every horse, and each horse wins as often as its weight says', () => {
    let expected = 0;
    let staked = 0;
    let paid = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const seed = seedHash(hex(`r${i}`));
      const d = drawRace(seed, i, 9600);
      const total = d.runners.reduce((a, r) => a + Number(r.weight), 0);
      for (const r of d.runners) expected += ((Number(r.weight) / total) * r.odds) / 100 / d.runners.length;
      staked += d.runners.length;
      paid += d.runners.find((r) => r.horse === d.order[0])!.odds / 100;
      expect(new Set(d.order).size).toBe(d.runners.length);
      expect(d.runners.length).toBeGreaterThanOrEqual(6);
      expect(d.runners.length).toBeLessThanOrEqual(8);
    }
    // The exact expectation is just under 96% (odds are rounded down); the sampled return is close to it.
    expect(expected / n).toBeGreaterThan(0.95);
    expect(expected / n).toBeLessThanOrEqual(0.96);
    expect(paid / staked).toBeGreaterThan(0.9);
    expect(paid / staked).toBeLessThan(1.02);
  });

  it('verifies a revealed race and rejects a tampered one', () => {
    const seed = 'ab'.repeat(32);
    const good = { round: 7, seed, hash: seedHash(seed), rtp: 9600, runners: drawRace(seed, 7, 9600).runners.map(({ horse, odds }) => ({ horse, odds })), order: [3, 4, 1, 2, 8, 7, 6, 5] };
    expect(verifyRace(good)).toBe(true);
    expect(verifyRace({ ...good, order: [4, 3, 1, 2, 8, 7, 6, 5] })).toBe(false);
    expect(verifyRace({ ...good, runners: good.runners.map((r, i) => (i === 0 ? { ...r, odds: r.odds + 1 } : r)) })).toBe(false);
    expect(verifyRace({ ...good, hash: seedHash('cd'.repeat(32)) })).toBe(false);
  });
});

describe('race drawing', () => {
  it('moves each horse forward only, through its checkpoints, and a little past the line', () => {
    const cp = [4000, 8500, 12600, 17200, 21000, 25300, 29800, 34000];
    let prev = -1;
    for (let t = 0; t <= 34000; t += 100) {
      const p = progressAt(cp, t);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
    expect(progressAt(cp, 0)).toBe(0);
    expect(progressAt(cp, 17200)).toBeCloseTo(0.5, 6);
    expect(progressAt(cp, 34000)).toBeCloseTo(1, 6);
    expect(progressAt(cp, 36000)).toBeGreaterThan(1);
    expect(progressAt(cp, 60000)).toBeLessThan(1.1);
  });

  it('phases follow the database clock', () => {
    const race = { id: 1, hash: 'h', rtp: 9600, minBet: 10, maxBet: 100000, startsAt: 10000, runners: [], started: false, finished: false, paths: null, finishAt: null, order: null, seed: null };
    expect(racePhase(race, 5000)).toBe('betting');
    expect(racePhase(race, 7000)).toBe('countdown');
    expect(racePhase({ ...race, started: true, finishAt: 48000 }, 20000)).toBe('racing');
    expect(racePhase({ ...race, started: true, finishAt: 48000 }, 48500)).toBe('result');
  });

  it('reads the server answer and refuses a malformed one', () => {
    const s = parseHorseState({
      now: '2026-09-26T10:00:00Z',
      enabled: true,
      race: { id: 3, hash: 'ab', rtp: 9600, minBet: 10, maxBet: 100000, startsAt: '2026-09-26T10:00:20Z', runners: [{ horse: 1, odds: 450 }, { horse: 4, odds: 220 }], started: true, finished: false, paths: [{ horse: 1, cp: [1, 2, 3, 4, 5, 6, 7, 8] }], finishAt: '2026-09-26T10:01:00Z', order: null, seed: null },
      bets: [{ name: 'Alex***', horse: 4, amount: 500, odds: 220, status: 'placed', payout: null, me: false }],
      players: 1,
      mine: null,
      balance: 1000,
      history: [{ id: 2, horse: 5, odds: 1250 }],
    });
    expect(s?.race.runners).toHaveLength(2);
    expect(s?.race.paths?.[0].cp).toHaveLength(8);
    expect(s?.history[0].horse).toBe(5);
    expect(parseHorseState({ now: '2026-09-26T10:00:00Z', race: { id: 1, hash: 'x', startsAt: '2026-09-26T10:00:00Z', runners: [{ horse: 9, odds: 1 }] } })).toBeNull();
    expect(parseHorseState(null)).toBeNull();
  });
});

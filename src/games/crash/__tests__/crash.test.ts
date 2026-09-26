import { describe, expect, it } from 'vitest';
import { seedHash } from '@/casino/table/fair';
import { crashPoint, multiplierAt, secondsTo, verifyCrash } from '../fair';
import { parseState } from '../api';
import { phaseOf } from '../useCrash';

const sha = (s: string) => {
  // the seed of round 18 in the vectors below is SHA-256("18")
  return seedHash(Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join(''));
};

describe('crash point (same as the database)', () => {
  // Vectors computed by public.crash_point in Postgres.
  it('matches the SQL function', () => {
    expect(crashPoint('ab'.repeat(32), 7)).toBe(15.51);
    expect(crashPoint('01'.repeat(32), 1)).toBe(1.6);
    expect(crashPoint('ff'.repeat(32), 123456)).toBe(4.4);
    expect(crashPoint(sha('18'), 18)).toBe(1);
  });

  it('verifies a revealed round and rejects a tampered one', () => {
    const seed = 'ab'.repeat(32);
    const hash = seedHash(seed);
    expect(verifyCrash({ round: 7, seed, hash, crash: 15.51 })).toBe(true);
    expect(verifyCrash({ round: 7, seed, hash, crash: 15.52 })).toBe(false);
    expect(verifyCrash({ round: 8, seed, hash, crash: 15.51 })).toBe(false);
    expect(verifyCrash({ round: 7, seed, hash: seedHash('cd'.repeat(32)), crash: 15.51 })).toBe(false);
  });

  it('pays 97% at any target: P(crash ≥ x) ≈ 32/33 · 1/x', () => {
    let atLeast2 = 0;
    let atLeast10 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const seed = sha(`s${i}`);
      const c = crashPoint(seed, i);
      if (c >= 2) atLeast2++;
      if (c >= 10) atLeast10++;
    }
    expect(atLeast2 / n).toBeGreaterThan(0.47);
    expect(atLeast2 / n).toBeLessThan(0.5);
    expect(atLeast10 / n).toBeGreaterThan(0.08);
    expect(atLeast10 / n).toBeLessThan(0.115);
  });
});

describe('flight', () => {
  it('grows 2x at ~11.6 s and 10x at ~38.4 s', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(multiplierAt(11.56)).toBe(2);
    expect(multiplierAt(38.38)).toBe(10);
    expect(secondsTo(2)).toBeCloseTo(11.55, 1);
    expect(multiplierAt(secondsTo(4.37) + 0.001)).toBe(4.37);
  });

  it('phases follow the database clock', () => {
    const round = { id: 1, hash: 'h', startsAt: 10000, crashed: false, crash: null, crashAt: null, seed: null };
    expect(phaseOf(round, 5000)).toBe('betting');
    expect(phaseOf(round, 7500)).toBe('countdown');
    expect(phaseOf(round, 12000)).toBe('flying');
    expect(phaseOf({ ...round, crashed: true, crash: 2, crashAt: 21550 }, 22000)).toBe('crashed');
  });
});

describe('state parsing', () => {
  it('reads the server answer and refuses a malformed one', () => {
    const s = parseState({
      now: '2026-09-26T10:00:00Z',
      enabled: true,
      round: { id: 5, hash: 'ab', startsAt: '2026-09-26T10:00:05Z', crashed: false, crash: null, crashAt: null, seed: null },
      bets: [{ name: 'Alex***', amount: 1000, status: 'placed', cashout: null, payout: null, me: true }],
      players: 1,
      mine: { amount: 1000, auto: '2.00', status: 'placed', cashout: null, payout: null },
      balance: 9000,
      history: [{ id: 4, crash: '4.37' }],
    });
    expect(s?.round.startsAt).toBe(Date.parse('2026-09-26T10:00:05Z'));
    expect(s?.mine?.auto).toBe(2);
    expect(s?.history[0].crash).toBe(4.37);
    expect(parseState({ now: 'x', round: {} })).toBeNull();
    expect(parseState(null)).toBeNull();
  });
});

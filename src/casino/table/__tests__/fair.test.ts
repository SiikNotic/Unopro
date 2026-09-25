import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fairInts, fairShuffle, fromHex, hmacSha256, isSeed, newSeed, seedHash, sha256, toHex } from '../fair';
import { advanceBj, BJ_TIMING, bjTableView, createBjTable, markPaid, placeBet, unpaid, verifyBj } from '../blackjackTable';
import type { BjTable } from '../blackjackTable';
import { addBets, advanceRt, createRtTable, markPaid as rtPaid, RT_TIMING, rtPocket, rtTableView, unpaid as rtUnpaid, verifyRt } from '../rouletteTable';

const T0 = 1_000_000;

describe('fair randomness', () => {
  it('sha256 and hmac match the platform crypto', () => {
    for (const len of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 200, 1000]) {
      const data = randomBytes(len);
      expect(toHex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
      const key = randomBytes(len % 2 ? 32 : 100);
      expect(toHex(hmacSha256(key, data))).toBe(createHmac('sha256', key).update(data).digest('hex'));
    }
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('seeds are 256-bit hex and the hash is the SHA-256 of their bytes', () => {
    const s = newSeed();
    expect(isSeed(s)).toBe(true);
    expect(newSeed()).not.toBe(s);
    expect(seedHash(s)).toBe(createHash('sha256').update(fromHex(s)).digest('hex'));
    expect(isSeed('xyz')).toBe(false);
  });

  it('integers are deterministic, in range and evenly spread', () => {
    const seed = newSeed();
    const a = fairInts(seed, 'x');
    const b = fairInts(seed, 'x');
    const counts = new Array(37).fill(0);
    for (let i = 0; i < 37000; i++) {
      const v = a(37);
      expect(v).toBe(b(37));
      counts[v]++;
    }
    for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(200);
    expect(fairInts(seed, 'y')(1_000_000)).not.toBe(fairInts(seed, 'x')(1_000_000));
  });

  it('shuffles are permutations', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const out = fairShuffle(items, newSeed(), 'deck');
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(out).not.toEqual(items);
  });
});

describe('provably fair tables', () => {
  function settledBj(): BjTable {
    let t = placeBet(createBjTable(newSeed(), T0), 's0', 'u0', 'A', 100, T0);
    t = advanceBj(t, T0 + BJ_TIMING.betting, ['s0']);
    for (let i = 0; i < 20 && t.phase !== 'settled'; i++) t = advanceBj(t, t.phaseAt + (t.phase === 'playing' ? BJ_TIMING.turn : BJ_TIMING.dealerStep), ['s0']);
    expect(t.phase).toBe('settled');
    return t;
  }

  it('blackjack: the hash is committed before bets, the seed only shows once settled, and it verifies', () => {
    const fresh = createBjTable(newSeed(), T0);
    const before = bjTableView(fresh);
    expect(before.fair.hash).toBe(seedHash(fresh.seed));
    expect(before.fair.revealed).toBeNull();

    let t = placeBet(fresh, 's0', 'u0', 'A', 100, T0);
    t = advanceBj(t, T0 + BJ_TIMING.betting, ['s0']);
    if (t.phase === 'playing') expect(JSON.stringify(bjTableView(t))).not.toContain(t.seed);

    const s = settledBj();
    const v = bjTableView(s);
    expect(v.fair.revealed?.seed).toBe(s.seed);
    expect(verifyBj(v.fair.revealed!)).toBe(true);
    // every card on the table left the shoe in the revealed order
    const shown = [...v.dealer, ...v.seats.flatMap((x) => x.cards)].map((c) => c!.id).sort();
    expect([...v.fair.revealed!.drawn].sort()).toEqual(shown);
    // a changed seed or order fails
    expect(verifyBj({ ...v.fair.revealed!, seed: newSeed() })).toBe(false);
    expect(verifyBj({ ...v.fair.revealed!, drawn: [...v.fair.revealed!.drawn].reverse() })).toBe(false);
  });

  it('blackjack: each round gets a new seed and keeps the previous one revealed', () => {
    let t = settledBj();
    for (const s of unpaid(t)) t = markPaid(t, s.seat);
    const old = t.seed;
    t = advanceBj(t, t.phaseAt + BJ_TIMING.settled, ['s0'], () => 'ab'.repeat(32));
    expect(t.round).toBe(2);
    expect(t.seed).toBe('ab'.repeat(32));
    const v = bjTableView(t);
    expect(v.fair.hash).toBe(seedHash(t.seed));
    expect(v.fair.revealed?.seed).toBe(old);
    expect(verifyBj(v.fair.revealed!)).toBe(true);
  });

  it('roulette: the pocket comes from the seed, revealed at the result, and verifies', () => {
    let t = addBets(createRtTable(newSeed(), T0), 's0', 'u', 'A', [{ type: 'red', amount: 10 }], T0);
    expect(JSON.stringify(rtTableView(t))).not.toContain(t.seed);
    t = advanceRt(t, T0 + RT_TIMING.betting);
    expect(t.pocket).toBe(rtPocket(t.seed));
    expect(JSON.stringify(rtTableView(t))).not.toContain(t.seed);
    t = advanceRt(t, t.phaseAt + RT_TIMING.spin);
    const v = rtTableView(t);
    expect(v.fair.revealed).toMatchObject({ seed: t.seed, pocket: t.pocket });
    expect(verifyRt(v.fair.revealed!)).toBe(true);
    expect(verifyRt({ ...v.fair.revealed!, pocket: (t.pocket! + 1) % 37 })).toBe(false);
    for (const s of rtUnpaid(t)) t = rtPaid(t, s.seat);
    const next = advanceRt(t, t.phaseAt + RT_TIMING.result);
    expect(next.seed).not.toBe(t.seed);
    expect(rtTableView(next).fair.revealed?.seed).toBe(t.seed);
  });
});

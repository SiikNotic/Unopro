import { describe, expect, it } from 'vitest';
import { gridOf, MACHINE_IDS, playRound, settleRound, stripsOf } from '../engine';
import type { MachineMath, RoundDraws } from '../engine';
import { MACHINES } from '../machines';
import { MACHINE_STATS } from '../machineStats';
import { exactReturn, simulate } from '../analysis';

const seeded = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
};

describe.each(MACHINE_IDS)('machine %s', (id) => {
  const m: MachineMath = MACHINES[id];

  it('has a return between 94% and 97% (exact, from its own strips)', () => {
    const rtp = exactReturn(m).rtp;
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(0.97);
  });

  it('publishes the figures of its current config (machineStats is regenerated)', () => {
    expect(MACHINE_STATS[id].rtp).toBeCloseTo(exactReturn(m).rtp, 4);
    expect(MACHINE_STATS[id].maxWin).toBe(m.maxWin);
    expect(MACHINE_STATS[id].lines).toBe(m.lines.length);
  });

  it('simulation agrees with the published hit rate', () => {
    const s = simulate(m, 40_000, 99);
    expect(Math.abs(s.hitRate - MACHINE_STATS[id].hitRate)).toBeLessThan(0.015);
  });

  it('builds printed-looking strips: every symbol present, no identical neighbours', () => {
    for (const [r, strip] of stripsOf(m).entries()) {
      for (const [sym, counts] of Object.entries(m.reelCounts)) expect(strip.filter((x) => x === sym).length).toBe(counts[r]);
      for (let i = 0; i < strip.length; i++) expect(strip[i]).not.toBe(strip[(i + 1) % strip.length]);
    }
  });

  it('every round re-settles to the same payout from its draws, and never exceeds the cap', () => {
    const rand = seeded(7);
    for (let i = 0; i < 3000; i++) {
      const bet = m.betLevels[i % m.betLevels.length];
      const r = playRound(m, bet, rand);
      const again = settleRound(m, bet, JSON.parse(JSON.stringify(r.draws)) as RoundDraws);
      expect(again.payout).toBe(r.payout);
      expect(Number.isInteger(r.payout)).toBe(true);
      expect(r.payout).toBeLessThanOrEqual(bet * m.maxWin);
    }
  });

  it('rejects forged rounds', () => {
    const rand = seeded(11);
    const bet = m.betLevels[0];
    let r = playRound(m, bet, rand);
    // A round that triggered a feature, when the machine has one.
    for (let i = 0; i < 20000 && !(r.freeAwarded || r.picks.length); i++) r = playRound(m, bet, rand);
    const d = r.draws;
    const bad: RoundDraws[] = [
      { ...d, free: [...d.free, { stops: d.base.stops }] },
      { ...d, picks: [...d.picks, 9999] },
      { ...d, base: { ...d.base, winMult: 1000 } },
      { ...d, base: { ...d.base, wildMult: 1000 } },
    ];
    if (d.free.length) bad.push({ ...d, free: d.free.slice(1) });
    if (d.picks.length) bad.push({ ...d, picks: d.picks.slice(1) });
    for (const b of bad) expect(() => settleRound(m, bet, b)).toThrow();
  });

  it('shows 5 reels × 3 rows', () => {
    const grid = gridOf(m, [0, 0, 0, 0, 0]);
    expect(grid).toHaveLength(5);
    grid.forEach((c) => expect(c).toHaveLength(3));
  });
});

describe('machines are genuinely different', () => {
  it('no two machines share strips or paytables', () => {
    const sig = (m: MachineMath) => JSON.stringify([m.reelCounts, m.symbols, m.lines.length, m.features]);
    expect(new Set(MACHINE_IDS.map((id) => sig(MACHINES[id]))).size).toBe(8);
  });

  it('volatility follows the design: Lucky 7s is the calmest, Inferno the wildest', () => {
    const sd = (id: keyof typeof MACHINE_STATS) => MACHINE_STATS[id].sd;
    for (const id of MACHINE_IDS) if (id !== 'lucky7s') expect(sd('lucky7s')).toBeLessThan(sd(id));
    for (const id of MACHINE_IDS) if (id !== 'inferno') expect(sd('inferno')).toBeGreaterThan(sd(id));
    // Lucky 7s pays most often.
    for (const id of MACHINE_IDS) if (id !== 'lucky7s') expect(MACHINE_STATS.lucky7s.hitRate).toBeGreaterThan(MACHINE_STATS[id].hitRate);
  });

  it('each feature lives in its machine only', () => {
    expect(MACHINES.diamondRoyale.features.expandingWild).toBeTruthy();
    expect(MACHINES.goldenFortune.features.pickBonus?.kind).toBe('coins');
    expect(MACHINES.pirates.features.pickBonus?.kind).toBe('chests');
    expect(MACHINES.inferno.features.wildMultiplier && MACHINES.inferno.features.freeSpins?.step).toBeTruthy();
    expect(MACHINES.tropical.features.freeSpins?.multiplier).toBe(2);
    expect(MACHINES.cosmic.features.winMultiplier).toBeTruthy();
    expect(MACHINES.royal.features.jackpotLadder).toBeTruthy();
  });
});

// Exact expected return of a machine, computed from its config (no simulation), plus a Monte Carlo
// estimate of the figures that are hard to get exactly (hit rate, spread). Used by the tests and to
// publish each machine's real numbers.
import { lineResult, playRound, REELS, stripsOf } from './engine';
import type { MachineMath, Weighted } from './engine';

const mean = (w: Weighted) => w.values.reduce((s, v, i) => s + v * w.weights[i], 0) / w.weights.reduce((a, b) => a + b, 0);

export interface ExactReturn {
  /** Total expected return per unit bet, before the max-win cap (the cap only lowers it, negligibly). */
  rtp: number;
  lines: number;
  scatter: number;
  freeSpins: number;
  pickBonus: number;
  jackpot: number;
  /** Probability that a spin shows k scatters, k = 0..15. */
  scatterOdds: number[];
}

export function exactReturn(m: MachineMath): ExactReturn {
  const strips = stripsOf(m);
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const scatter = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'scatter');
  const expanding = m.features.expandingWild ?? [];

  // Per reel: the symbol a line sees on that reel (every row has the same distribution), and how many
  // scatters the reel shows.
  const dists: Map<string, number>[] = [];
  const scatterPerReel: number[][] = [];
  for (let r = 0; r < REELS; r++) {
    const strip = strips[r];
    const L = strip.length;
    const d = new Map<string, number>();
    const sc = [0, 0, 0, 0];
    for (let s = 0; s < L; s++) {
      const win = [strip[(s - 1 + L) % L], strip[s], strip[(s + 1) % L]];
      const eff = expanding.includes(r) && wild && win.includes(wild) ? wild : strip[s];
      d.set(eff, (d.get(eff) ?? 0) + 1 / L);
      sc[win.filter((x) => x === scatter).length] += 1 / L;
    }
    dists.push(d);
    scatterPerReel.push(sc);
  }

  // One line, in multiples of the line bet.
  const wm = m.features.wildMultiplier ? mean(m.features.wildMultiplier) : 1;
  const entries = dists.map((d) => [...d.entries()]);
  let lineEv = 0;
  const walk = (r: number, syms: string[], p: number) => {
    if (r === REELS) {
      const res = lineResult(m, syms);
      if (res) lineEv += p * res.pays * (res.usesWild ? wm : 1);
      return;
    }
    for (const [s, q] of entries[r]) {
      syms[r] = s;
      walk(r + 1, syms, p * q);
    }
  };
  walk(0, [], 1);
  // lines × (line bet / total bet) = 1, so the per-line value is already per unit of total bet.
  const lines = lineEv;

  let odds = [1];
  for (const sc of scatterPerReel) {
    const next = new Array(odds.length + 3).fill(0);
    odds.forEach((p, k) => sc.forEach((q, j) => (next[k + j] += p * q)));
    odds = next;
  }
  const atLeast3 = (f: (k: number) => number) => odds.reduce((s, p, k) => (k >= 3 ? s + p * f(Math.min(k, 5) - 3) : s), 0);
  const sp = m.features.scatterPays;
  const scatterEv = sp ? atLeast3((i) => sp[i]) : 0;

  const xm = m.features.winMultiplier;
  const winMultFactor = xm ? 1 + (xm.chance / 1000) * (mean(xm) - 1) : 1;
  const spin = (lines + scatterEv) * winMultFactor;

  const fs = m.features.freeSpins;
  let freeEv = 0;
  if (fs) {
    const award = atLeast3((i) => fs.count[i]);
    freeEv = odds.reduce((s, p, k) => {
      if (k < 3) return s;
      const n0 = fs.count[Math.min(k, 5) - 3];
      if (fs.retrigger) return s + p * (n0 / (1 - award)) * fs.multiplier * spin;
      const step = fs.step ?? 0;
      return s + p * (n0 * fs.multiplier + (step * n0 * (n0 - 1)) / 2) * spin;
    }, 0);
  }
  const pb = m.features.pickBonus;
  const pickEv = pb ? atLeast3((i) => pb.picks[i]) * mean(pb) : 0;
  const jl = m.features.jackpotLadder;
  const jackpotEv = jl ? atLeast3((i) => jl.tiers[i]) : 0;

  return { rtp: spin + freeEv + pickEv + jackpotEv, lines: lines * winMultFactor, scatter: scatterEv * winMultFactor, freeSpins: freeEv, pickBonus: pickEv, jackpot: jackpotEv, scatterOdds: odds };
}

export interface SimulatedStats {
  rounds: number;
  rtp: number;
  hitRate: number;
  /** Standard deviation of a round's return per unit bet: the volatility index. */
  sd: number;
  featureRate: number;
  bigWinRate: number;
}

/** Monte Carlo figures with a fast seeded generator (for analysis only, never for real rounds). */
export function simulate(m: MachineMath, rounds: number, seed = 1): SimulatedStats {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  const bet = m.betLevels[0];
  let total = 0;
  let sq = 0;
  let hits = 0;
  let feats = 0;
  let bigs = 0;
  for (let i = 0; i < rounds; i++) {
    const r = playRound(m, bet, rand);
    const x = r.payout / bet;
    total += x;
    sq += x * x;
    if (r.payout > 0) hits++;
    if (r.freeAwarded || r.picks.length || r.jackpot) feats++;
    if (r.tier === 'big' || r.tier === 'mega' || r.tier === 'jackpot') bigs++;
  }
  const rtp = total / rounds;
  return { rounds, rtp, hitRate: hits / rounds, sd: Math.sqrt(sq / rounds - rtp * rtp), featureRate: feats / rounds, bigWinRate: bigs / rounds };
}

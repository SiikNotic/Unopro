// HORSE RACING math, the same the database runs (supabase/migrations/20261008000000_horse_racing.sql). The browser
// uses it only to check a finished race; the database builds every race.
import { fromHex, hmacSha256, seedHash, toHex } from '@/casino/table/fair';

const E = 2n ** 52n;
const enc = new TextEncoder();

/** First 52 bits of HMAC-SHA256(seed, "horse:<race>:<label>"). */
export function horseU(seedHex: string, race: number, label: string): bigint {
  return BigInt(`0x${toHex(hmacSha256(fromHex(seedHex), enc.encode(`horse:${race}:${label}`))).slice(0, 13)}`);
}

export interface DrawnRunner {
  horse: number;
  weight: bigint;
  /** Odds in hundredths (450 = 4.50×). */
  odds: number;
}

/** The runners (number order), their odds and the finishing order of a race. */
export function drawRace(seedHex: string, race: number, rtpBp: number): { runners: DrawnRunner[]; order: number[] } {
  const n = 6 + Number(horseU(seedHex, race, 'count') % 3n);
  const picks = Array.from({ length: 8 }, (_, i) => ({ h: i + 1, u: horseU(seedHex, race, `pick:${i + 1}`) }))
    .sort((a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : a.h - b.h))
    .slice(0, n)
    .map((p) => p.h)
    .sort((a, b) => a - b);
  const weights = picks.map((h) => {
    const f = 40n + (horseU(seedHex, race, `form:${h}`) % 161n);
    return f * f;
  });
  const total = weights.reduce((a, b) => a + b, 0n);
  const runners = picks.map((horse, i) => {
    const odds = (BigInt(rtpBp) * total) / (weights[i] * 100n);
    return { horse, weight: weights[i], odds: Number(odds < 110n ? 110n : odds) };
  });
  const left = runners.map((r) => ({ horse: r.horse, w: r.weight }));
  const order: number[] = [];
  for (let k = 1; k <= n; k++) {
    const sum = left.reduce((a, b) => a + b.w, 0n);
    const r = (horseU(seedHex, race, k === 1 ? 'winner' : `place:${k}`) * sum) / E;
    let acc = 0n;
    for (let i = 0; i < left.length; i++) {
      acc += left[i].w;
      if (r < acc) {
        order.push(left[i].horse);
        left.splice(i, 1);
        break;
      }
    }
  }
  return { runners, order };
}

export interface HorseRevealed {
  round: number;
  seed: string;
  hash: string;
  rtp: number;
  runners: { horse: number; odds: number }[];
  order: number[];
}

/** A finished race checks out: the seed matches the published hash and gives the same runners, odds and order. */
export function verifyRace(r: HorseRevealed): boolean {
  if (seedHash(r.seed) !== r.hash) return false;
  const d = drawRace(r.seed, r.round, r.rtp);
  return (
    d.order.join(',') === r.order.join(',') &&
    d.runners.length === r.runners.length &&
    d.runners.every((x, i) => x.horse === r.runners[i].horse && x.odds === r.runners[i].odds)
  );
}

/**
 * Where a horse is (0 = start, 1 = finish) `ms` after the start, from its 8 checkpoints: a smooth, never-backwards
 * curve through them (monotone cubic). After the line it keeps going a little, slowing down.
 */
export function progressAt(cp: number[], ms: number): number {
  if (ms <= 0) return 0;
  const xs = [0, ...cp];
  const ys = xs.map((_, i) => i / 8);
  const last = xs[xs.length - 1];
  if (ms >= last) {
    const v = (ys[8] - ys[7]) / (xs[8] - xs[7]);
    const extra = (ms - last) / 1000;
    return 1 + v * 1000 * (1 - Math.exp(-extra)) * 0.9;
  }
  let i = 0;
  while (i < 7 && ms > xs[i + 1]) i++;
  const slope = (a: number) => (ys[a + 1] - ys[a]) / (xs[a + 1] - xs[a]);
  const tangent = (a: number) => {
    if (a === 0) return slope(0);
    if (a === 8) return slope(7);
    const s0 = slope(a - 1);
    const s1 = slope(a);
    return s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
  };
  const h = xs[i + 1] - xs[i];
  const t = (ms - xs[i]) / h;
  const m0 = tangent(i) * h;
  const m1 = tangent(i + 1) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1;
}

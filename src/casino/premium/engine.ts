// Shared slot engine. Every machine is a MachineMath config (machines.ts); this file turns a config,
// a bet and a source of randomness into a complete round (base spin, free spins, bonus), and can
// re-check any recorded round from its draws. Pure and dependency free: the same file runs on the
// server (to decide) and in the browser (to verify and draw what the server decided).

export const MACHINE_IDS = ['lucky7s', 'diamondRoyale', 'goldenFortune', 'inferno', 'tropical', 'pirates', 'cosmic', 'royal'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];
export const isMachineId = (x: unknown): x is MachineId => typeof x === 'string' && (MACHINE_IDS as readonly string[]).includes(x);

export const REELS = 5;
export const ROWS = 3;
/** Highest win cap of any machine, as a multiple of the bet (bounds for storage and validation). */
export const MAX_WIN_MULTIPLE = 5000;

export type SymbolKind = 'regular' | 'wild' | 'scatter';
export interface SymbolDef {
  kind: SymbolKind;
  /** Multiple of the LINE bet for 3, 4 and 5 in a row from the left. */
  pays?: [number, number, number];
}

export interface Weighted {
  values: number[];
  weights: number[];
}

export interface Features {
  /** Scatters anywhere pay this multiple of the TOTAL bet for 3, 4, 5. */
  scatterPays?: [number, number, number];
  /** Reels (0-based) where a visible wild grows to cover the whole reel. */
  expandingWild?: number[];
  /** Wins on lines that use a wild are multiplied by a value drawn for the spin. */
  wildMultiplier?: Weighted;
  /** Any winning spin may be multiplied: `chance` in 1/1000. */
  winMultiplier?: Weighted & { chance: number };
  /** 3/4/5 scatters start free spins, played at the same bet. */
  freeSpins?: { count: [number, number, number]; multiplier: number; /** added to the multiplier after each free spin */ step?: number; retrigger: boolean; max: number };
  /** 3/4/5 scatters start a pick bonus: `picks` prizes drawn from `values` (× total bet). */
  pickBonus?: Weighted & { kind: 'coins' | 'chests'; picks: [number, number, number] };
  /** 3/4/5 scatters anywhere award a fixed jackpot (× total bet). */
  jackpotLadder?: { tiers: [number, number, number] };
}

export type Volatility = 'low' | 'medium' | 'medium-high' | 'high';

export interface MachineMath {
  id: MachineId;
  lines: number[][];
  /** Allowed total bets; each is a multiple of the line count so every line bet is whole chips. */
  betLevels: number[];
  /** Symbol counts per reel; the strips are built from them deterministically. */
  reelCounts: Record<string, [number, number, number, number, number]>;
  symbols: Record<string, SymbolDef>;
  /** The symbol whose five-in-a-row is the machine's top line prize. */
  top: string;
  volatility: Volatility;
  /** Cap on a whole round (base + free spins + bonus), × total bet. */
  maxWin: number;
  features: Features;
}

// ---------------------------------------------------------------- strips

/**
 * Builds a reel strip from symbol counts: a deterministic spread (no RNG) that keeps copies of the same
 * symbol apart, so the strip looks like a real printed reel. Same counts → same strip, everywhere.
 */
export function buildStrip(counts: Record<string, number>): string[] {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  // Each copy k of symbol s gets an ideal position (k + 0.5) * total / n, plus a tiny per-symbol offset.
  const slots: { s: string; at: number }[] = [];
  entries.forEach(([s, n], i) => {
    for (let k = 0; k < n; k++) slots.push({ s, at: ((k + 0.5) * total) / n + i * 0.013 });
  });
  slots.sort((a, b) => a.at - b.at);
  const strip = slots.map((x) => x.s);
  // Break up neighbours that ended up identical (including across the wrap).
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < strip.length; i++) {
      const j = (i + 1) % strip.length;
      if (strip[i] !== strip[j]) continue;
      for (let k = 2; k < strip.length; k++) {
        const m = (i + k) % strip.length;
        const prev = strip[(m - 1 + strip.length) % strip.length];
        const next = strip[(m + 1) % strip.length];
        if (strip[m] !== strip[i] && prev !== strip[i] && next !== strip[i] && strip[(i - 1 + strip.length) % strip.length] !== strip[m]) {
          [strip[j], strip[m]] = [strip[m], strip[j]];
          break;
        }
      }
    }
  }
  return strip;
}

const stripCache = new WeakMap<MachineMath, string[][]>();
export function stripsOf(m: MachineMath): string[][] {
  let s = stripCache.get(m);
  if (!s) {
    s = Array.from({ length: REELS }, (_, r) => buildStrip(Object.fromEntries(Object.entries(m.reelCounts).map(([sym, c]) => [sym, c[r]]))));
    stripCache.set(m, s);
  }
  return s;
}

const mod = (x: number, n: number) => ((x % n) + n) % n;
export const symbolOn = (strip: string[], stop: number, offset = 0) => strip[mod(stop + offset, strip.length)];

/** Visible symbols: grid[reel][row], rows are stop-1, stop, stop+1. */
export function gridOf(m: MachineMath, stops: number[]): string[][] {
  const strips = stripsOf(m);
  return stops.map((stop, r) => [symbolOn(strips[r], stop, -1), symbolOn(strips[r], stop), symbolOn(strips[r], stop, 1)]);
}

// ---------------------------------------------------------------- randomness

/** crypto.getRandomValues as a uint32 source (browser, Deno and Node 19+). */
export function cryptoUint32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/** Uniform integer in [0, n) by rejection sampling (a plain modulo would favour low values). */
export function uniform(n: number, rand: () => number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) {
    const x = rand() >>> 0;
    if (x < limit) return x % n;
  }
}

function weighted(w: Weighted, rand: () => number): number {
  const total = w.weights.reduce((a, b) => a + b, 0);
  let x = uniform(total, rand);
  for (let i = 0; i < w.values.length; i++) {
    if (x < w.weights[i]) return w.values[i];
    x -= w.weights[i];
  }
  return w.values[w.values.length - 1];
}

// ---------------------------------------------------------------- one spin

export interface LineWin {
  line: number;
  symbol: string;
  count: number;
  /** Multiple of the line bet, before multipliers. */
  pays: number;
  /** Wild multiplier applied to this line (1 = none). */
  multiplier: number;
  /** Chips won on this line (after the wild multiplier, before spin multipliers). */
  amount: number;
}

export interface SpinDraw {
  stops: number[];
  /** Wild multiplier drawn for this spin (only when a wild is visible and the machine has them). */
  wildMult?: number;
  /** Win multiplier drawn for this spin (only when it won and the machine has them). */
  winMult?: number;
}

export interface SpinResult {
  stops: number[];
  grid: string[][];
  /** Reels turned fully wild. */
  expanded: number[];
  lines: LineWin[];
  scatters: number;
  scatterWin: number;
  wildMult: number;
  winMult: number;
  /** Free-spin multiplier this spin was played at (1 in the base game). */
  freeMult: number;
  payout: number;
}

export function lineResult(m: MachineMath, syms: string[]): { symbol: string; count: number; pays: number; usesWild: boolean } | null {
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const isWild = (s: string) => s === wild;
  const base = syms.find((s) => !isWild(s)) ?? wild!;
  let count = 0;
  while (count < syms.length && (syms[count] === base || isWild(syms[count])) && m.symbols[syms[count]].kind !== 'scatter') count++;
  let wilds = 0;
  while (wilds < syms.length && isWild(syms[wilds])) wilds++;
  const basePays = m.symbols[base]?.kind === 'regular' && count >= 3 ? m.symbols[base].pays?.[count - 3] ?? 0 : 0;
  const wildPays = wild && wilds >= 3 ? m.symbols[wild].pays?.[wilds - 3] ?? 0 : 0;
  if (!basePays && !wildPays) return null;
  if (wildPays > basePays) return { symbol: wild!, count: wilds, pays: wildPays, usesWild: true };
  return { symbol: base, count, pays: basePays, usesWild: syms.slice(0, count).some(isWild) };
}

/** Evaluates one spin at `lineBet` (total bet / lines). Deterministic from the draw. */
export function evaluateSpin(m: MachineMath, draw: SpinDraw, bet: number, freeMult = 1): SpinResult {
  const lineBet = bet / m.lines.length;
  const grid = gridOf(m, draw.stops);
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const scatter = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'scatter');
  const expanded = (m.features.expandingWild ?? []).filter((r) => wild && grid[r].includes(wild));
  const play = grid.map((col, r) => (expanded.includes(r) ? col.map(() => wild!) : col));
  const wildMult = draw.wildMult ?? 1;
  const lines: LineWin[] = [];
  m.lines.forEach((rows, line) => {
    const res = lineResult(m, rows.map((row, reel) => play[reel][row]));
    if (!res) return;
    const multiplier = res.usesWild ? wildMult : 1;
    lines.push({ line, symbol: res.symbol, count: res.count, pays: res.pays, multiplier, amount: res.pays * lineBet * multiplier });
  });
  const scatters = scatter ? grid.flat().filter((s) => s === scatter).length : 0;
  const sp = m.features.scatterPays;
  const scatterWin = sp && scatters >= 3 ? sp[Math.min(scatters, 5) - 3] * bet : 0;
  const winMult = draw.winMult ?? 1;
  const raw = lines.reduce((s, l) => s + l.amount, 0) + scatterWin;
  const payout = Math.floor(raw * winMult * freeMult);
  return { stops: [...draw.stops], grid, expanded, lines, scatters, scatterWin, wildMult, winMult, freeMult, payout };
}

// ---------------------------------------------------------------- a whole round

export interface RoundDraws {
  base: SpinDraw;
  free: SpinDraw[];
  /** Pick-bonus prizes (× bet), in reveal order. */
  picks: number[];
}

export type WinTier = 'none' | 'tiny' | 'small' | 'big' | 'mega' | 'jackpot';
export type JackpotTier = 'minor' | 'major' | 'grand';

export interface RoundResult {
  /** The random draws this result was computed from (what the server records). */
  draws: RoundDraws;
  base: SpinResult;
  free: SpinResult[];
  freeAwarded: number;
  picks: number[];
  pickWin: number;
  jackpot: JackpotTier | null;
  jackpotWin: number;
  /** Five top symbols on a line anywhere in the round. */
  topLine: boolean;
  /** Before the cap. */
  raw: number;
  payout: number;
  capped: boolean;
  tier: WinTier;
}

const freeCount = (m: MachineMath, scatters: number) => {
  const fs = m.features.freeSpins;
  return fs && scatters >= 3 ? fs.count[Math.min(scatters, 5) - 3] : 0;
};

/**
 * How loudly a result is celebrated. Getting part of the stake back ('tiny') is not a win and is shown
 * quietly.
 */
export function tierFor(payout: number, bet: number, jackpot: boolean): WinTier {
  if (jackpot) return 'jackpot';
  if (payout <= 0) return 'none';
  if (payout <= bet) return 'tiny';
  if (payout < bet * 10) return 'small';
  if (payout < bet * 40) return 'big';
  return 'mega';
}

/** Draws a complete round. The server calls this; nothing else decides a result. */
export function playRound(m: MachineMath, bet: number, rand: () => number = cryptoUint32): RoundResult {
  if (!isValidBetFor(m, bet)) throw new Error('invalid bet');
  const strips = stripsOf(m);
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const drawSpin = (): SpinDraw => {
    const stops = strips.map((s) => uniform(s.length, rand));
    const draw: SpinDraw = { stops };
    const wm = m.features.wildMultiplier;
    if (wm && wild && gridOf(m, stops).some((c) => c.includes(wild))) draw.wildMult = weighted(wm, rand);
    const xm = m.features.winMultiplier;
    if (xm && evaluateSpin(m, draw, bet).payout > 0 && uniform(1000, rand) < xm.chance) draw.winMult = weighted(xm, rand);
    return draw;
  };
  const draws: RoundDraws = { base: drawSpin(), free: [], picks: [] };
  const base = evaluateSpin(m, draws.base, bet);
  let left = freeCount(m, base.scatters);
  const fs = m.features.freeSpins;
  while (fs && left > 0 && draws.free.length < fs.max) {
    const d = drawSpin();
    draws.free.push(d);
    left--;
    if (fs.retrigger) left += freeCount(m, evaluateSpin(m, d, bet).scatters);
  }
  const pb = m.features.pickBonus;
  if (pb && base.scatters >= 3) for (let i = 0; i < pb.picks[Math.min(base.scatters, 5) - 3]; i++) draws.picks.push(weighted(pb, rand));
  return settleRound(m, bet, draws);
}

/**
 * Recomputes a round from its draws and checks they are consistent with the machine (right number of
 * free spins and picks, values the machine can produce). Throws on anything that doesn't add up, so a
 * garbled or forged receipt is never shown.
 */
export function settleRound(m: MachineMath, bet: number, draws: RoundDraws): RoundResult {
  if (!isValidBetFor(m, bet) || !isValidDraws(m, draws)) throw new Error('invalid round');
  const fs = m.features.freeSpins;
  const base = evaluateSpin(m, draws.base, bet);
  checkMultipliers(m, draws.base, base, bet);

  // Free spins: exactly as many as the scatters awarded (with retriggers), capped at max.
  let expected = freeCount(m, base.scatters);
  const free: SpinResult[] = [];
  let mult = fs?.multiplier ?? 1;
  for (let i = 0; i < draws.free.length; i++) {
    if (i >= expected) throw new Error('too many free spins');
    const r = evaluateSpin(m, draws.free[i], bet, mult);
    checkMultipliers(m, draws.free[i], r, bet);
    free.push(r);
    if (fs?.retrigger) expected += freeCount(m, r.scatters);
    mult += fs?.step ?? 0;
  }
  if (draws.free.length !== Math.min(expected, fs?.max ?? 0)) throw new Error('missing free spins');

  const pb = m.features.pickBonus;
  const expectedPicks = pb && base.scatters >= 3 ? pb.picks[Math.min(base.scatters, 5) - 3] : 0;
  if (draws.picks.length !== expectedPicks || draws.picks.some((v) => !pb!.values.includes(v))) throw new Error('bad picks');
  const pickWin = draws.picks.reduce((s, v) => s + v, 0) * bet;

  const jl = m.features.jackpotLadder;
  const jackpot: JackpotTier | null = jl && base.scatters >= 3 ? (['minor', 'major', 'grand'] as const)[Math.min(base.scatters, 5) - 3] : null;
  const jackpotWin = jackpot && jl ? jl.tiers[['minor', 'major', 'grand'].indexOf(jackpot)] * bet : 0;

  const topLine = [base, ...free].some((s) => s.lines.some((l) => l.symbol === m.top && l.count === 5));
  const raw = base.payout + free.reduce((s, f) => s + f.payout, 0) + pickWin + jackpotWin;
  const cap = m.maxWin * bet;
  const payout = Math.min(raw, cap);
  const isJackpot = topLine || jackpot === 'major' || jackpot === 'grand';
  return {
    draws,
    base,
    free,
    freeAwarded: draws.free.length,
    picks: [...draws.picks],
    pickWin,
    jackpot,
    jackpotWin,
    topLine,
    raw,
    payout,
    capped: raw > cap,
    tier: tierFor(payout, bet, isJackpot),
  };
}

function checkMultipliers(m: MachineMath, d: SpinDraw, r: SpinResult, bet: number) {
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const wm = m.features.wildMultiplier;
  const wildVisible = !!wild && r.grid.some((c) => c.includes(wild));
  if (d.wildMult !== undefined && (!wm || !wildVisible || !wm.values.includes(d.wildMult))) throw new Error('bad wild multiplier');
  if (wm && wildVisible && d.wildMult === undefined) throw new Error('missing wild multiplier');
  const xm = m.features.winMultiplier;
  if (d.winMult !== undefined) {
    const plain = evaluateSpin(m, { stops: d.stops, wildMult: d.wildMult }, bet);
    if (!xm || plain.payout <= 0 || !xm.values.includes(d.winMult)) throw new Error('bad win multiplier');
  }
}

// ---------------------------------------------------------------- validation helpers

export const isValidBetFor = (m: MachineMath, bet: unknown): bet is number => typeof bet === 'number' && m.betLevels.includes(bet);

export function isValidStopsFor(m: MachineMath, stops: unknown): stops is number[] {
  const strips = stripsOf(m);
  return Array.isArray(stops) && stops.length === REELS && stops.every((s, r) => Number.isInteger(s) && s >= 0 && s < strips[r].length);
}

function isValidSpinDraw(m: MachineMath, d: unknown): d is SpinDraw {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  const num = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));
  const keys = Object.keys(x).every((k) => k === 'stops' || k === 'wildMult' || k === 'winMult');
  return keys && isValidStopsFor(m, x.stops) && num(x.wildMult) && num(x.winMult);
}

export function isValidDraws(m: MachineMath, d: unknown): d is RoundDraws {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  return (
    isValidSpinDraw(m, x.base) &&
    Array.isArray(x.free) &&
    x.free.length <= 500 &&
    x.free.every((f) => isValidSpinDraw(m, f)) &&
    Array.isArray(x.picks) &&
    x.picks.length <= 10 &&
    x.picks.every((p) => typeof p === 'number' && Number.isFinite(p))
  );
}

export const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRequestId = (x: unknown): x is string => typeof x === 'string' && REQUEST_ID_RE.test(x);

/** Winning cells (reel, row) of a line win, for highlighting. */
export function winCells(m: MachineMath, w: LineWin): [number, number][] {
  return m.lines[w.line].slice(0, w.count).map((row, reel) => [reel, row]);
}

// Seeded PRNG (mulberry32). The state is a single 32-bit integer so it can live
// inside GameState and be serialised, replayed or synchronised.

export interface Rng {
  next(): number;
  state(): number;
}

export function createRng(state: number): Rng {
  let s = state >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return s;
    },
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

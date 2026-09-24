// Seeded randomness for every game engine. The PRNG is the one Carta's engine uses (mulberry32): its whole
// state is one 32-bit integer, so it lives inside the game state and can be serialised, replayed and
// synchronised. Never use Math.random() for anything that decides a game.
import { createRng } from '@/game/engine/rng';
import type { Rng } from '@/game/engine/rng';

export { createRng };
export type { Rng };

/** Fisher–Yates with a seeded PRNG. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** FNV-1a: a stable 32-bit seed from any text (derive per-round / per-player seeds from one match seed). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A fresh match seed. Uses the platform CSPRNG; only ever called when a new match is created. */
export function newMatchSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

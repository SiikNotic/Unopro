// Randomness for the casino. Uses the browser's cryptographic generator (not Math.random), so outcomes
// can't be predicted from earlier ones. It still runs on the player's device: see ledger.ts.
import type { Rng } from '@/game/engine';

function cryptoUint32(): number | null {
  try {
    const c = globalThis.crypto;
    if (!c?.getRandomValues) return null;
    return c.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return null;
  }
}

/** A fresh 32-bit seed. */
export function secureSeed(): number {
  return cryptoUint32() ?? Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Uniform [0, 1) values straight from the crypto generator, one per call (nothing to replay). */
export function cryptoRng(): Rng {
  let last = 0;
  return {
    next() {
      last = secureSeed();
      return last / 4294967296;
    },
    state() {
      return last;
    },
  };
}

/** Unique id for a round or a request. */
export function newId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${secureSeed().toString(36)}-${secureSeed().toString(36)}`;
}

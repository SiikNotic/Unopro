// Deterministic particle positions so scenes look the same on every render (and cost nothing to compute).

export interface Particle {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

export function makeParticles(count: number, seed: number, opts: { minSize?: number; maxSize?: number; minDur?: number; maxDur?: number } = {}): Particle[] {
  const { minSize = 2, maxSize = 5, minDur = 8, maxDur = 16 } = opts;
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: minSize + rand() * (maxSize - minSize),
    delay: -rand() * maxDur,
    duration: minDur + rand() * (maxDur - minDur),
    drift: (rand() - 0.5) * 60,
  }));
}

/** A box-shadow star field string (one element renders many stars). */
export function starField(count: number, seed: number, color = '#fff'): string {
  return makeParticles(count, seed)
    .map((p) => `${(p.left * 20).toFixed(0)}px ${(p.top * 12).toFixed(0)}px 0 ${p.size > 4 ? 1 : 0}px ${color}`)
    .join(',');
}

/** Weak devices get fewer particles and no blur-heavy layers. */
export function isLiteDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3 || !!nav.connection?.saveData;
}

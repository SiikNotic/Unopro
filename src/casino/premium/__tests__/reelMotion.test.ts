import { describe, expect, it } from 'vitest';
import { MOTION, ReelMotion } from '../reelMotion';
import type { MotionProfile } from '../reelMotion';

const REEL = { length: 39 };

/** Runs a reel with a fixed frame time until it rests; returns what happened. */
function run(reel: ReelMotion, from: number, frame = 1 / 60, limit = 20) {
  let t = from;
  const positions: number[] = [];
  let landedAt = -1;
  while (t < from + limit) {
    t += frame;
    if (reel.step(t)) {
      landedAt = t;
      break;
    }
    positions.push(reel.pos);
  }
  return { positions, landedAt };
}

describe('reel motion', () => {
  it('lands exactly on the requested stop, from any start, at any frame rate', () => {
    for (let k = 0; k < 300; k++) {
      const from = Math.floor(Math.random() * REEL.length);
      const to = Math.floor(Math.random() * REEL.length);
      const reel = new ReelMotion(from);
      expect(reel.centre).toBe(from);
      reel.start(0);
      reel.requestStop(to, Math.random() * 2);
      const frame = [1 / 144, 1 / 60, 1 / 30, 0.25][k % 4];
      const { landedAt } = run(reel, 0, frame);
      expect(landedAt).toBeGreaterThan(0);
      expect(reel.phase).toBe('idle');
      expect(reel.centre).toBe(to);
      expect(Number.isInteger(reel.pos)).toBe(true);
    }
  });

  it('winds up, accelerates, brakes with a small overshoot and settles', () => {
    const reel = new ReelMotion(0);
    reel.start(0);
    reel.requestStop(10, 1);
    const { positions } = run(reel, 0);
    expect(Math.max(...positions.slice(0, 5))).toBeGreaterThan(0); // wind-up goes up first
    const end = reel.pos;
    expect(Math.min(...positions)).toBeLessThan(end); // overshoot past the target...
    expect(end - Math.min(...positions)).toBeLessThanOrEqual(MOTION.overshootCells + 1e-9); // ...by a little
    // never jumps more than top speed allows in a frame
    for (let i = 1; i < positions.length; i++) expect(Math.abs(positions[i] - positions[i - 1])).toBeLessThan((MOTION.vmax / 60) * 1.05 + 1e-6);
  });

  it('keeps spinning until a result arrives', () => {
    const reel = new ReelMotion(3);
    reel.start(0);
    run(reel, 0, 1 / 60, 5);
    expect(reel.phase).toBe('cruise');
  });

  it('never changes a symbol that is on screen when the result arrives', () => {
    for (let k = 0; k < 100; k++) {
      const reel = new ReelMotion(k % REEL.length);
      reel.start(0);
      let t = 0;
      for (; t < 1; t += 1 / 60) reel.step(t);
      const visible = () => {
        const base = Math.floor(reel.pos);
        return [-2, -1, 0, 1, 2].map((d) => [base + d, reel.stopAtCell(base + d)]);
      };
      const before = visible();
      reel.requestStop((k * 7) % REEL.length, t);
      reel.step(t + 1e-6);
      const after = new Map(visible().map(([i, s]) => [i, s]));
      for (const [i, s] of before) if (after.has(i)) expect(after.get(i)).toBe(s);
    }
  });

  it('slam stop brakes early; later stops land later (staggered)', () => {
    const a = new ReelMotion(0);
    const b = new ReelMotion(0);
    a.start(0);
    b.start(0);
    a.requestStop(5, 3);
    b.requestStop(5, 3);
    for (let t = 0; t < 1; t += 1 / 60) {
      a.step(t);
      b.step(t);
    }
    a.hurry(1);
    expect(run(a, 1).landedAt).toBeLessThan(run(b, 1).landedAt);
  });

  it('stays precise after thousands of spins', () => {
    const reel = new ReelMotion(0);
    let t = 0;
    for (let k = 0; k < 2000; k++) {
      reel.start(t);
      const to = (k * 13) % REEL.length;
      reel.requestStop(to, t + 0.5);
      t = run(reel, t, 1 / 30).landedAt;
      expect(reel.centre).toBe(to);
    }
    expect(Math.abs(reel.pos)).toBeLessThan(REEL.length * 60);
  });

  it('place() jumps straight to a stop (reduced motion)', () => {
    const reel = new ReelMotion(4);
    reel.start(0);
    reel.step(0.5);
    reel.place(17);
    expect(reel.phase).toBe('idle');
    expect(reel.centre).toBe(17);
  });

  it('rejects an impossible stop', () => {
    const reel = new ReelMotion(0);
    expect(() => reel.requestStop(REEL.length, 0)).toThrow();
    expect(() => reel.requestStop(-1, 0)).toThrow();
    expect(() => reel.requestStop(1.5, 0)).toThrow();
  });
});

describe('motion profiles', () => {
  const profiles: MotionProfile[] = [
    { vmax: 34, windupS: 0.06, windupCells: 0.1, accelS: 0.16, brakeCells: 6, overshootCells: 0.06, bounceS: 0.1 },
    { vmax: 14, windupS: 0.2, windupCells: 0.4, accelS: 0.5, brakeCells: 8, overshootCells: 0.35, bounceS: 0.32 },
  ];
  it.each(profiles)('lands exactly with any profile and strip length (%o)', (p) => {
    for (const n of [24, 31, 55]) {
      for (let k = 0; k < 60; k++) {
        const to = (k * 7) % n;
        const reel = new ReelMotion(k % n, n, p);
        reel.start(0);
        reel.requestStop(to, 0.3 + (k % 5) * 0.2);
        let t = 0;
        while (!reel.step((t += 1 / 60)) && t < 20);
        expect(reel.centre).toBe(to);
      }
      expect(() => new ReelMotion(0, n, p).requestStop(n, 0)).toThrow();
    }
  });
});

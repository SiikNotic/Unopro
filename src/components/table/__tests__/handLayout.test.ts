import { describe, expect, it } from 'vitest';
import { computeHandLayout } from '../handLayout';

describe('Hand layout', () => {
  it('never needs horizontal scrolling (1–30 cards, 280–1440 px)', () => {
    for (const available of [280, 296, 320, 336, 366, 388, 700, 1000, 1400]) {
      for (let n = 1; n <= 30; n++) {
        const l = computeHandLayout(n, available, 110);
        expect(l.width, `${n} cards in ${available}px`).toBeLessThanOrEqual(available + 0.001);
        expect(l.cardWidth).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('keeps full-size cards and generous spacing when there is room', () => {
    const l = computeHandLayout(5, 1200, 110);
    expect(l.cardWidth).toBe(110);
    expect(l.step).toBeCloseTo(77);
  });

  it('overlaps more, then shrinks slightly, as the hand grows on a phone', () => {
    const seven = computeHandLayout(7, 336, 80);
    const twelve = computeHandLayout(12, 336, 80);
    const twenty = computeHandLayout(20, 336, 80);
    expect(seven.cardWidth).toBe(80);
    expect(twelve.step).toBeLessThan(seven.step);
    expect(twenty.cardWidth).toBeLessThan(80);
    // every card keeps a tappable slice
    expect(twenty.step).toBeGreaterThanOrEqual(twenty.cardWidth * 0.3 - 0.001);
  });

  it('fans symmetrically', () => {
    const l = computeHandLayout(9, 360, 76);
    expect(l.angles[0]).toBeCloseTo(-l.angles[8]);
    expect(l.angles[4]).toBe(0);
    expect(l.drops[0]).toBeGreaterThan(l.drops[4]);
  });
});

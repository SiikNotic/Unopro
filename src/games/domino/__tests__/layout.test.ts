import { describe, expect, it } from 'vitest';
import { applyDomino, createDomino, dominoView } from '../engine';
import type { DominoState, PlacedTile, Pip } from '../engine';
import { decideDomino } from '../bots/dominoBot';
import { bounds, layoutLine } from '../ui/layout';

/** Plays a bot round and returns every line it went through. */
function lines(seed: number, n: number): PlacedTile[][] {
  let s: DominoState = createDomino({ seats: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `p${i}`, kind: 'bot' as const })), seed });
  const out: PlacedTile[][] = [];
  while (s.status === 'playing') {
    const r = applyDomino(s, decideDomino(dominoView(s, s.players[s.current].id), 'normal', seed)!);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    out.push(s.line);
  }
  return out;
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-6 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 1e-6;

describe('Domino line layout', () => {
  it('never overlaps two tiles, in real games, at several table widths', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const line of lines(seed, 2 + (seed % 3))) {
        for (const half of [5, 7, 9, 12]) {
          const boxes = layoutLine(line, half);
          expect(boxes).toHaveLength(line.length);
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `seed ${seed} half ${half}`).toBe(false);
        }
      }
    }
  });

  it('keeps each run within the table width (a corner double may stick out by one unit)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const all = lines(seed, 2);
      const b = bounds(layoutLine(all[all.length - 1], 6));
      expect(b.maxX).toBeLessThanOrEqual(7 + 1e-9);
      expect(b.minX).toBeGreaterThanOrEqual(-7 - 1e-9);
    }
  });

  it('shows the matching pips touching along the line', () => {
    const t = (l: number, r: number, seq: number): PlacedTile => ({ tile: { id: `${Math.min(l, r)}-${Math.max(l, r)}`, a: Math.min(l, r) as Pip, b: Math.max(l, r) as Pip }, left: l as Pip, right: r as Pip, by: 'p', seq });
    const line = [t(1, 3, 2), t(3, 5, 0), t(5, 5, 1), t(5, 2, 3)];
    const boxes = layoutLine(line, 20);
    const bySeq = Object.fromEntries(boxes.map((b) => [b.seq, b]));
    expect(bySeq[0]).toMatchObject({ top: 3, bottom: 5, rotate: -90 });
    expect(bySeq[1]).toMatchObject({ top: 5, bottom: 5, rotate: 0, w: 1, h: 2 }); // double across the line
    expect(bySeq[3]).toMatchObject({ top: 5, bottom: 2 });
    expect(bySeq[2]).toMatchObject({ top: 3, bottom: 1, rotate: 90 }); // left arm reads right→left
    expect(bySeq[2].x).toBeLessThan(bySeq[0].x);
  });
});

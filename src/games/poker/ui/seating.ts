// Where each seat sits around the oval, for 2–6 players, you always at the bottom. Pure data: one layout
// for every table size (portrait on phones, landscape on wide screens), in % of the table.
export interface Point {
  x: number;
  y: number;
}

const PORTRAIT: Record<number, Point[]> = {
  2: [{ x: 50, y: 88 }, { x: 50, y: 9 }],
  3: [{ x: 50, y: 88 }, { x: 14, y: 30 }, { x: 86, y: 30 }],
  // Side seats stay clear of the board row (y ≈ 47%).
  4: [{ x: 50, y: 88 }, { x: 11, y: 69 }, { x: 50, y: 9 }, { x: 89, y: 69 }],
  5: [{ x: 50, y: 88 }, { x: 11, y: 69 }, { x: 19, y: 18 }, { x: 81, y: 18 }, { x: 89, y: 69 }],
  6: [{ x: 50, y: 88 }, { x: 11, y: 70 }, { x: 13, y: 25 }, { x: 50, y: 8 }, { x: 87, y: 25 }, { x: 89, y: 70 }],
};
const LANDSCAPE: Record<number, Point[]> = {
  2: [{ x: 50, y: 86 }, { x: 50, y: 12 }],
  3: [{ x: 50, y: 86 }, { x: 17, y: 24 }, { x: 83, y: 24 }],
  4: [{ x: 50, y: 86 }, { x: 8, y: 47 }, { x: 50, y: 12 }, { x: 92, y: 47 }],
  5: [{ x: 50, y: 86 }, { x: 8, y: 58 }, { x: 26, y: 13 }, { x: 74, y: 13 }, { x: 92, y: 58 }],
  6: [{ x: 50, y: 86 }, { x: 8, y: 60 }, { x: 22, y: 14 }, { x: 50, y: 10 }, { x: 78, y: 14 }, { x: 92, y: 60 }],
};

export const CENTER: Point = { x: 50, y: 47 };

export const seatPositions = (count: number, portrait: boolean) => (portrait ? PORTRAIT : LANDSCAPE)[Math.min(6, Math.max(2, count))];

/** A point between a seat and the centre (where its bet or the dealer button sits). */
export const toward = (p: Point, t: number, c: Point = CENTER): Point => ({ x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t });

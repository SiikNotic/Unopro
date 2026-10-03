// The pool table: a 9-foot table in centimetres (playing surface 254 × 127, balls 5.715 cm). Pure data, shared
// by the physics, the rules, the AI, the server and the drawing. The origin is the top-left corner of the
// cloth inside the cushions; x runs along the long side (head on the left, foot on the right), y downwards.

export const TABLE_W = 254;
export const TABLE_H = 127;
export const BALL_R = 2.8575;
export const BALL_D = BALL_R * 2;

/** The head string (the break is played from behind it) and the head / foot spots. */
export const HEAD_X = TABLE_W / 4;
export const HEAD_SPOT = { x: HEAD_X, y: TABLE_H / 2 };
export const FOOT_SPOT = { x: (TABLE_W * 3) / 4, y: TABLE_H / 2 };

/** Distance along the rail from a corner to where its cushion starts, and half the side pocket mouth. */
const CORNER_GAP = 9.5;
const SIDE_GAP = 6.8;

export interface Pocket {
  x: number;
  y: number;
  /** A ball whose centre comes this close is in. */
  r: number;
  /** Where to aim to send a ball in (a little inside the mouth). */
  aimX: number;
  aimY: number;
  side: boolean;
}

/** Six pockets: top-left, top-middle, top-right, bottom-left, bottom-middle, bottom-right. */
export const POCKETS: readonly Pocket[] = [
  { x: -1.2, y: -1.2, r: 7, aimX: 1.6, aimY: 1.6, side: false },
  { x: TABLE_W / 2, y: -3.6, r: 6, aimX: TABLE_W / 2, aimY: -0.5, side: true },
  { x: TABLE_W + 1.2, y: -1.2, r: 7, aimX: TABLE_W - 1.6, aimY: 1.6, side: false },
  { x: -1.2, y: TABLE_H + 1.2, r: 7, aimX: 1.6, aimY: TABLE_H - 1.6, side: false },
  { x: TABLE_W / 2, y: TABLE_H + 3.6, r: 6, aimX: TABLE_W / 2, aimY: TABLE_H + 0.5, side: true },
  { x: TABLE_W + 1.2, y: TABLE_H + 1.2, r: 7, aimX: TABLE_W - 1.6, aimY: TABLE_H - 1.6, side: false },
];

/** A cushion edge (the line the ball's surface touches); balls bounce off it and off its end points (the jaws). */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const W = TABLE_W;
const H = TABLE_H;
const C = CORNER_GAP;
const S = SIDE_GAP;
/** How far the jaws reach into the pocket. */
const J = 3.2;

export const CUSHIONS: readonly Segment[] = [
  // Top rail: two cushions with the side pocket between them, plus their jaws.
  { ax: C, ay: 0, bx: W / 2 - S, by: 0 },
  { ax: W / 2 + S, ay: 0, bx: W - C, by: 0 },
  // Bottom rail.
  { ax: C, ay: H, bx: W / 2 - S, by: H },
  { ax: W / 2 + S, ay: H, bx: W - C, by: H },
  // Head and foot rails.
  { ax: 0, ay: C, bx: 0, by: H - C },
  { ax: W, ay: C, bx: W, by: H - C },
  // Corner jaws (angled into the pocket).
  { ax: C, ay: 0, bx: C - J, by: -J },
  { ax: 0, ay: C, bx: -J, by: C - J },
  { ax: W - C, ay: 0, bx: W - C + J, by: -J },
  { ax: W, ay: C, bx: W + J, by: C - J },
  { ax: C, ay: H, bx: C - J, by: H + J },
  { ax: 0, ay: H - C, bx: -J, by: H - C + J },
  { ax: W - C, ay: H, bx: W - C + J, by: H + J },
  { ax: W, ay: H - C, bx: W + J, by: H - C + J },
  // Side jaws (slightly narrowing).
  { ax: W / 2 - S, ay: 0, bx: W / 2 - S + 1.2, by: -J },
  { ax: W / 2 + S, ay: 0, bx: W / 2 + S - 1.2, by: -J },
  { ax: W / 2 - S, ay: H, bx: W / 2 - S + 1.2, by: H + J },
  { ax: W / 2 + S, ay: H, bx: W / 2 + S - 1.2, by: H + J },
];

/** Ball numbers: 0 is the cue ball, 1–7 solids, 8 the eight ball, 9–15 stripes. */
export type Group = 'solids' | 'stripes';
export const isSolid = (n: number) => n >= 1 && n <= 7;
export const isStripe = (n: number) => n >= 9 && n <= 15;
export const groupOf = (n: number): Group | null => (isSolid(n) ? 'solids' : isStripe(n) ? 'stripes' : null);
export const inGroup = (n: number, g: Group) => (g === 'solids' ? isSolid(n) : isStripe(n));

/** The fifteen rack positions, apex on the foot spot, pointing at the head. Index 4 is the centre (the 8). */
export function rackPositions(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  // Rows a hair apart so no two balls start touching (the break spreads them the same either way).
  const dx = BALL_D * 0.8660254037844386 + 0.02;
  const dy = BALL_D + 0.02;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) out.push({ x: FOOT_SPOT.x + row * dx, y: FOOT_SPOT.y + (k - row / 2) * dy });
  }
  return out;
}

/** Is (x, y) a legal place for the cue ball (on the cloth; behind the head string if `kitchen`)? Overlaps are checked separately. */
export function onCloth(x: number, y: number, kitchen: boolean): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < BALL_R || x > TABLE_W - BALL_R || y < BALL_R || y > TABLE_H - BALL_R) return false;
  return !kitchen || x <= HEAD_X;
}

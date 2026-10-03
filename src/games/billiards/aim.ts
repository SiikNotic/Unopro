// The aiming guide: where the cue ball goes along the aim line, which ball it meets first (or which cushion),
// and the directions both balls take after a contact (the object ball along the line of centres, the cue ball
// along the tangent). Pure geometry, the same idea a player uses; the real result comes from the physics.
import { BALL_D, BALL_R, POCKETS, TABLE_H, TABLE_W } from './table';
import type { BallState } from './physics';

export interface AimGuide {
  /** Where the cue ball's centre is when it first touches something. */
  end: { x: number; y: number };
  /** The ball it meets (null: a cushion first). */
  hit: number | null;
  /** Object ball direction after contact (unit vector), with the cut quality (1 = full ball). */
  object: { dx: number; dy: number; fullness: number } | null;
  /** Cue ball direction after contact or after the cushion (unit vector). */
  after: { dx: number; dy: number } | null;
  /** The pocket the object ball is heading for, if it is heading for one. */
  pocket: number | null;
}

/** First intersection t ≥ 0 of the ray p + t·d with a circle (c, r); null if none. */
function rayCircle(px: number, py: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
  const fx = px - cx;
  const fy = py - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

export function aimGuide(balls: readonly BallState[], cue: { x: number; y: number }, dx: number, dy: number): AimGuide {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let best = Infinity;
  let hit: number | null = null;
  for (const b of balls) {
    if (b.down || b.id === 0) continue;
    const t = rayCircle(cue.x, cue.y, ux, uy, b.x, b.y, BALL_D);
    if (t !== null && t < best) {
      best = t;
      hit = b.id;
    }
  }
  // The cushion box the cue ball's centre can reach.
  const lo = BALL_R;
  const hiX = TABLE_W - BALL_R;
  const hiY = TABLE_H - BALL_R;
  const tx = ux > 0 ? (hiX - cue.x) / ux : ux < 0 ? (lo - cue.x) / ux : Infinity;
  const ty = uy > 0 ? (hiY - cue.y) / uy : uy < 0 ? (lo - cue.y) / uy : Infinity;
  const tc = Math.max(0, Math.min(tx, ty));
  if (hit === null || tc < best) {
    const end = { x: cue.x + ux * tc, y: cue.y + uy * tc };
    // Mirror on the cushion it meets.
    const after = tx < ty ? { dx: -ux, dy: uy } : { dx: ux, dy: -uy };
    return { end, hit: null, object: null, after, pocket: null };
  }
  const end = { x: cue.x + ux * best, y: cue.y + uy * best };
  const ob = balls.find((b) => b.id === hit)!;
  const nx = (ob.x - end.x) / BALL_D;
  const ny = (ob.y - end.y) / BALL_D;
  const fullness = Math.max(0, ux * nx + uy * ny);
  // Cue ball goes off along the tangent (the side the aim line was on).
  const side = ux * -ny + uy * nx;
  let ax = side >= 0 ? -ny : ny;
  let ay = side >= 0 ? nx : -nx;
  if (fullness > 0.995) {
    ax = 0;
    ay = 0;
  }
  return { end, hit, object: { dx: nx, dy: ny, fullness }, after: { dx: ax, dy: ay }, pocket: headingPocket(ob.x, ob.y, nx, ny) };
}

/** The pocket a ball rolling from (x, y) along (dx, dy) would reach, if it is within the mouth. */
export function headingPocket(x: number, y: number, dx: number, dy: number): number | null {
  let best: number | null = null;
  let bestT = Infinity;
  for (let p = 0; p < POCKETS.length; p++) {
    const pk = POCKETS[p];
    const vx = pk.aimX - x;
    const vy = pk.aimY - y;
    const t = vx * dx + vy * dy;
    if (t <= 0) continue;
    const off = Math.abs(vx * dy - vy * dx);
    if (off < (pk.side ? 4.2 : 5.2) && t < bestT) {
      bestT = t;
      best = p;
    }
  }
  return best;
}

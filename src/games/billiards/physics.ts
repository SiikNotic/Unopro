// The physics of a shot. Deterministic: a fixed time step, the balls processed in a fixed order, and only
// + − × ÷ and √ inside the loop (no trigonometry), so the same start and the same shot give exactly the same
// result on the server and in every browser. The rules read the result (what was hit first, what went in,
// what touched a cushion); the screen steps the same simulation to animate it.
//
// Model: balls slide with rolling resistance (a constant deceleration plus a little drag), collide
// elastically with each other (equal masses), bounce off the cushions and their jaws with some energy
// lost, and drop when their centre reaches a pocket. The cue ball carries follow/draw (applied when it first
// strikes another ball) and side spin (applied at the cushions), both wearing off as it travels.
import { BALL_D, BALL_R, CUSHIONS, POCKETS, TABLE_H, TABLE_W } from './table';

export interface BallState {
  /** 0 = cue ball, 1–15 object balls. */
  id: number;
  x: number;
  y: number;
  /** Pocketed (off the table). */
  down: boolean;
}

/** A shot as the physics takes it: already validated and quantised by the rules. */
export interface ShotInput {
  /** Direction (unit vector). */
  dx: number;
  dy: number;
  /** 0–1. */
  power: number;
  /** Side spin, −1 (left) … 1 (right). */
  spinX: number;
  /** Follow (+1) … draw (−1). */
  spinY: number;
}

export type PhysicsEvent =
  | { type: 'cue'; speed: number }
  | { type: 'ball'; a: number; b: number; speed: number }
  | { type: 'cushion'; ball: number; speed: number }
  | { type: 'pocket'; ball: number; pocket: number };

export interface ShotResult {
  balls: BallState[];
  /** First ball the cue ball touched (null: none). */
  firstContact: number | null;
  /** Balls pocketed, in order, with their pocket. */
  potted: { ball: number; pocket: number }[];
  /** Did any ball touch a cushion after the first contact? */
  railAfterContact: boolean;
  /** Distinct object balls that touched a cushion (the break rule). */
  objectRails: number;
  steps: number;
}

/** Time step (s): at full power a ball moves 1.8 cm per step, well under its radius. */
export const DT = 1 / 500;
export const MIN_SPEED = 60;
export const MAX_SPEED = 900;
const ROLL_DECEL = 55;
const DRAG = 0.25;
const STOP = 1.5;
const BALL_E = 0.95;
const CUSHION_E = 0.76;
const CUSHION_GRIP = 0.96;
const MAX_STEPS = 500 * 40;

export const speedFor = (power: number) => MIN_SPEED + Math.min(1, Math.max(0, power)) * (MAX_SPEED - MIN_SPEED);

interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  down: boolean;
  moving: boolean;
}

/** A shot in progress. `step()` advances one time step; `done` once every ball has stopped. */
export class Simulation {
  readonly bodies: Body[];
  firstContact: number | null = null;
  potted: { ball: number; pocket: number }[] = [];
  railAfterContact = false;
  private rails = new Set<number>();
  private follow: number;
  private side: number;
  private shotDx: number;
  private shotDy: number;
  steps = 0;
  done = false;

  constructor(balls: readonly BallState[], shot: ShotInput, private onEvent?: (e: PhysicsEvent) => void) {
    this.bodies = balls.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, down: b.down, moving: false }));
    // Keep a fixed processing order whatever order the caller used.
    this.bodies.sort((a, b) => a.id - b.id);
    const speed = speedFor(shot.power);
    const cue = this.bodies.find((b) => b.id === 0 && !b.down);
    this.follow = clamp(shot.spinY, -1, 1);
    this.side = clamp(shot.spinX, -1, 1);
    this.shotDx = shot.dx;
    this.shotDy = shot.dy;
    if (cue) {
      cue.vx = shot.dx * speed;
      cue.vy = shot.dy * speed;
      cue.moving = true;
      onEvent?.({ type: 'cue', speed });
    } else this.done = true;
  }

  step(): void {
    if (this.done) return;
    this.steps++;
    const bodies = this.bodies;
    // Spin wears off as the cue ball travels.
    this.follow *= 1 - 0.9 * DT;
    this.side *= 1 - 0.6 * DT;

    // Move and slow down.
    for (const b of bodies) {
      if (b.down || !b.moving) continue;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const next = sp - (ROLL_DECEL + DRAG * sp) * DT;
      if (next <= STOP) {
        b.vx = 0;
        b.vy = 0;
        b.moving = false;
      } else {
        const k = next / sp;
        b.vx *= k;
        b.vy *= k;
      }
    }

    // Ball against ball (fixed pair order). Two resting balls can't collide.
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.down) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.down || (!a.moving && !b.moving)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= BALL_D * BALL_D) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-9 ? dx / d : 1;
        const ny = d > 1e-9 ? dy / d : 0;
        // Separate them.
        const push = (BALL_D - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const cueA = a.id === 0 ? a : b.id === 0 ? b : null;
        const first = cueA && this.firstContact === null;
        const preX = cueA ? cueA.vx : 0;
        const preY = cueA ? cueA.vy : 0;
        const imp = ((1 + BALL_E) / 2) * rel;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        b.vx += imp * nx;
        b.vy += imp * ny;
        a.moving = true;
        b.moving = true;
        this.onEvent?.({ type: 'ball', a: a.id, b: b.id, speed: rel });
        if (first && cueA) {
          this.firstContact = cueA === a ? b.id : a.id;
          // Follow / draw: the cue ball keeps going forward or comes back along its line of travel.
          if (this.follow !== 0) {
            const pre = Math.sqrt(preX * preX + preY * preY);
            if (pre > 0) {
              const kf = this.follow * 0.62;
              cueA.vx += (preX / pre) * pre * kf;
              cueA.vy += (preY / pre) * pre * kf;
            }
            this.follow = 0;
          }
        }
      }
    }

    // Cushions and jaws.
    for (const b of bodies) {
      if (b.down) continue;
      if (!b.moving) continue;
      for (let s = 0; s < CUSHIONS.length; s++) {
        const seg = CUSHIONS[s];
        const ex = seg.bx - seg.ax;
        const ey = seg.by - seg.ay;
        const len2 = ex * ex + ey * ey;
        let t = ((b.x - seg.ax) * ex + (b.y - seg.ay) * ey) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = seg.ax + ex * t;
        const qy = seg.ay + ey * t;
        const ox = b.x - qx;
        const oy = b.y - qy;
        const d2 = ox * ox + oy * oy;
        if (d2 >= BALL_R * BALL_R) continue;
        const d = Math.sqrt(d2);
        // The normal points from the cushion towards the ball (inwards for the rails).
        let nx: number;
        let ny: number;
        if (d > 1e-9) {
          nx = ox / d;
          ny = oy / d;
        } else {
          nx = -ey / Math.sqrt(len2);
          ny = ex / Math.sqrt(len2);
        }
        b.x = qx + nx * BALL_R;
        b.y = qy + ny * BALL_R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) continue;
        // Normal part bounces back (losing energy), the tangential part keeps most of its speed.
        let tx = b.vx - vn * nx;
        let ty = b.vy - vn * ny;
        tx *= CUSHION_GRIP;
        ty *= CUSHION_GRIP;
        let vx = tx - vn * CUSHION_E * nx;
        let vy = ty - vn * CUSHION_E * ny;
        if (b.id === 0 && this.side !== 0) {
          // Side spin throws the cue ball along the cushion: right english to the right of its line of travel.
          const rx = -this.shotDy;
          const ry = this.shotDx;
          const along = rx * -ny + ry * nx;
          const sign = along >= 0 ? 1 : -1;
          const kick = this.side * -vn * 0.32 * sign;
          vx += -ny * kick;
          vy += nx * kick;
          this.side *= 0.5;
        }
        b.vx = vx;
        b.vy = vy;
        this.onEvent?.({ type: 'cushion', ball: b.id, speed: -vn });
        if (this.firstContact !== null) this.railAfterContact = true;
        if (b.id !== 0) this.rails.add(b.id);
      }
    }

    // Pockets (and, as a safety net, anything that left the table).
    for (const b of bodies) {
      if (b.down) continue;
      let pocket = -1;
      for (let p = 0; p < POCKETS.length; p++) {
        const pk = POCKETS[p];
        const dx = b.x - pk.x;
        const dy = b.y - pk.y;
        if (dx * dx + dy * dy < pk.r * pk.r) {
          pocket = p;
          break;
        }
      }
      if (pocket < 0 && (b.x < -10 || b.x > TABLE_W + 10 || b.y < -10 || b.y > TABLE_H + 10)) pocket = nearestPocket(b.x, b.y);
      if (pocket < 0) continue;
      b.down = true;
      b.moving = false;
      b.vx = 0;
      b.vy = 0;
      this.potted.push({ ball: b.id, pocket });
      this.onEvent?.({ type: 'pocket', ball: b.id, pocket });
    }

    if (!bodies.some((b) => b.moving) || this.steps >= MAX_STEPS) {
      for (const b of bodies) {
        b.vx = 0;
        b.vy = 0;
        b.moving = false;
      }
      this.done = true;
    }
  }

  /** Runs to the end. */
  finish(): ShotResult {
    while (!this.done) this.step();
    return this.result();
  }

  result(): ShotResult {
    return {
      balls: this.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, down: b.down })),
      firstContact: this.firstContact,
      potted: this.potted.slice(),
      railAfterContact: this.railAfterContact,
      objectRails: this.rails.size,
      steps: this.steps,
    };
  }

  /** Where the balls are right now (for drawing). */
  snapshot(): BallState[] {
    return this.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, down: b.down }));
  }
}

export function simulate(balls: readonly BallState[], shot: ShotInput, onEvent?: (e: PhysicsEvent) => void): ShotResult {
  return new Simulation(balls, shot, onEvent).finish();
}

function nearestPocket(x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  for (let p = 0; p < POCKETS.length; p++) {
    const dx = x - POCKETS[p].x;
    const dy = y - POCKETS[p].y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : 0;
}

/**
 * How far a ball starting at `speed` rolls before stopping (cm), with the same friction as the simulation.
 * Used by the aiming guide and the AI to judge power. Closed form of dv/dt = −(a + k·v).
 */
export function rollDistance(speed: number): number {
  if (speed <= STOP) return 0;
  return speed / DRAG - (ROLL_DECEL / (DRAG * DRAG)) * Math.log(1 + (DRAG * speed) / ROLL_DECEL);
}

/** The speed a ball needs to roll `dist` cm (inverse of rollDistance, by bisection). */
export function speedToRoll(dist: number): number {
  let lo = 0;
  let hi = MAX_SPEED * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistance(mid) < dist) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Speed left after rolling `dist` from `speed` (0 if it stops first). */
export function speedAfter(speed: number, dist: number): number {
  const total = rollDistance(speed);
  if (dist >= total) return 0;
  // Find v with rollDistance(v) = total − dist.
  return speedToRoll(total - dist);
}

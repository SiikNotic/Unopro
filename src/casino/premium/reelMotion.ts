// Physical motion of one reel, in "cells" (one symbol height) and seconds. Pure: the screen feeds it the
// clock and draws whatever it says, so the same code is unit-tested and animated.
//
// The reel only shows 5 recycled cells. Cell index i shows reel stop `i + offset`. When a result arrives,
// indices at and below the landing cell switch to the result's offset; those cells are still off-screen
// (above the window), so the switch is never seen, and the reel lands exactly on the decided stop.
export type ReelPhase = 'idle' | 'windup' | 'accel' | 'cruise' | 'decel' | 'bounce';

/** How a machine's reels move. Each machine has its own (see presentation.ts). */
export interface MotionProfile {
  vmax: number;
  windupS: number;
  windupCells: number;
  accelS: number;
  brakeCells: number;
  overshootCells: number;
  bounceS: number;
}

export const MOTION: MotionProfile = {
  /** Top speed, cells per second. */
  vmax: 22,
  windupS: 0.1,
  windupCells: 0.22,
  accelS: 0.3,
  /** Distance covered while braking; > 5 keeps the offset switch off-screen. */
  brakeCells: 6,
  overshootCells: 0.2,
  bounceS: 0.18,
};

const mod = (x: number, n: number) => ((x % n) + n) % n;
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeInOutSine = (p: number) => -(Math.cos(Math.PI * p) - 1) / 2;

export class ReelMotion {
  phase: ReelPhase = 'idle';
  private readonly n: number;
  private readonly mp: MotionProfile;
  /** Position in cells; decreasing = symbols travel down. */
  pos = 0;
  private offset: number;
  private nextOffset: number;
  /** Cells with index <= seam use nextOffset. */
  private seam = -Infinity;
  private t0 = 0;
  private p0 = 0;
  private startAt = 0;
  private stopAt = Infinity;
  private target = 0;
  private brake: number;
  private decelS = 0;
  private stop: number | null = null;

  /** `n` = stops on this reel's strip. */
  constructor(stop: number, n = 39, profile: MotionProfile = MOTION) {
    this.n = n;
    this.mp = { ...profile, brakeCells: Math.max(5.5, profile.brakeCells) };
    this.brake = this.mp.brakeCells;
    this.offset = stop;
    this.nextOffset = stop;
  }

  /** Reel stop shown by cell index i. */
  stopAtCell(i: number): number {
    return mod(i + (i <= this.seam ? this.nextOffset : this.offset), this.n);
  }

  /** Stop currently centred (only meaningful when idle). */
  get centre(): number {
    return this.stopAtCell(Math.round(this.pos));
  }

  get moving(): boolean {
    return this.phase !== 'idle';
  }

  /** Begins spinning at time `at` (seconds). No-op while already moving. */
  start(at: number): void {
    if (this.moving) return;
    this.normalise();
    this.phase = 'windup';
    this.startAt = at;
    this.t0 = at;
    this.p0 = this.pos;
    this.stop = null;
    this.stopAt = Infinity;
  }

  /**
   * Asks the reel to land on `stop`, braking no earlier than `at`. `brakeCells` longer = a slower,
   * more dramatic stop (anticipation). Calling it again before braking starts replaces the request.
   */
  requestStop(stop: number, at: number, brakeCells = this.mp.brakeCells): void {
    if (!Number.isInteger(stop) || stop < 0 || stop >= this.n) throw new Error('bad stop');
    if (this.phase === 'decel' || this.phase === 'bounce') return;
    this.stop = stop;
    this.stopAt = at;
    this.brake = Math.max(this.mp.brakeCells, brakeCells);
  }

  /** Slam stop: brake as soon as possible (the result is already known). */
  hurry(now: number): void {
    if (this.stop !== null && this.phase !== 'decel' && this.phase !== 'bounce') {
      this.stopAt = Math.min(this.stopAt, now);
      this.brake = this.mp.brakeCells;
    }
  }

  /** Puts the reel on `stop` at once (reduced motion, restoring a screen). */
  place(stop: number): void {
    this.phase = 'idle';
    this.normalise();
    const cell = Math.round(this.pos);
    this.pos = cell;
    this.offset = stop - cell;
    this.nextOffset = this.offset;
    this.seam = -Infinity;
    this.stop = null;
  }

  /** Advances to time `now` (seconds). Returns true on the frame the reel comes to rest. */
  step(now: number): boolean {
    const { vmax, windupS, windupCells, accelS, overshootCells, bounceS } = this.mp;
    if (this.phase === 'idle') return false;
    if (this.phase === 'windup') {
      const p = Math.min(1, (now - this.t0) / windupS);
      this.pos = this.p0 + windupCells * Math.sin(Math.PI * p);
      if (p < 1) return false;
      this.phase = 'accel';
      this.t0 = this.t0 + windupS;
      this.p0 = this.pos;
    }
    if (this.phase === 'accel') {
      const dt = Math.min(accelS, now - this.t0);
      this.pos = this.p0 - (vmax * dt * dt) / (2 * accelS);
      if (dt < accelS) return false;
      this.phase = 'cruise';
      this.t0 = this.t0 + accelS;
      this.p0 = this.pos;
    }
    if (this.phase === 'cruise') {
      const brakeFrom = Math.max(this.t0, this.stopAt);
      if (this.stop === null || now < brakeFrom) {
        this.pos = this.p0 - vmax * (now - this.t0);
        return false;
      }
      // Brake from the position the reel had at brakeFrom (exact even after a long frame).
      const from = this.p0 - vmax * (brakeFrom - this.t0);
      const target = Math.floor(from - this.brake);
      this.target = target;
      this.seam = target + 2;
      this.nextOffset = this.stop - target;
      const dist = from - (target - overshootCells);
      this.decelS = (3 * dist) / vmax;
      this.phase = 'decel';
      this.t0 = brakeFrom;
      this.p0 = from;
    }
    if (this.phase === 'decel') {
      const p = Math.min(1, (now - this.t0) / this.decelS);
      this.pos = this.p0 - (this.p0 - (this.target - overshootCells)) * easeOutCubic(p);
      if (p < 1) return false;
      this.phase = 'bounce';
      this.t0 = this.t0 + this.decelS;
    }
    if (this.phase === 'bounce') {
      const p = Math.min(1, (now - this.t0) / bounceS);
      this.pos = this.target - overshootCells + overshootCells * easeInOutSine(p);
      if (p < 1) return false;
      this.pos = this.target;
      this.phase = 'idle';
      this.stop = null;
      return true;
    }
    return false;
  }

  /** Keeps positions small after many spins (float precision), without changing what is shown. */
  private normalise(): void {
    const shift = Math.round(this.pos / this.n) * this.n;
    if (shift === 0) return;
    const i = Math.round(this.pos);
    const shown = this.stopAtCell(i);
    this.pos -= shift;
    this.offset = shown - Math.round(this.pos);
    this.nextOffset = this.offset;
    this.seam = -Infinity;
  }
}

// AIR HOCKEY: the player's input log and the replay that decides a match played for coins.
//
// The browser records where the player's mallet was asked to go on every tick (whole table units, the same
// numbers its own simulation used) and sends the log when the match ends. The server replays the match from
// its own seed with that log (engine.ts is deterministic) and takes the result from the replay, never from
// the browser. A log that doesn't end exactly when the match ends, or can't be read, isn't a match.
//
// Format: "a1:" + base64 of varints. The first input is absolute; then records of
// (zigzag dx, zigzag dy, repeat - 1): the same move repeated `repeat` ticks (a still mallet is one record).
import { createMatch, MAX_TICKS, step } from './engine';
import type { Input, MatchState } from './engine';
import type { AiLevel } from './ai';

const PREFIX = 'a1:';
/** The largest log accepted (a full 8-minute match of constant movement fits well inside). */
export const MAX_LOG_CHARS = 200000;

const zig = (n: number) => (n << 1) ^ (n >> 31);
const unzig = (n: number) => (n >>> 1) ^ -(n & 1);

export class InputLog {
  private bytes: number[] = [];
  private last: Input | null = null;
  private dx = 0;
  private dy = 0;
  private run = 0;
  ticks = 0;

  private varint(n: number) {
    let v = n >>> 0;
    while (v >= 0x80) {
      this.bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.bytes.push(v);
  }

  private flush() {
    if (this.run === 0) return;
    this.varint(zig(this.dx));
    this.varint(zig(this.dy));
    this.varint(this.run - 1);
    this.run = 0;
  }

  /** Adds one tick's input (already clamped to whole units). */
  push(i: Input) {
    this.ticks++;
    if (!this.last) {
      this.varint(i.x);
      this.varint(i.y);
      this.last = i;
      return;
    }
    const dx = i.x - this.last.x;
    const dy = i.y - this.last.y;
    this.last = i;
    if (this.run > 0 && dx === this.dx && dy === this.dy) {
      this.run++;
      return;
    }
    this.flush();
    this.dx = dx;
    this.dy = dy;
    this.run = 1;
  }

  encode(): string {
    this.flush();
    let bin = '';
    for (const b of this.bytes) bin += String.fromCharCode(b);
    return PREFIX + btoa(bin);
  }
}

/** Reads a log back into one input per tick, or null if it isn't a valid log. */
export function decodeLog(log: unknown, maxTicks = MAX_TICKS): Input[] | null {
  if (typeof log !== 'string' || !log.startsWith(PREFIX) || log.length > MAX_LOG_CHARS) return null;
  let bin: string;
  try {
    bin = atob(log.slice(PREFIX.length));
  } catch {
    return null;
  }
  let at = 0;
  const read = (): number | null => {
    let v = 0;
    let shift = 0;
    for (;;) {
      if (at >= bin.length || shift > 28) return null;
      const b = bin.charCodeAt(at++);
      v |= (b & 0x7f) << shift;
      if (b < 0x80) return v >>> 0;
      shift += 7;
    }
  };
  const x0 = read();
  const y0 = read();
  if (x0 === null || y0 === null) return null;
  const out: Input[] = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  while (at < bin.length) {
    const a = read();
    const b = read();
    const r = read();
    if (a === null || b === null || r === null) return null;
    const dx = unzig(a);
    const dy = unzig(b);
    if (out.length + r + 1 > maxTicks) return null;
    for (let k = 0; k <= r; k++) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x > 5000 || y > 5000) return null;
      out.push({ x, y });
    }
  }
  return out;
}

export interface Replay {
  state: MatchState;
  ticks: number;
}

/**
 * Plays a whole match from the seed and the log. Null unless the log ends on exactly the tick the match
 * ends (a log cut short or padded with extra ticks is refused).
 */
export function replayMatch(seed: number, level: AiLevel, log: unknown): Replay | null {
  const inputs = decodeLog(log);
  if (!inputs) return null;
  const s = createMatch(seed, level);
  for (let i = 0; i < inputs.length; i++) {
    if (s.phase === 'over') return null;
    step(s, inputs[i]);
  }
  return s.phase === 'over' ? { state: s, ticks: inputs.length } : null;
}

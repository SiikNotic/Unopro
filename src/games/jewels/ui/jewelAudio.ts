// Jewellery: Olympus sounds, synthesised on the app's shared audio bus (no files to load, nothing to release: each
// note is a short-lived oscillator). Sound on/off and volume are the app's preferences (sfx.ts).
// A small voice limiter keeps cascades from stacking dozens of sounds at once.
import { withAudio } from '@/audio/sfx';
import { bell, noise, note, pluck, tone } from '@/audio/voices';
import type { Voice } from '@/audio/voices';

export type JewelSound = 'select' | 'swap' | 'invalid' | 'match' | 'special' | 'blast' | 'cascade' | 'win' | 'lose' | 'star' | 'click' | 'stone' | 'lightning' | 'divine' | 'hammer' | 'shuffle';

const MIN_GAP_MS: Partial<Record<JewelSound, number>> = { match: 70, blast: 90, cascade: 90, lightning: 110, stone: 90, divine: 150 };
const WINDOW_MS = 300;
const MAX_IN_WINDOW = 6;
const last = new Map<JewelSound, number>();
let recent: number[] = [];

const SOUNDS: Record<JewelSound, (v: Voice, t: number, level: number) => void> = {
  select: (v, t) => tone(v, t, 1760, 0.05, { gain: 0.03, type: 'sine' }),
  swap: (v, t) => {
    noise(v, t, 0.07, { type: 'bandpass', freq: 2600, to: 1400, gain: 0.05, q: 2 });
    tone(v, t, 880, 0.06, { gain: 0.025, to: 1320 });
  },
  invalid: (v, t) => tone(v, t, 300, 0.14, { gain: 0.05, type: 'triangle', to: 220 }),
  // Pitch rises with the cascade: each chain sounds higher.
  match: (v, t, level) => {
    const base = [0, 2, 4, 7, 9, 12, 14][Math.min(6, level - 1)];
    bell(v, t, note(base + 15), 0.05, 0.7);
    bell(v, t + 0.05, note(base + 22), 0.03, 0.6);
  },
  special: (v, t) => {
    [0, 7, 12, 19].forEach((n, i) => bell(v, t + i * 0.04, note(n + 20), 0.035, 0.8));
  },
  blast: (v, t) => {
    noise(v, t, 0.28, { type: 'lowpass', freq: 1800, to: 300, gain: 0.12 });
    tone(v, t, 140, 0.22, { gain: 0.12, to: 60, type: 'sine' });
    bell(v, t + 0.02, note(27), 0.03, 0.5);
  },
  cascade: (v, t, level) => tone(v, t, note(10 + level * 2), 0.12, { gain: 0.03, type: 'triangle', to: note(14 + level * 2) }),
  star: (v, t, level) => bell(v, t, note(19 + level * 4), 0.06, 1),
  click: (v, t) => tone(v, t, 1320, 0.035, { gain: 0.025, type: 'triangle' }),
  // A marble seal cracking: a dry knock and grit.
  stone: (v, t) => {
    tone(v, t, 220, 0.09, { gain: 0.08, type: 'triangle', to: 120 });
    noise(v, t, 0.12, { type: 'bandpass', freq: 1800, to: 700, gain: 0.07, q: 1.5 });
  },
  // Lightning: a bright crack and a falling electric sweep.
  lightning: (v, t) => {
    noise(v, t, 0.2, { type: 'highpass', freq: 2500, to: 5200, gain: 0.08 });
    tone(v, t, 1900, 0.22, { gain: 0.03, type: 'sawtooth', to: 240, lowpass: 3800 });
    tone(v, t + 0.02, 70, 0.3, { gain: 0.08, to: 45, type: 'sine' });
  },
  // Divine light: a rising golden chord.
  divine: (v, t) => {
    [0, 4, 7, 12, 16].forEach((n, i) => bell(v, t + i * 0.05, note(n + 17), 0.035, 1.3));
    tone(v, t, note(5), 1.1, { gain: 0.03, type: 'sine', attack: 0.2 });
  },
  hammer: (v, t) => {
    tone(v, t, 160, 0.16, { gain: 0.12, type: 'triangle', to: 70 });
    noise(v, t, 0.08, { type: 'bandpass', freq: 900, gain: 0.06 });
    bell(v, t + 0.04, note(22), 0.02, 0.4);
  },
  shuffle: (v, t) => [0, 3, 7, 10, 14, 17].forEach((n, i) => pluck(v, t + i * 0.045, note(n + 12), 0.02, 0.5)),
  win: (v, t) => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => bell(v, t + i * 0.08, note(n + 12), 0.05, 1.1)),
  lose: (v, t) => [7, 3, 0, -5].forEach((n, i) => tone(v, t + i * 0.16, note(n), 0.3, { gain: 0.05, type: 'triangle', lowpass: 1600 })),
};

/** Plays a sound unless it's being spammed (per-sound gap + a cap on sounds in a short window). */
export function playJewel(name: JewelSound, level = 1): void {
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < (MIN_GAP_MS[name] ?? 30)) return;
  recent = recent.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_IN_WINDOW && name !== 'win' && name !== 'lose') return;
  last.set(name, now);
  recent.push(now);
  withAudio((c, bus, noiseBuf, t) => SOUNDS[name]({ c, bus, noise: noiseBuf }, t, level));
}

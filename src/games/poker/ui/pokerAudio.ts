// Poker sounds, synthesised on the app's audio bus (no files). Sound on/off and volume are the app's
// preferences; a limiter keeps a busy moment (chips, deals) from stacking too many sounds at once.
import { withAudio } from '@/audio/sfx';
import { bell, noise, note, tone } from '@/audio/voices';
import type { Voice } from '@/audio/voices';

export type PokerSound = 'deal' | 'flip' | 'chips' | 'check' | 'call' | 'raise' | 'fold' | 'win' | 'lose' | 'click' | 'turn';

const GAP: Partial<Record<PokerSound, number>> = { deal: 45, chips: 60, flip: 50 };
const last = new Map<PokerSound, number>();
let recent: number[] = [];

const chip = (v: Voice, t: number, pitch = 1) => {
  noise(v, t, 0.035, { type: 'bandpass', freq: 5200 * pitch, q: 6, gain: 0.09 });
  tone(v, t, 3100 * pitch, 0.03, { gain: 0.02, type: 'triangle' });
};

const SOUNDS: Record<PokerSound, (v: Voice, t: number) => void> = {
  deal: (v, t) => noise(v, t, 0.06, { type: 'highpass', freq: 3200, to: 1800, gain: 0.06 }),
  flip: (v, t) => {
    noise(v, t, 0.05, { type: 'bandpass', freq: 2400, q: 2, gain: 0.07 });
    tone(v, t + 0.02, 1400, 0.03, { gain: 0.015 });
  },
  chips: (v, t) => [0, 0.045, 0.085].forEach((d, i) => chip(v, t + d, 1 - i * 0.06)),
  check: (v, t) => {
    tone(v, t, 180, 0.07, { gain: 0.12, type: 'sine', to: 120 });
    tone(v, t + 0.11, 180, 0.07, { gain: 0.1, type: 'sine', to: 120 });
  },
  call: (v, t) => [0, 0.05].forEach((d) => chip(v, t + d)),
  raise: (v, t) => {
    [0, 0.04, 0.08, 0.12].forEach((d, i) => chip(v, t + d, 1 + i * 0.04));
    tone(v, t + 0.1, note(7), 0.12, { gain: 0.02, type: 'triangle', to: note(12) });
  },
  fold: (v, t) => noise(v, t, 0.16, { type: 'bandpass', freq: 1800, to: 700, q: 1, gain: 0.05 }),
  win: (v, t) => [0, 4, 7, 12, 16].forEach((n, i) => bell(v, t + i * 0.07, note(n + 12), 0.05, 1)),
  lose: (v, t) => [5, 2, -2].forEach((n, i) => tone(v, t + i * 0.15, note(n), 0.26, { gain: 0.045, type: 'triangle', lowpass: 1500 })),
  click: (v, t) => tone(v, t, 1200, 0.03, { gain: 0.03, type: 'sine' }),
  turn: (v, t) => bell(v, t, note(19), 0.035, 0.6),
};

export function playPoker(name: PokerSound): void {
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < (GAP[name] ?? 30)) return;
  recent = recent.filter((t) => now - t < 300);
  if (recent.length >= 6 && name !== 'win' && name !== 'lose') return;
  last.set(name, now);
  recent.push(now);
  withAudio((c, bus, noiseBuf, t) => SOUNDS[name]({ c, bus, noise: noiseBuf }, t));
}

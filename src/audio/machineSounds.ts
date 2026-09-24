// Each machine's sound profile: one synthesised voice per game event. Every call goes through
// slotSound (dedupe) and withAudio (respects the Sound switch and the effects volume).
import type { MachineId } from '@/casino/premium/engine';
import { bell, brass, noise, note, pluck, tone } from './voices';
import type { Voice } from './voices';

export type SlotEvent = 'click' | 'spin' | 'reelStop' | 'anticipation' | 'coin' | 'small' | 'big' | 'mega' | 'jackpot' | 'feature' | 'reveal' | 'error';

type Profile = Record<SlotEvent, (v: Voice, t: number) => void>;

const coinClink = (v: Voice, t: number, f = 3200) => {
  tone(v, t, f, 0.09, { gain: 0.07 });
  tone(v, t + 0.012, f * 1.5, 0.07, { gain: 0.035 });
};

const common = {
  error: (v: Voice, t: number) => {
    tone(v, t, 160, 0.09, { type: 'sawtooth', gain: 0.07, to: 120, lowpass: 900 });
    tone(v, t + 0.11, 150, 0.1, { type: 'sawtooth', gain: 0.07, to: 110, lowpass: 900 });
  },
};

export const PROFILES: Record<MachineId, Profile> = {
  // Mechanical 70s upright: ratchets, clunks, a real bell and a coin hopper.
  lucky7s: {
    ...common,
    click: (v, t) => noise(v, t, 0.03, { freq: 3500, gain: 0.25 }),
    spin: (v, t) => {
      for (let i = 0; i < 6; i++) noise(v, t + i * 0.03, 0.02, { freq: 2000 - i * 150, gain: 0.22 });
      tone(v, t + 0.2, 110, 0.12, { gain: 0.2, to: 60 });
    },
    reelStop: (v, t) => {
      tone(v, t, 120, 0.1, { type: 'square', gain: 0.07, to: 70, lowpass: 600 });
      noise(v, t, 0.05, { type: 'lowpass', freq: 1200, gain: 0.3 });
    },
    anticipation: (v, t) => {
      for (let i = 0; i < 10; i++) tone(v, t + i * 0.1, 520 + i * 40, 0.08, { type: 'square', gain: 0.03, lowpass: 2000 });
    },
    coin: (v, t) => coinClink(v, t),
    small: (v, t) => bell(v, t, 1568, 0.1, 0.9),
    big: (v, t) => {
      for (let i = 0; i < 8; i++) bell(v, t + i * 0.13, 1568, 0.08, 0.5);
      for (let i = 0; i < 14; i++) coinClink(v, t + 0.3 + i * 0.07, 2800 + (i % 4) * 300);
    },
    mega: (v, t) => {
      for (let i = 0; i < 18; i++) bell(v, t + i * 0.09, i % 2 ? 1568 : 1760, 0.07, 0.4);
      brass(v, t + 0.4, [note(3), note(7), note(10)], 1.2, 0.035);
    },
    jackpot: (v, t) => {
      for (let i = 0; i < 30; i++) bell(v, t + i * 0.08, i % 2 ? 1568 : 2093, 0.06, 0.35);
      for (let i = 0; i < 4; i++) tone(v, t + i * 0.5, 660, 0.45, { type: 'square', gain: 0.03, to: 990, lowpass: 2500 });
    },
    feature: (v, t) => bell(v, t, 1319, 0.1, 1.2),
    reveal: (v, t) => coinClink(v, t),
  },

  // Jeweller's vitrine: glass, chimes and a soft airy pad. No coins at all.
  diamondRoyale: {
    ...common,
    click: (v, t) => tone(v, t, 4200, 0.05, { gain: 0.05 }),
    spin: (v, t) => {
      for (let i = 0; i < 8; i++) tone(v, t + i * 0.025, 2000 + i * 260, 0.18, { gain: 0.025 });
    },
    reelStop: (v, t) => {
      tone(v, t, 2637, 0.25, { gain: 0.05 });
      tone(v, t, 3951, 0.18, { gain: 0.025 });
    },
    anticipation: (v, t) => {
      for (let i = 0; i < 14; i++) tone(v, t + i * 0.09, note(15 + (i % 7) * 2), 0.3, { gain: 0.03 });
    },
    coin: (v, t) => tone(v, t, 5274, 0.08, { gain: 0.025 }),
    small: (v, t) => {
      tone(v, t, note(19), 0.8, { gain: 0.06 });
      tone(v, t + 0.09, note(26), 0.9, { gain: 0.05 });
    },
    big: (v, t) => [0, 4, 7, 11, 14, 19, 23].forEach((s, i) => pluck(v, t + i * 0.07, note(12 + s), 0.07, 1.2, 'sine')),
    mega: (v, t) => {
      [0, 4, 7, 11, 14, 19, 23, 26, 31].forEach((s, i) => pluck(v, t + i * 0.06, note(12 + s), 0.06, 1.5, 'sine'));
      [0, 4, 7, 11].forEach((s) => tone(v, t + 0.6, note(s), 2.2, { gain: 0.04, attack: 0.4 }));
    },
    jackpot: (v, t) => {
      for (let r = 0; r < 3; r++) [0, 4, 7, 11, 14, 19].forEach((s, i) => pluck(v, t + r * 0.55 + i * 0.06, note(12 + s + r * 2), 0.055, 1.6, 'sine'));
      [0, 4, 7, 11, 14].forEach((s) => tone(v, t + 1.6, note(s - 12), 3, { gain: 0.05, attack: 0.6 }));
    },
    feature: (v, t) => [0, 7, 12, 19].forEach((s, i) => tone(v, t + i * 0.08, note(12 + s), 1, { gain: 0.05 })),
    reveal: (v, t) => tone(v, t, note(24), 0.5, { gain: 0.05 }),
  },

  // Temple treasury: coin clinks, a deep gong, pentatonic plucks.
  goldenFortune: {
    ...common,
    click: (v, t) => coinClink(v, t, 2600),
    spin: (v, t) => noise(v, t, 0.35, { freq: 900, to: 2400, gain: 0.1, attack: 0.05 }),
    reelStop: (v, t) => {
      tone(v, t, 180, 0.12, { gain: 0.1, to: 120 });
      coinClink(v, t + 0.01, 2400);
    },
    anticipation: (v, t) => {
      for (let i = 0; i < 12; i++) tone(v, t + i * 0.1, note([0, 2, 4, 7, 9][i % 5] + 12), 0.2, { type: 'triangle', gain: 0.05 });
    },
    coin: (v, t) => coinClink(v, t, 3000),
    small: (v, t) => [0, 1, 2].forEach((i) => coinClink(v, t + i * 0.06, 2800 + i * 250)),
    big: (v, t) => {
      bell(v, t, 110, 0.18, 2.4);
      for (let i = 0; i < 20; i++) coinClink(v, t + 0.1 + i * 0.05, 2600 + (i % 5) * 220);
    },
    mega: (v, t) => {
      bell(v, t, 82, 0.2, 3);
      for (let i = 0; i < 34; i++) coinClink(v, t + 0.1 + i * 0.04, 2400 + (i % 7) * 200);
    },
    jackpot: (v, t) => {
      for (let r = 0; r < 3; r++) bell(v, t + r * 0.7, 82 * (r + 1), 0.18, 2.5);
      for (let i = 0; i < 50; i++) coinClink(v, t + 0.2 + i * 0.04, 2400 + (i % 9) * 180);
    },
    feature: (v, t) => bell(v, t, 98, 0.22, 3),
    reveal: (v, t) => {
      coinClink(v, t, 3400);
      tone(v, t, note(19), 0.4, { type: 'triangle', gain: 0.05 });
    },
  },

  // Volcanic forge: whooshes, low impacts, crackling fire.
  inferno: {
    ...common,
    click: (v, t) => noise(v, t, 0.05, { freq: 5000, gain: 0.2, type: 'highpass' }),
    spin: (v, t) => noise(v, t, 0.5, { freq: 300, to: 3000, gain: 0.16, attack: 0.08, type: 'bandpass', q: 0.7 }),
    reelStop: (v, t) => {
      tone(v, t, 70, 0.18, { gain: 0.3, to: 40 });
      noise(v, t, 0.08, { type: 'lowpass', freq: 800, gain: 0.25 });
    },
    anticipation: (v, t) => {
      noise(v, t, 1.4, { type: 'lowpass', freq: 200, to: 1200, gain: 0.18, attack: 1 });
      tone(v, t, 55, 1.4, { type: 'sawtooth', gain: 0.05, lowpass: 300, attack: 1 });
    },
    coin: (v, t) => noise(v, t, 0.03, { freq: 4000, gain: 0.12 }),
    small: (v, t) => {
      noise(v, t, 0.3, { freq: 1500, to: 600, gain: 0.12 });
      brass(v, t, [note(-5), note(-2), note(2)], 0.35, 0.04, 1400);
    },
    big: (v, t) => {
      tone(v, t, 60, 0.6, { gain: 0.4, to: 30 });
      noise(v, t, 0.9, { type: 'lowpass', freq: 2500, to: 200, gain: 0.35 });
      brass(v, t + 0.1, [note(-7), note(-4), note(0)], 1, 0.045, 1600);
    },
    mega: (v, t) => {
      for (let i = 0; i < 3; i++) {
        tone(v, t + i * 0.35, 55, 0.6, { gain: 0.4, to: 28 });
        noise(v, t + i * 0.35, 0.7, { type: 'lowpass', freq: 3000, to: 200, gain: 0.3 });
      }
      brass(v, t + 0.3, [note(-7), note(-3), note(0), note(5)], 1.8, 0.04, 2000);
    },
    jackpot: (v, t) => {
      for (let i = 0; i < 5; i++) tone(v, t + i * 0.28, 50, 0.7, { gain: 0.42, to: 26 });
      noise(v, t, 2.4, { type: 'lowpass', freq: 400, to: 4000, gain: 0.3, attack: 0.8 });
      brass(v, t + 1, [note(-12), note(-5), note(0), note(3), note(7)], 2.4, 0.04, 2400);
    },
    feature: (v, t) => {
      noise(v, t, 1, { type: 'bandpass', freq: 200, to: 2500, gain: 0.25, attack: 0.3 });
      tone(v, t + 0.6, 45, 0.9, { gain: 0.4, to: 30 });
    },
    reveal: (v, t) => tone(v, t, 90, 0.25, { gain: 0.3, to: 50 }),
  },

  // Beach bar: wood blocks, marimba, steel drum.
  tropical: {
    ...common,
    click: (v, t) => tone(v, t, 900, 0.05, { type: 'triangle', gain: 0.12 }),
    spin: (v, t) => [0, 4, 7].forEach((s, i) => pluck(v, t + i * 0.05, note(s + 3), 0.06, 0.25)),
    reelStop: (v, t) => {
      tone(v, t, 520, 0.08, { type: 'triangle', gain: 0.12 });
      tone(v, t, 1040, 0.04, { gain: 0.04 });
    },
    anticipation: (v, t) => {
      for (let i = 0; i < 12; i++) pluck(v, t + i * 0.1, note([0, 2, 4, 7, 9][i % 5] + 15), 0.05, 0.25);
    },
    coin: (v, t) => pluck(v, t, note(27), 0.04, 0.15, 'sine'),
    small: (v, t) => [0, 4, 7].forEach((s, i) => pluck(v, t + i * 0.09, note(15 + s), 0.09, 0.5)),
    big: (v, t) => [0, 4, 7, 12, 9, 7, 12, 16].forEach((s, i) => pluck(v, t + i * 0.11, note(15 + s), 0.09, 0.6, 'sine')),
    mega: (v, t) => {
      [0, 4, 7, 12, 16, 12, 19, 24].forEach((s, i) => pluck(v, t + i * 0.1, note(15 + s), 0.09, 0.7, 'sine'));
      [0, 4, 7].forEach((s) => pluck(v, t + 0.9, note(3 + s), 0.06, 1.5));
    },
    jackpot: (v, t) => {
      for (let r = 0; r < 3; r++) [0, 4, 7, 12, 16].forEach((s, i) => pluck(v, t + r * 0.6 + i * 0.09, note(15 + s + r * 2), 0.08, 0.7, 'sine'));
    },
    feature: (v, t) => [0, 7, 12, 16, 19].forEach((s, i) => pluck(v, t + i * 0.08, note(15 + s), 0.09, 0.7, 'sine')),
    reveal: (v, t) => pluck(v, t, note(22), 0.08, 0.4),
  },

  // Captain's table: wood, rope, a ship's bell, doubloons.
  pirates: {
    ...common,
    click: (v, t) => tone(v, t, 200, 0.06, { type: 'triangle', gain: 0.18, to: 140 }),
    spin: (v, t) => noise(v, t, 0.5, { freq: 400, to: 900, gain: 0.08, attack: 0.1, q: 4 }),
    reelStop: (v, t) => {
      tone(v, t, 150, 0.12, { type: 'triangle', gain: 0.2, to: 90 });
      noise(v, t, 0.06, { type: 'lowpass', freq: 700, gain: 0.25 });
    },
    anticipation: (v, t) => noise(v, t, 1.3, { freq: 300, to: 700, gain: 0.12, attack: 0.9, q: 6 }),
    coin: (v, t) => coinClink(v, t, 2400),
    small: (v, t) => {
      bell(v, t, 988, 0.1, 1);
      bell(v, t + 0.35, 988, 0.08, 1);
    },
    big: (v, t) => {
      for (let i = 0; i < 4; i++) bell(v, t + i * 0.3, 988, 0.08, 0.8);
      for (let i = 0; i < 16; i++) coinClink(v, t + 0.2 + i * 0.06, 2200 + (i % 4) * 260);
      brass(v, t + 0.2, [note(-9), note(-5), note(-2)], 1, 0.03, 1200);
    },
    mega: (v, t) => {
      brass(v, t, [note(-9), note(-5), note(-2), note(3)], 1.6, 0.035, 1400);
      for (let i = 0; i < 28; i++) coinClink(v, t + 0.2 + i * 0.05, 2200 + (i % 6) * 200);
    },
    jackpot: (v, t) => {
      for (let i = 0; i < 8; i++) bell(v, t + i * 0.25, 988, 0.08, 0.8);
      brass(v, t + 0.3, [note(-14), note(-9), note(-5), note(-2), note(3)], 2.4, 0.035, 1600);
      for (let i = 0; i < 40; i++) coinClink(v, t + 0.4 + i * 0.05, 2200 + (i % 8) * 180);
    },
    feature: (v, t) => {
      noise(v, t, 0.7, { freq: 300, to: 150, gain: 0.2, q: 8 });
      bell(v, t + 0.5, 988, 0.1, 1.2);
    },
    reveal: (v, t) => {
      noise(v, t, 0.25, { freq: 500, to: 220, gain: 0.15, q: 6 });
      for (let i = 0; i < 4; i++) coinClink(v, t + 0.15 + i * 0.05, 2400 + i * 200);
    },
  },

  // Observatory HUD: blips, lasers, synth sweeps.
  cosmic: {
    ...common,
    click: (v, t) => tone(v, t, 1400, 0.05, { type: 'square', gain: 0.04, lowpass: 3000 }),
    spin: (v, t) => tone(v, t, 200, 0.45, { type: 'sawtooth', gain: 0.05, to: 1600, lowpass: 2400 }),
    reelStop: (v, t) => tone(v, t, 1500, 0.12, { type: 'sine', gain: 0.08, to: 280 }),
    anticipation: (v, t) => {
      tone(v, t, 110, 1.4, { type: 'sawtooth', gain: 0.05, to: 880, lowpass: 1800, attack: 0.9 });
      tone(v, t, 111, 1.4, { type: 'sawtooth', gain: 0.04, to: 887, lowpass: 1800, attack: 0.9 });
    },
    coin: (v, t) => tone(v, t, 2400, 0.05, { type: 'square', gain: 0.02, lowpass: 4000 }),
    small: (v, t) => [0, 7, 12].forEach((s, i) => tone(v, t + i * 0.07, note(12 + s), 0.2, { type: 'square', gain: 0.035, lowpass: 3000 })),
    big: (v, t) => {
      [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(v, t + i * 0.07, note(12 + s), 0.3, { type: 'square', gain: 0.035, lowpass: 3500 }));
      tone(v, t, 110, 1.2, { type: 'sawtooth', gain: 0.05, to: 440, lowpass: 1500 });
    },
    mega: (v, t) => {
      for (let i = 0; i < 16; i++) tone(v, t + i * 0.06, note(12 + [0, 4, 7, 11, 14, 19, 23, 26][i % 8]), 0.25, { type: 'square', gain: 0.03, lowpass: 4000 });
      [0, 7, 14].forEach((s) => tone(v, t + 0.9, note(s - 12), 1.8, { type: 'sawtooth', gain: 0.04, lowpass: 1600, attack: 0.3 }));
    },
    jackpot: (v, t) => {
      tone(v, t, 60, 1.6, { type: 'sawtooth', gain: 0.07, to: 1200, lowpass: 2600, attack: 0.2 });
      for (let i = 0; i < 24; i++) tone(v, t + 0.8 + i * 0.05, note(12 + [0, 4, 7, 11, 14, 19][i % 6] + Math.floor(i / 6) * 2), 0.25, { type: 'square', gain: 0.03, lowpass: 4000 });
    },
    feature: (v, t) => {
      tone(v, t, 80, 1.2, { type: 'sawtooth', gain: 0.06, to: 1600, lowpass: 3000, attack: 0.4 });
      noise(v, t + 0.8, 0.5, { type: 'highpass', freq: 3000, gain: 0.08 });
    },
    reveal: (v, t) => tone(v, t, 2200, 0.2, { gain: 0.06, to: 880 }),
  },

  // Monte Carlo salon: velvet thuds, harp, brass fanfares, timpani.
  royal: {
    ...common,
    click: (v, t) => tone(v, t, 2400, 0.05, { type: 'triangle', gain: 0.05 }),
    spin: (v, t) => [0, 4, 7, 12].forEach((s, i) => pluck(v, t + i * 0.035, note(s), 0.05, 0.5)),
    reelStop: (v, t) => {
      tone(v, t, 90, 0.16, { gain: 0.18, to: 70 });
      tone(v, t, note(24), 0.2, { gain: 0.02 });
    },
    anticipation: (v, t) => {
      for (let i = 0; i < 16; i++) tone(v, t + i * 0.08, 80, 0.12, { gain: 0.12 + i * 0.01, to: 70 });
    },
    coin: (v, t) => tone(v, t, note(31), 0.08, { gain: 0.03 }),
    small: (v, t) => [0, 4, 7, 12].forEach((s, i) => pluck(v, t + i * 0.06, note(3 + s), 0.08, 0.9)),
    big: (v, t) => {
      brass(v, t, [note(-9), note(-5), note(-2)], 0.3, 0.045);
      brass(v, t + 0.32, [note(-9), note(-5), note(-2), note(3)], 1, 0.045);
    },
    mega: (v, t) => {
      brass(v, t, [note(-9), note(-5)], 0.25, 0.045);
      brass(v, t + 0.27, [note(-7), note(-4)], 0.25, 0.045);
      brass(v, t + 0.54, [note(-9), note(-5), note(-2), note(3)], 1.8, 0.05, 2200);
      for (let i = 0; i < 10; i++) tone(v, t + 0.54 + i * 0.05, 70, 0.1, { gain: 0.14 });
    },
    jackpot: (v, t) => {
      for (let i = 0; i < 20; i++) tone(v, t + i * 0.05, 65, 0.12, { gain: 0.1 + i * 0.006 });
      brass(v, t + 1, [note(-21), note(-9), note(-5), note(-2), note(3)], 2.6, 0.045, 2600);
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => pluck(v, t + 1 + i * 0.06, note(3 + s), 0.06, 1.2));
    },
    feature: (v, t) => brass(v, t, [note(-9), note(-2), note(3)], 1, 0.045),
    reveal: (v, t) => pluck(v, t, note(15), 0.08, 0.8),
  },
};

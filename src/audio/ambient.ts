// Each machine's (and Domino's / Bingo's) ambient music, generated live (no files) at the Music volume. Only one runs at a time,
// it stays silent while the tab is hidden, and it replaces the lobby's background music while it plays.
import type { MachineId } from '@/casino/premium/engine';
import { withAudio } from './sfx';
import { musicGain } from './music';
import { bell, noise, note, pluck, tone } from './voices';
import type { Voice } from './voices';

/** Slot machines plus the table games that bring their own music. */
export type AmbientId = MachineId | 'domino' | 'bingo' | 'jewels' | 'poker' | 'crash' | 'horse';

interface Pattern {
  /** Seconds per beat. */
  beat: number;
  play: (v: Voice, t: number, i: number, rnd: () => number) => void;
}

const chord = (v: Voice, t: number, notes: number[], dur: number, type: OscillatorType, gain: number, lowpass?: number) =>
  notes.forEach((n) => tone(v, t, note(n), dur, { type, gain, attack: dur * 0.35, lowpass }));

export const AMBIENT: Record<AmbientId, Pattern> = {
  // Casino floor: a low murmur and far-off bells.
  lucky7s: {
    beat: 1,
    play: (v, t, i, r) => {
      noise(v, t, 1.2, { type: 'lowpass', freq: 380, gain: 0.05, attack: 0.5 });
      if (r() < 0.18) bell(v, t + r() * 0.8, [1568, 1760, 2093][Math.floor(r() * 3)], 0.02, 0.8);
      if (i % 8 === 0) for (let k = 0; k < 3; k++) tone(v, t + k * 0.06, 2800 + k * 200, 0.05, { gain: 0.006 });
    },
  },
  // Slow major-seventh pads with a glint on top.
  diamondRoyale: {
    beat: 3,
    play: (v, t, i, r) => {
      const prog = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]];
      chord(v, t, prog[i % 4].map((n) => n - 12), 4.2, 'sine', 0.018);
      if (r() < 0.6) tone(v, t + 1 + r(), note(24 + [0, 4, 7, 11][Math.floor(r() * 4)]), 1.4, { gain: 0.012 });
    },
  },
  // Temple drone and pentatonic plucks.
  goldenFortune: {
    beat: 1.2,
    play: (v, t, i, r) => {
      if (i % 4 === 0) tone(v, t, 55, 5, { gain: 0.05, attack: 1.5 });
      if (r() < 0.55) pluck(v, t, note([0, 2, 4, 7, 9][Math.floor(r() * 5)] - 5), 0.025, 0.9);
    },
  },
  // A pulse like a heartbeat under crackling fire.
  inferno: {
    beat: 0.55,
    play: (v, t, i, r) => {
      if (i % 2 === 0) tone(v, t, 55, 0.35, { gain: 0.12, to: 32 });
      if (r() < 0.5) noise(v, t + r() * 0.4, 0.04, { type: 'highpass', freq: 3500, gain: 0.03 });
      if (i % 16 === 0) tone(v, t, 41, 8, { type: 'sawtooth', gain: 0.02, lowpass: 180, attack: 2 });
    },
  },
  // Waves, birds, a lazy marimba.
  tropical: {
    beat: 1.4,
    play: (v, t, i, r) => {
      if (i % 2 === 0) noise(v, t, 2.8, { type: 'lowpass', freq: 350, to: 900, gain: 0.06, attack: 1.2 });
      if (r() < 0.14) for (let k = 0; k < 3; k++) tone(v, t + k * 0.09, 2400 + r() * 800, 0.07, { gain: 0.01, to: 3600 });
      if (r() < 0.4) pluck(v, t, note([0, 2, 4, 7, 9][Math.floor(r() * 5)] + 3), 0.025, 0.5, 'sine');
    },
  },
  // Sea, creaking timbers and a squeezebox drone.
  pirates: {
    beat: 1.5,
    play: (v, t, i, r) => {
      if (i % 2 === 0) noise(v, t, 3, { type: 'lowpass', freq: 300, to: 700, gain: 0.06, attack: 1.4 });
      if (r() < 0.2) noise(v, t + r(), 0.6, { freq: 220 + r() * 120, to: 160, gain: 0.03, q: 10 });
      if (i % 4 === 0) chord(v, t, [[-21, -14, -9], [-19, -12, -7]][(i / 4) % 2], 5.5, 'square', 0.008, 700);
    },
  },
  // A slow, wide synth pad and sparse blips.
  cosmic: {
    beat: 2,
    play: (v, t, i, r) => {
      if (i % 2 === 0) chord(v, t, [[-24, -17, -12, -8], [-22, -15, -10, -5]][(i / 2) % 2], 4.4, 'sawtooth', 0.007, 700);
      if (r() < 0.5) tone(v, t + r(), note(24 + [0, 3, 7, 10, 14][Math.floor(r() * 5)]), 0.15, { type: 'square', gain: 0.006, lowpass: 3000 });
    },
  },
  // A string pad walking I–vi–IV–V and the odd harp note.
  royal: {
    beat: 2.4,
    play: (v, t, i, r) => {
      const prog = [[-9, -5, -2], [-12, -9, -5], [-16, -12, -9], [-14, -10, -7]];
      chord(v, t, prog[i % 4].map((n) => n - 12), 2.8, 'sawtooth', 0.008, 900);
      if (r() < 0.35) pluck(v, t + 0.8, note(prog[i % 4][Math.floor(r() * 3)] + 12), 0.03, 1.2);
    },
  },
  // Domino: an unhurried café trio. Warm ninth chords, a walking bass, brushes on the snare.
  domino: {
    beat: 0.72,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 4) % 4;
      const roots = [-19, -14, -21, -16]; // D, G, B, E (ii–V–iii–vi in C, low register)
      const chords = [[-7, -3, 0, 4], [-2, 2, 5, 9], [-5, -1, 2, 5], [-8, -4, -1, 3]];
      if (i % 4 === 0) chord(v, t, chords[bar], 2.6, 'triangle', 0.01, 1400);
      const walk = [0, 7, 12, 10][i % 4];
      pluck(v, t, note(roots[bar] + walk - 12), 0.05, 0.6, 'sine');
      noise(v, t + (i % 2 ? 0.02 : 0), 0.22, { type: 'highpass', freq: 5200, gain: i % 2 ? 0.014 : 0.006, attack: 0.08 });
      if (r() < 0.22) pluck(v, t + 0.36, note(chords[bar][Math.floor(r() * 4)] + 12), 0.018, 0.7);
    },
  },
  // Poker: a late-night lounge — soft seventh chords, a walking bass and brushed hats.
  // Crash: a tense low pulse and wide space pads, a far-off shimmer.
  crash: {
    beat: 0.5,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 8) % 4;
      const roots = [-9, -9, -5, -7]; // A minor, F, G feel
      if (i % 8 === 0) chord(v, t, [0, 7, 12, 15].map((n) => roots[bar] + n - 12), 4, 'sine', 0.012, 1400);
      if (i % 2 === 0) tone(v, t, note(roots[bar] - 24), 0.3, { type: 'triangle', gain: 0.06, lowpass: 420 });
      if (i % 4 === 3) noise(v, t, 0.06, { type: 'highpass', freq: 7000, gain: 0.01 });
      if (i % 16 === 8 && r() < 0.6) bell(v, t, note(roots[bar] + 24), 0.005, 1.2);
    },
  },
  // Horse racing: a bright, brassy lilt over a trotting bass, a far-off bell.
  horse: {
    beat: 0.42,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 8) % 4;
      const roots = [0, 5, 7, 0]; // C F G C
      if (i % 8 === 0) chord(v, t, [0, 4, 7, 12].map((n) => roots[bar] + n - 12), 3.2, 'triangle', 0.009, 2200);
      if (i % 2 === 0) tone(v, t, note(roots[bar] - 24 + (i % 4 === 0 ? 0 : 7)), 0.22, { type: 'triangle', gain: 0.05, lowpass: 600 });
      if (i % 4 === 1 || i % 4 === 3) noise(v, t, 0.03, { type: 'bandpass', freq: 900, gain: 0.012 });
      if (i % 16 === 14 && r() < 0.5) bell(v, t, note(roots[bar] + 19), 0.005, 0.9);
    },
  },
  poker: {
    beat: 0.5,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 8) % 4;
      const roots = [-7, -2, -9, -4]; // D, G, C, F (ii–V–I–IV feel)
      if (i % 8 === 0) chord(v, t, [0, 3, 7, 10].map((n) => roots[bar] + n), 3.6, 'sine', 0.01, 1800);
      if (i % 2 === 0) tone(v, t, note(roots[bar] - 24 + [0, 7, 10, 7][(i / 2) % 4]), 0.4, { type: 'triangle', gain: 0.05, lowpass: 700 });
      if (i % 2 === 1) noise(v, t, 0.05, { type: 'highpass', freq: 6000, gain: 0.012 });
      if (i % 16 === 12 && r() < 0.5) bell(v, t, note(roots[bar] + 19), 0.006, 0.8);
    },
  },
  // Jewellery: Olympus: a lyre in the Dorian mode over a low drone and soft string pads, with a distant temple bell.
  jewels: {
    beat: 0.46,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 16) % 4;
      const roots = [-10, -12, -7, -9]; // D, C, F, E (Dorian colour)
      const scale = [0, 2, 3, 5, 7, 9, 10, 12, 14];
      if (i % 16 === 0) {
        tone(v, t, note(roots[bar] - 24), 7.4, { gain: 0.03, type: 'sine', attack: 1.4 });
        chord(v, t, [0, 7, 12, 15].map((n) => roots[bar] - 12 + n), 7.4, 'triangle', 0.007, 1400);
      }
      // Lyre: arpeggio up and down the mode, sometimes resting.
      if (i % 2 === 0 && r() < 0.8) {
        const step = [0, 2, 4, 6, 7, 6, 4, 2][(i / 2) % 8];
        pluck(v, t, note(roots[bar] + 12 + scale[step]), 0.022, 1.1);
      }
      if (i % 32 === 24 && r() < 0.6) bell(v, t, note(roots[bar] + 24), 0.006, 2.2);
    },
  },
  // Bingo: a bright, bouncy groove. Pumping bass, offbeat chords, handclaps on 2 and 4, glockenspiel hooks.
  bingo: {
    beat: 0.3,
    play: (v, t, i, r) => {
      const bar = Math.floor(i / 8) % 4;
      const roots = [-9, -4, -2, -7]; // C, F, G, A-minor
      if (i % 2 === 0) tone(v, t, note(roots[bar] - 12), 0.22, { type: 'triangle', gain: 0.06, lowpass: 900 });
      if (i % 2 === 1) chord(v, t, [0, 4, 7].map((n) => roots[bar] + 12 + n), 0.18, 'square', 0.006, 2600);
      if (i % 4 === 2) noise(v, t, 0.09, { freq: 1400, gain: 0.03, q: 1.2 });
      if (i % 8 === 0 && r() < 0.6) [0, 4, 7, 12].forEach((n, k) => bell(v, t + k * 0.075, note(roots[bar] + 24 + n), 0.012, 0.5));
    },
  },
};

let active: { machine: AmbientId; stop: () => void; setVolume: (v: number) => void } | null = null;

/** Starts (or retargets) the machine's ambient music. Safe to call repeatedly. */
export function startAmbient(machine: AmbientId, volume: number): void {
  if (active?.machine === machine) {
    active.setVolume(volume);
    return;
  }
  stopAmbient();
  let gain: GainNode | null = null;
  let voice: Voice | null = null;
  let next = 0;
  let beat = 0;
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
  const pattern = AMBIENT[machine];
  let level = musicGain(volume);
  const ensure = () =>
    voice ??
    (withAudio((c, _bus, noiseBuf) => {
      gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.connect(c.destination);
      gain.gain.setTargetAtTime(level, c.currentTime, 0.8);
      voice = { c, bus: gain, noise: noiseBuf };
      next = c.currentTime + 0.1;
    }),
    voice);
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    const v = ensure();
    if (!v || v.c.state !== 'running') return;
    // Schedule a little ahead; never pile up beats after the tab was hidden for a while.
    if (next < v.c.currentTime) next = v.c.currentTime + 0.05;
    while (next < v.c.currentTime + 0.6) {
      pattern.play(v, next, beat++, rnd);
      next += pattern.beat;
    }
  }, 250);
  active = {
    machine,
    stop: () => {
      window.clearInterval(timer);
      const g = gain as GainNode | null;
      if (g && voice) {
        const now = voice.c.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0.0001, now, 0.25);
        window.setTimeout(() => g.disconnect(), 1500);
      }
    },
    setVolume: (v) => {
      level = musicGain(v);
      const g = gain as GainNode | null;
      if (g && voice) g.gain.setTargetAtTime(Math.max(0.0001, level), voice.c.currentTime, 0.3);
    },
  };
}

export function stopAmbient(): void {
  active?.stop();
  active = null;
}

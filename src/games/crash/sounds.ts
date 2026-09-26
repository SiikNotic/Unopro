// CRASH sounds, synthesized on the shared effects bus (no audio files). Silent when sound is off.
import { withAudio } from '@/audio/sfx';

function tone(c: AudioContext, bus: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(c: AudioContext, bus: AudioNode, noise: AudioBuffer, t: number, dur: number, type: BiquadFilterType, freq: number, gain: number, endFreq?: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const crashSounds = {
  /** One beep of the 3-2-1 countdown (the last one higher). */
  tick(last = false) {
    withAudio((c, bus, _n, t) => tone(c, bus, last ? 1320 : 880, t, 0.14, 'sine', 0.22));
  },
  /** Take-off: a rising whoosh. */
  launch() {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 1.1, 'bandpass', 300, 0.35, 2400);
      tone(c, bus, 90, t, 0.9, 'sawtooth', 0.08, 260);
    });
  },
  /** A soft chime as the multiplier passes 2x, 5x, 10x, ... */
  milestone(level: number) {
    withAudio((c, bus, _n, t) => {
      const base = 660 * Math.min(2, 1 + level * 0.12);
      tone(c, bus, base, t, 0.18, 'triangle', 0.12);
      tone(c, bus, base * 1.5, t + 0.07, 0.22, 'triangle', 0.1);
    });
  },
  /** Cash-out: coins. */
  cashout() {
    withAudio((c, bus, _n, t) => {
      [1568, 2093, 2637, 3136].forEach((f, i) => tone(c, bus, f, t + i * 0.06, 0.16, 'sine', 0.14));
    });
  },
  /** A win worth celebrating (big multiplier). */
  win() {
    withAudio((c, bus, _n, t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, bus, f, t + i * 0.1, 0.3, 'triangle', 0.14));
      tone(c, bus, 1568, t + 0.42, 0.5, 'sine', 0.1);
    });
  },
  /** The crash: a boom and debris. */
  crash() {
    withAudio((c, bus, noise, t) => {
      tone(c, bus, 120, t, 0.9, 'sine', 0.5, 38);
      burst(c, bus, noise, t, 0.9, 'lowpass', 1800, 0.55, 200);
      burst(c, bus, noise, t + 0.05, 0.4, 'highpass', 3500, 0.12);
    });
  },
};

/** The engine's roar while the rocket climbs; `set(x)` raises the pitch with the multiplier. */
export function startEngine(): { set: (x: number) => void; stop: () => void } {
  let filter: BiquadFilterNode | null = null;
  let gain: GainNode | null = null;
  let src: AudioBufferSourceNode | null = null;
  let ctx: AudioContext | null = null;
  withAudio((c, bus, noise, t) => {
    ctx = c;
    src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, t);
    filter.Q.value = 4;
    gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.13, t + 0.4);
    src.connect(filter).connect(gain).connect(bus);
    src.start(t);
  });
  let stopped = false;
  return {
    set(x: number) {
      if (!ctx || !filter || stopped) return;
      filter.frequency.setTargetAtTime(Math.min(1800, 260 + Math.log(Math.max(1, x)) * 320), ctx.currentTime, 0.2);
    },
    stop() {
      if (stopped || !ctx || !gain || !src) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        src.stop(now + 0.3);
      } catch {
        // already stopped
      }
    },
  };
}

// HORSE RACING sounds, synthesized on the shared effects bus (no audio files). Silent when sound is off.
import { withAudio } from '@/audio/sfx';

function tone(c: AudioContext, bus: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(c: AudioContext, bus: AudioNode, noise: AudioBuffer, t: number, dur: number, type: BiquadFilterType, freq: number, gain: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const horseSounds = {
  /** The call to post: the classic bugle figure (G major arpeggio). */
  bugle() {
    withAudio((c, bus, _n, t) => {
      const notes: [number, number, number][] = [
        [392, 0, 0.14], [523, 0.16, 0.14], [659, 0.32, 0.14], [784, 0.48, 0.3], [659, 0.82, 0.14], [784, 0.98, 0.5],
      ];
      for (const [f, at, d] of notes) {
        tone(c, bus, f, t + at, d, 'sawtooth', 0.05);
        tone(c, bus, f * 2, t + at, d, 'square', 0.012);
      }
    });
  },
  /** A countdown beep (the last one higher). */
  tick(last = false) {
    withAudio((c, bus, _n, t) => tone(c, bus, last ? 1175 : 784, t, 0.14, 'sine', 0.2));
  },
  /** The gates open: a metallic clang and a roar of hooves. */
  gates() {
    withAudio((c, bus, noise, t) => {
      tone(c, bus, 220, t, 0.25, 'square', 0.12, 110);
      burst(c, bus, noise, t, 0.35, 'bandpass', 1800, 0.25);
    });
  },
  /** The crowd cheers as the winner crosses the line. */
  finish() {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 2.2, 'bandpass', 1100, 0.3);
      burst(c, bus, noise, t + 0.1, 1.8, 'bandpass', 2400, 0.12);
    });
  },
  win() {
    withAudio((c, bus, _n, t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, bus, f, t + i * 0.11, 0.32, 'triangle', 0.14));
      tone(c, bus, 1568, t + 0.46, 0.6, 'sine', 0.1);
    });
  },
  lose() {
    withAudio((c, bus, _n, t) => {
      tone(c, bus, 392, t, 0.28, 'triangle', 0.12, 330);
      tone(c, bus, 294, t + 0.26, 0.5, 'triangle', 0.12, 220);
    });
  },
  /** Bet confirmed: a chip click. */
  chip() {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.05, 'highpass', 3000, 0.2);
      tone(c, bus, 1800, t, 0.08, 'sine', 0.08);
    });
  },
};

/**
 * Hooves and crowd while the race runs: a four-beat gallop that thunders louder as `set(pack, excitement)` rises,
 * and a crowd murmur that swells in the home straight.
 */
export function startRaceSound(): { set: (pack: number, excitement: number) => void; stop: () => void } {
  let ctx: AudioContext | null = null;
  let crowdGain: GainNode | null = null;
  let crowdSrc: AudioBufferSourceNode | null = null;
  let level = 0.5;
  let timer: number | null = null;
  withAudio((c, bus, noise, t) => {
    ctx = c;
    crowdSrc = c.createBufferSource();
    crowdSrc.buffer = noise;
    crowdSrc.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.6;
    crowdGain = c.createGain();
    crowdGain.gain.setValueAtTime(0.0001, t);
    crowdGain.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    crowdSrc.connect(f).connect(crowdGain).connect(bus);
    crowdSrc.start(t);
    // hoofbeats: a burst of four thuds every stride, scheduled a little ahead
    let next = t;
    const schedule = () => {
      while (next < c.currentTime + 0.3) {
        for (let k = 0; k < 4; k++) {
          const at = next + k * 0.075 + Math.random() * 0.01;
          burst(c, bus, noise, at, 0.06, 'lowpass', 380 + Math.random() * 120, 0.05 + level * 0.12);
        }
        next += 0.44;
      }
    };
    schedule();
    timer = window.setInterval(schedule, 120);
  });
  let stopped = false;
  return {
    set(pack: number, excitement: number) {
      level = Math.max(0, Math.min(1, pack));
      if (ctx && crowdGain && !stopped) crowdGain.gain.setTargetAtTime(0.04 + Math.max(0, Math.min(1, excitement)) * 0.14, ctx.currentTime, 0.4);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      if (ctx && crowdGain && crowdSrc) {
        const now = ctx.currentTime;
        try {
          crowdGain.gain.cancelScheduledValues(now);
          crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), now);
          crowdGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
          crowdSrc.stop(now + 0.9);
        } catch {
          // already stopped
        }
      }
    },
  };
}

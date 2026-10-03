// 8-BALL sounds, synthesized on the shared effects bus (no audio files). They follow the global Sound switch and
// the effects volume from Settings (withAudio does nothing while sound is off).
import { withAudio } from '@/audio/sfx';

function tone(c: AudioContext, bus: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(c: AudioContext, bus: AudioNode, noise: AudioBuffer, t: number, dur: number, type: BiquadFilterType, freq: number, gain: number, q = 1) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// A break makes dozens of contacts in a few frames: limit how many clicks per kind can start.
let lastBall = 0;
let lastRail = 0;
const strength = (speed: number) => Math.max(0.05, Math.min(1, speed / 600));

export const poolSounds = {
  /** Cue tip on the cue ball: a short woody tock. */
  cue(power: number) {
    const p = Math.max(0.1, Math.min(1, power));
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.035 + p * 0.02, 'bandpass', 1500 + p * 900, 0.2 + p * 0.3, 1.6);
      tone(c, bus, 420 + p * 160, t, 0.06, 'triangle', 0.08 + p * 0.08, 220);
    });
  },
  /** Ball on ball: the bright phenolic click, louder the harder they meet. */
  ball(speed: number) {
    const now = performance.now();
    if (now - lastBall < 28) return;
    lastBall = now;
    const p = strength(speed);
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.025 + p * 0.02, 'bandpass', 3200 + p * 1400, 0.08 + p * 0.38, 3);
      tone(c, bus, 2400 + p * 900, t, 0.03, 'sine', 0.03 + p * 0.08);
    });
  },
  /** Ball on the cushion: a soft rubber thud. */
  rail(speed: number) {
    const now = performance.now();
    if (now - lastRail < 40) return;
    lastRail = now;
    const p = strength(speed);
    if (p < 0.08) return;
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.07, 'lowpass', 500 + p * 500, 0.06 + p * 0.22);
      tone(c, bus, 120 + p * 60, t, 0.09, 'sine', 0.05 + p * 0.1, 80);
    });
  },
  /** A ball drops: the knock on the pocket and the roll down the return. */
  pocket() {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.08, 'lowpass', 700, 0.32);
      tone(c, bus, 150, t, 0.16, 'sine', 0.18, 70);
      for (let i = 0; i < 3; i++) burst(c, bus, noise, t + 0.12 + i * 0.07, 0.05, 'bandpass', 900 - i * 120, 0.08, 2);
    });
  },
  foul() {
    withAudio((c, bus, _n, t) => {
      tone(c, bus, 220, t, 0.22, 'square', 0.06, 180);
      tone(c, bus, 165, t + 0.2, 0.3, 'square', 0.06, 130);
    });
  },
  /** Your turn / ball in hand: a soft chime. */
  turn() {
    withAudio((c, bus, _n, t) => {
      tone(c, bus, 880, t, 0.16, 'sine', 0.07);
      tone(c, bus, 1320, t + 0.08, 0.2, 'sine', 0.05);
    });
  },
  win() {
    withAudio((c, bus, noise, t) => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, bus, f, t + i * 0.1, 0.36, 'triangle', 0.13));
      tone(c, bus, 2093, t + 0.55, 0.7, 'sine', 0.07);
      burst(c, bus, noise, t + 0.2, 1.8, 'bandpass', 1500, 0.16, 0.6);
    });
  },
  lose() {
    withAudio((c, bus, _n, t) => {
      tone(c, bus, 392, t, 0.3, 'triangle', 0.12, 349);
      tone(c, bus, 330, t + 0.28, 0.3, 'triangle', 0.12, 294);
      tone(c, bus, 262, t + 0.56, 0.7, 'triangle', 0.12, 196);
    });
  },
};

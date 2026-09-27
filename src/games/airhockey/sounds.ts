// AIR HOCKEY sounds, synthesized on the shared effects bus (no audio files). They follow the global Sound switch
// and the effects volume from Settings (withAudio does nothing while sound is off).
import { withAudio } from '@/audio/sfx';

function tone(c: AudioContext, bus: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
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
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// Many contacts can happen in one frame: one click per kind at most every few milliseconds.
let lastHit = 0;
let lastWall = 0;

export const hockeySounds = {
  /** Mallet on puck: a hard plastic clack, brighter the harder the strike. */
  hit(power: number) {
    const now = performance.now();
    if (now - lastHit < 45) return;
    lastHit = now;
    const p = Math.max(0.15, Math.min(1, power));
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.05 + p * 0.03, 'bandpass', 2200 + p * 1800, 0.18 + p * 0.3, 2.5);
      tone(c, bus, 520 + p * 380, t, 0.07, 'triangle', 0.08 + p * 0.1, 260);
    });
  },
  /** Puck on the rail: a duller knock. */
  wall(power: number) {
    const now = performance.now();
    if (now - lastWall < 60) return;
    lastWall = now;
    const p = Math.max(0.1, Math.min(1, power));
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.06, 'lowpass', 900 + p * 700, 0.12 + p * 0.22);
      tone(c, bus, 180 + p * 90, t, 0.08, 'sine', 0.08 + p * 0.1, 120);
    });
  },
  /** A goal: the puck drops into the slot, the table's buzzer and a short crowd roar. */
  goal(mine: boolean) {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.12, 'lowpass', 500, 0.35);
      tone(c, bus, mine ? 660 : 330, t + 0.08, 0.5, 'sawtooth', 0.07);
      tone(c, bus, mine ? 880 : 247, t + 0.08, 0.5, 'square', 0.035);
      if (mine) [784, 988, 1175].forEach((f, i) => tone(c, bus, f, t + 0.5 + i * 0.09, 0.22, 'triangle', 0.1));
      burst(c, bus, noise, t + 0.15, 1.1, 'bandpass', 1300, mine ? 0.2 : 0.08, 0.7);
    });
  },
  /** Countdown beep (the last one, "go", higher). */
  count(last = false) {
    withAudio((c, bus, _n, t) => tone(c, bus, last ? 1175 : 740, t, last ? 0.3 : 0.14, 'sine', 0.2));
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
  /** Entry changed / match paid in: a chip click. */
  chip() {
    withAudio((c, bus, noise, t) => {
      burst(c, bus, noise, t, 0.04, 'highpass', 3200, 0.16);
      tone(c, bus, 1900, t, 0.06, 'sine', 0.06);
    });
  },
};

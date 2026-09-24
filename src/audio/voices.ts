// Small synthesis toolkit for the machine sound profiles (all generated, no audio files).
export interface Voice {
  c: AudioContext;
  bus: AudioNode;
  noise: AudioBuffer;
}

export function tone(v: Voice, t: number, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number; lowpass?: number; detune?: number } = {}) {
  const { c, bus } = v;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const peak = opts.gain ?? 0.15;
  const a = opts.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  let out: AudioNode = g;
  osc.connect(g);
  if (opts.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(opts.lowpass, t);
    g.connect(f);
    out = f;
  }
  out.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function noise(v: Voice, t: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; attack?: number } = {}) {
  const { c, bus } = v;
  const src = c.createBufferSource();
  src.buffer = v.noise;
  src.loop = dur > 0.45;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1500, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const peak = opts.gain ?? 0.2;
  const a = opts.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** A struck bell: inharmonic partials with a long ring. */
export function bell(v: Voice, t: number, f: number, gain = 0.1, ring = 1.4) {
  [1, 2.4, 3.9, 5.4].forEach((m, i) => tone(v, t, f * m, ring / (i + 1), { gain: gain / (i + 1.4), type: 'sine' }));
}

/** A plucked string (harp, marimba): quick attack, fast decay, a touch of the octave. */
export function pluck(v: Voice, t: number, f: number, gain = 0.12, dur = 0.5, type: OscillatorType = 'triangle') {
  tone(v, t, f, dur, { type, gain });
  tone(v, t, f * 2, dur * 0.5, { type: 'sine', gain: gain * 0.35 });
}

/** A chord of sawtooth "brass" through a low-pass. */
export function brass(v: Voice, t: number, freqs: number[], dur: number, gain = 0.05, lowpass = 1800) {
  freqs.forEach((f) => {
    tone(v, t, f, dur, { type: 'sawtooth', gain, attack: 0.04, lowpass });
    tone(v, t, f, dur, { type: 'sawtooth', gain: gain * 0.7, attack: 0.04, lowpass, detune: 8 });
  });
}

export const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

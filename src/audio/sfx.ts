// Original sound effects synthesised with the Web Audio API (no audio files, no external URLs).
// Every sound goes through playSfx, which is silent while sound is disabled.

export type SfxName =
  | 'cardPlay'
  | 'special'
  | 'wild'
  | 'drawTwo'
  | 'drawFour'
  | 'draw'
  | 'colorPick'
  | 'uno'
  | 'error'
  | 'turn'
  | 'roundStart'
  | 'victory'
  | 'defeat'
  | 'chip'
  | 'wheel'
  | 'reelStop'
  | 'cashIn';

let enabled = true;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (!value && ctx?.state === 'running') void ctx.suspend();
  if (value && ctx?.state === 'suspended') void ctx.resume();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.45;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }
  if (ctx.state === 'suspended' && enabled) void ctx.resume();
  return ctx;
}

/** Browsers only allow audio after a gesture: call from the first tap/click. */
export function unlockAudio(): void {
  if (enabled) audio();
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, filterFreq: number, gain: number, type: BiquadFilterType = 'bandpass', endFreq?: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(filterFreq, start);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  filter.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(master!);
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** A card landing on felt: soft paper snap + low thump. */
function snap(c: AudioContext, t: number, weight = 1) {
  noise(c, t, 0.07, 2400, 0.5 * weight);
  tone(c, 150, t, 0.08, 'sine', 0.35 * weight, 70);
}

const SOUNDS: Record<SfxName, (c: AudioContext, t: number) => void> = {
  cardPlay: (c, t) => snap(c, t),
  special: (c, t) => {
    snap(c, t);
    tone(c, 660, t + 0.04, 0.12, 'triangle', 0.18);
    tone(c, 990, t + 0.1, 0.16, 'triangle', 0.16);
  },
  wild: (c, t) => {
    snap(c, t);
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + 0.05 + i * 0.055, 0.22, 'sine', 0.14));
    noise(c, t + 0.05, 0.35, 6000, 0.08, 'highpass');
  },
  drawTwo: (c, t) => {
    snap(c, t, 1.1);
    tone(c, 330, t + 0.06, 0.12, 'triangle', 0.2, 220);
    tone(c, 330, t + 0.19, 0.14, 'triangle', 0.2, 196);
  },
  drawFour: (c, t) => {
    snap(c, t, 1.2);
    [392, 349, 311, 262].forEach((f, i) => tone(c, f, t + 0.06 + i * 0.08, 0.13, 'triangle', 0.2, f * 0.75));
    tone(c, 90, t + 0.06, 0.4, 'sine', 0.25, 50);
  },
  draw: (c, t) => {
    noise(c, t, 0.16, 800, 0.35, 'lowpass', 3000);
    tone(c, 220, t + 0.1, 0.06, 'sine', 0.12, 160);
  },
  colorPick: (c, t) => {
    tone(c, 880, t, 0.14, 'sine', 0.18);
    tone(c, 1320, t + 0.03, 0.18, 'sine', 0.12);
  },
  uno: (c, t) => {
    [784, 1047, 1319].forEach((f, i) => tone(c, f, t + i * 0.07, 0.2, 'square', 0.07));
    [784, 1047, 1319].forEach((f, i) => tone(c, f, t + i * 0.07, 0.24, 'sine', 0.12));
  },
  error: (c, t) => {
    tone(c, 150, t, 0.08, 'sawtooth', 0.09, 120);
    tone(c, 150, t + 0.1, 0.1, 'sawtooth', 0.09, 110);
  },
  turn: (c, t) => {
    tone(c, 740, t, 0.18, 'sine', 0.12);
    tone(c, 1108, t + 0.06, 0.22, 'sine', 0.07);
  },
  roundStart: (c, t) => {
    for (let i = 0; i < 7; i++) noise(c, t + i * 0.045, 0.04, 2000 + i * 150, 0.28);
  },
  victory: (c, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.1, 0.3, 'triangle', 0.16));
    [523, 659, 784].forEach((f) => tone(c, f, t + 0.45, 0.8, 'sine', 0.1));
  },
  defeat: (c, t) => {
    [392, 349, 311].forEach((f, i) => tone(c, f, t + i * 0.16, 0.34, 'triangle', 0.13, f * 0.97));
  },
  // Casino: a clay chip clicking on a stack.
  chip: (c, t) => {
    tone(c, 2600, t, 0.035, 'triangle', 0.12, 1900);
    noise(c, t, 0.04, 5200, 0.22);
    tone(c, 2300, t + 0.045, 0.03, 'triangle', 0.07, 1700);
  },
  // Roulette: ball rattling round the wheel, slowing down.
  wheel: (c, t) => {
    let at = t;
    for (let i = 0; i < 26; i++) {
      noise(c, at, 0.025, 3800 - i * 60, 0.16);
      at += 0.06 + i * i * 0.0009;
    }
  },
  // Slots: a reel locking into place.
  reelStop: (c, t) => {
    tone(c, 180, t, 0.09, 'square', 0.08, 90);
    noise(c, t, 0.05, 1400, 0.3, 'lowpass');
  },
  // Winnings paid out: a quick ringing run.
  cashIn: (c, t) => {
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(c, f, t + i * 0.06, 0.18, 'sine', 0.12));
    for (let i = 0; i < 5; i++) tone(c, 2600 + i * 120, t + 0.25 + i * 0.05, 0.05, 'triangle', 0.05);
  },
};

export function playSfx(name: SfxName, delaySeconds = 0): void {
  if (!enabled) return;
  const c = audio();
  if (!c || c.state !== 'running' || !master) return;
  try {
    SOUNDS[name](c, c.currentTime + 0.01 + delaySeconds);
  } catch {
    // audio is best-effort
  }
}

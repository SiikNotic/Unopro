// Background music: a small playlist played in random order, quiet by default, faded in and out,
// never started before the player has interacted with the page (browsers block that anyway). It pauses
// while the tab is hidden. Only one audio element ever exists.

export const TRACKS = ['audio/midnight-spins.mp3', 'audio/late-night-spins.mp3'];
const url = (track: string) => `${import.meta.env.BASE_URL}${track}`;

/** A random track, never the one that just played (when there is more than one). */
export function pickTrack(previous: number | null, random: () => number = Math.random): number {
  if (TRACKS.length < 2 || previous === null) return Math.floor(random() * TRACKS.length) % TRACKS.length;
  const next = Math.floor(random() * (TRACKS.length - 1)) % (TRACKS.length - 1);
  return next >= previous ? next + 1 : next;
}
/** Keeps the music well under the sound effects even at 100% on the slider. */
const MAX_GAIN = 0.55;
const FADE_MS = 1200;

/** Slider (0–1) → element volume. Squared so the low end of the slider stays gentle. */
export function musicGain(slider: number): number {
  const v = Math.min(1, Math.max(0, slider));
  return Math.round(v * v * MAX_GAIN * 1000) / 1000;
}

let audio: HTMLAudioElement | null = null;
let current: number | null = null;
let wanted = false; // music + sound on, volume > 0
let target = 0;
let unlocked = false;
/** True while a slot machine plays its own ambient music. */
let suspended = false;
let fadeFrame = 0;

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio();
    current = pickTrack(null);
    audio.src = url(TRACKS[current]);
    audio.loop = TRACKS.length < 2;
    audio.preload = 'none';
    audio.volume = 0;
    // When a track ends, another one (never the same twice in a row) starts at the current volume.
    audio.addEventListener('ended', () => {
      if (!audio) return;
      current = pickTrack(current);
      audio.src = url(TRACKS[current]);
      if (wanted && unlocked && !suspended && !document.hidden) void audio.play().catch(() => (unlocked = false));
    });
  }
  return audio;
}

function fadeTo(volume: number, then?: () => void) {
  const el = audio;
  if (!el) return;
  cancelAnimationFrame(fadeFrame);
  const from = el.volume;
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / FADE_MS);
    // Clamp: float rounding can land a hair outside [0, 1], which the element rejects with an error.
    el.volume = Math.min(1, Math.max(0, from + (volume - from) * p));
    if (p < 1) fadeFrame = requestAnimationFrame(step);
    else then?.();
  };
  fadeFrame = requestAnimationFrame(step);
}

function apply() {
  const playable = wanted && unlocked && !suspended && !document.hidden;
  if (playable) {
    const el = element();
    if (!el) return;
    if (el.paused) {
      el.volume = 0;
      el.play().then(
        () => fadeTo(target),
        () => {
          // Autoplay refused (no gesture yet): try again on the next tap.
          unlocked = false;
        }
      );
    } else {
      fadeTo(target);
    }
  } else if (audio && !audio.paused) {
    fadeTo(0, () => audio?.pause());
  }
}

/** Hands the stage to a machine's own ambient music (true) and back (false). */
export function suspendMusic(value: boolean): void {
  if (suspended === value) return;
  suspended = value;
  apply();
}

/** Called whenever the preferences change. */
export function configureMusic(options: { enabled: boolean; volume: number }): void {
  target = musicGain(options.volume);
  wanted = options.enabled && target > 0;
  apply();
}

/** Starts listening for the first gesture and for tab visibility. Returns a cleanup. */
export function installMusic(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onGesture = () => {
    if (unlocked) return;
    unlocked = true;
    apply();
  };
  const onVisibility = () => apply();
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    document.removeEventListener('visibilitychange', onVisibility);
    cancelAnimationFrame(fadeFrame);
    audio?.pause();
  };
}

// The bingo caller's voice: one recorded clip per ball (B-1 … O-75) in Spanish and English, under
// public/audio/bingo/{es,en}/{n}.mp3. Recorded clips work the same everywhere, including the Android app
// (whose WebView has no speech synthesis); the browser's speech synthesis is only a fallback if a clip
// can't be played. One audio element is reused, so a new ball always cuts the previous call short.

export type CallerLanguage = 'es' | 'en';

export const callUrl = (n: number, language: CallerLanguage) => `${import.meta.env.BASE_URL}audio/bingo/${language}/${n}.mp3`;

let voice: HTMLAudioElement | null = null;

function speakFallback(label: string, language: CallerLanguage, volume: number) {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(label);
    u.lang = language === 'es' ? 'es-ES' : 'en-US';
    u.volume = volume;
    speechSynthesis.speak(u);
  } catch {
    /* voices are optional */
  }
}

/** Calls a ball out loud. `label` is what the fallback speech says ("B, 12"). */
export function callBall(n: number, label: string, language: CallerLanguage, volume: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 75) return;
  if (typeof Audio === 'undefined') return speakFallback(label, language, volume);
  voice ??= new Audio();
  voice.pause();
  voice.src = callUrl(n, language);
  voice.volume = Math.min(1, Math.max(0, volume));
  void voice.play().catch(() => speakFallback(label, language, volume));
}

/** Silences the caller (leaving the hall). */
export function stopCaller(): void {
  voice?.pause();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

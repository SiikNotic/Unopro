// Sound design for the slot machines, on top of playSfx: one entry point per game event, with a minimum
// gap per sound so rapid events (five reels stopping, a count-up, a double tap) never stack into noise,
// and a single reel loop that can't be started twice. Everything respects the Sound setting (playSfx).
import { playSfx, startLoop } from './sfx';
import type { SfxName } from './sfx';

export type SlotSound = 'click' | 'spin' | 'reelStop' | 'anticipation' | 'coin' | 'small' | 'big' | 'mega' | 'jackpot' | 'error';

const MAP: Record<SlotSound, SfxName> = {
  click: 'spinClick',
  spin: 'lever',
  reelStop: 'reelStop',
  anticipation: 'anticipation',
  coin: 'coin',
  small: 'winSmall',
  big: 'bigWin',
  mega: 'megaWin',
  jackpot: 'jackpot',
  error: 'error',
};

/** Minimum ms between two plays of the same sound. */
export const MIN_GAP_MS: Record<SlotSound, number> = {
  click: 80,
  spin: 250,
  reelStop: 45,
  anticipation: 900,
  coin: 75,
  small: 500,
  big: 2000,
  mega: 3000,
  jackpot: 5000,
  error: 400,
};

const WIN_SOUNDS: SlotSound[] = ['small', 'big', 'mega', 'jackpot'];
const last = new Map<SlotSound, number>();
let stopReels: (() => void) | null = null;

/** Plays a slot sound unless the same one just played. Returns whether it played. */
export function slotSound(name: SlotSound, now = performance.now()): boolean {
  const prev = last.get(name);
  if (prev !== undefined && now - prev < MIN_GAP_MS[name]) return false;
  // Only one win fanfare at a time: a bigger one replaces the gap of the smaller ones.
  if (WIN_SOUNDS.includes(name)) for (const w of WIN_SOUNDS) last.set(w, now);
  else last.set(name, now);
  playSfx(MAP[name]);
  return true;
}

/** Starts the reel whirr (idempotent). */
export function startReelLoop(): void {
  stopReels ??= startLoop('reels');
}

export function stopReelLoop(): void {
  stopReels?.();
  stopReels = null;
}

/** For tests. */
export function resetSlotAudio(): void {
  last.clear();
  stopReelLoop();
}

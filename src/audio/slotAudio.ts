// Slot machine sound: one entry point per game event, played with the machine's own profile, with a
// minimum gap per event so rapid events (five reels stopping, a count-up, a double tap) never stack
// into noise, and a single reel loop that can't be started twice. Everything respects the Sound switch.
import type { MachineId } from '@/casino/premium/engine';
import { startLoop, withAudio } from './sfx';
import { PROFILES } from './machineSounds';
import type { SlotEvent } from './machineSounds';

export type { SlotEvent };

/** Minimum ms between two plays of the same event. */
export const MIN_GAP_MS: Record<SlotEvent, number> = {
  click: 80,
  spin: 250,
  reelStop: 45,
  anticipation: 900,
  coin: 75,
  small: 500,
  big: 2000,
  mega: 3000,
  jackpot: 5000,
  feature: 1500,
  reveal: 120,
  error: 400,
};

const WIN_EVENTS: SlotEvent[] = ['small', 'big', 'mega', 'jackpot'];
const last = new Map<SlotEvent, number>();
let stopReels: (() => void) | null = null;

/** Plays a machine's sound for an event unless the same event just played. Returns whether it played. */
export function slotSound(machine: MachineId, event: SlotEvent, now = performance.now()): boolean {
  const prev = last.get(event);
  if (prev !== undefined && now - prev < MIN_GAP_MS[event]) return false;
  // Only one win fanfare at a time.
  if (WIN_EVENTS.includes(event)) for (const w of WIN_EVENTS) last.set(w, now);
  else last.set(event, now);
  withAudio((c, bus, noise, t) => PROFILES[machine][event]({ c, bus, noise }, t));
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

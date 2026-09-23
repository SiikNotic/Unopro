import { Droplet, Flame, Leaf, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CardColor } from '@/game/engine';

/** Visual identity per color: a CSS class and a suit icon so color is never the only cue. */
export const COLOR_THEME: Record<CardColor, { className: string; Icon: LucideIcon; labelKey: string }> = {
  RED: { className: 'pc-red', Icon: Flame, labelKey: 'cards.colors.RED' },
  YELLOW: { className: 'pc-yellow', Icon: Sun, labelKey: 'cards.colors.YELLOW' },
  GREEN: { className: 'pc-green', Icon: Leaf, labelKey: 'cards.colors.GREEN' },
  BLUE: { className: 'pc-blue', Icon: Droplet, labelKey: 'cards.colors.BLUE' },
};

/** Small deterministic hash so piles get stable "messy" rotations without randomness in render. */
export function hashTilt(id: string, range = 10): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * range;
}

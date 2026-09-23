import { Droplet, Flame, Leaf, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CardColor } from '@/game/engine';
import { SUIT_PATHS } from './suitPaths';

/** Visual identity per color: a CSS class, a suit (never color alone) and its i18n label. */
export const COLOR_THEME: Record<CardColor, { className: string; Icon: LucideIcon; labelKey: string }> = {
  RED: { className: 'pc-red', Icon: Flame, labelKey: 'cards.colors.RED' },
  YELLOW: { className: 'pc-yellow', Icon: Sun, labelKey: 'cards.colors.YELLOW' },
  GREEN: { className: 'pc-green', Icon: Leaf, labelKey: 'cards.colors.GREEN' },
  BLUE: { className: 'pc-blue', Icon: Droplet, labelKey: 'cards.colors.BLUE' },
};

const patternCache = new Map<string, string>();

/** Faint tiled suit pattern for a card face (doubles as a color-independent cue). */
export function suitPattern(color: CardColor): string {
  let url = patternCache.get(color);
  if (!url) {
    const path = SUIT_PATHS[color];
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><g fill='white' fill-opacity='0.1'><path transform='translate(2 2) scale(0.5)' d='${path}'/><path transform='translate(22 22) scale(0.5)' d='${path}'/></g></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    patternCache.set(color, url);
  }
  return url;
}

/** Small deterministic hash so piles get stable "messy" rotations without randomness in render. */
export function hashTilt(id: string, range = 10): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * range;
}

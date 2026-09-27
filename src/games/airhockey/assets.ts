// AIR HOCKEY art by the project owner (native size, lossless WebP): the table, the mallets, the puck and the screen's
// backdrop. Loaded when present; the game draws stand-ins for anything missing.
const files = import.meta.glob('./assets/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const art = (name: string): string | undefined => files[`./assets/${name}.webp`];

export const HOCKEY_ART = {
  table: art('table'),
  malletRed: art('mallet-red'),
  malletBlue: art('mallet-blue'),
  puck: art('puck'),
  background: art('bg'),
};

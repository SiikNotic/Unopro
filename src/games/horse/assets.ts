// The owner's painted art for Horse Racing (backgrounds, portraits, grandstand, trophy), picked up automatically when
// the files are in src/games/horse/assets/ (native size, lossless WebP). Until a file exists the game draws its own
// placeholder, so the game works with any subset of the art.
const files = import.meta.glob('./assets/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const art = (name: string): string | undefined => files[`./assets/${name}.webp`];

export const HORSE_ART = {
  backgroundPortrait: art('bg-portrait'),
  backgroundLandscape: art('bg-landscape'),
  grandstand: art('grandstand'),
  trophy: art('trophy'),
  portrait: (n: number) => art(`horse-0${n}`),
};

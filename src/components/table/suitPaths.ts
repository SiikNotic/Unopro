import type { CardColor } from '@/game/engine';

/** Filled suit shapes on a 24×24 grid, all built from the same rounded geometry. */
export const SUIT_PATHS: Record<CardColor, string> = {
  // Flame
  RED: 'M12 1.8c1.6 3.4 6.3 6.1 6.3 12a6.3 6.3 0 0 1-12.6 0c0-2.6 1.1-4.6 2.6-6 .1 2 .9 3.4 2.2 4-.1-3.7.4-7.1 1.5-10z',
  // Sun (eight-point star)
  YELLOW:
    'M12 1.5l1.9 4.9 4.9-1.9-1.9 4.9 4.9 2.6-4.9 2.6 1.9 4.9-4.9-1.9L12 22.5l-1.9-4.9-4.9 1.9 1.9-4.9L2.2 12l4.9-2.6-1.9-4.9 4.9 1.9z',
  // Leaf
  GREEN: 'M20.5 3.5C11.2 3.5 4.5 8.4 4.5 15.4c0 2 .5 3.6 1.3 5 1.1-3.8 3.8-7.4 8-9.8-3.4 3-5.5 6.4-6.1 10.3 1.2.6 2.7 1 4.3 1 5.8 0 8.5-5.6 8.5-12.8z',
  // Drop
  BLUE: 'M12 1.8c3.6 5 7 8.9 7 13a7 7 0 0 1-14 0c0-4.1 3.4-8 7-13z',
};

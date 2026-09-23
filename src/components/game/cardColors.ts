import type { CardColor } from '@/game/engine';

// Placeholder card rendering for the test table — the final card design comes in a later phase.
export const COLOR_CLASSES: Record<CardColor | 'WILD', string> = {
  RED: 'bg-red-600 text-white',
  YELLOW: 'bg-yellow-400 text-ink-950',
  GREEN: 'bg-green-600 text-white',
  BLUE: 'bg-blue-600 text-white',
  WILD: 'bg-gradient-to-br from-red-600 via-yellow-400 to-blue-600 text-white',
};

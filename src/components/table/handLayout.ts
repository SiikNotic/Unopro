// Fan layout for the player's hand. Pure: always fits the available width — the hand never scrolls.

export interface HandLayout {
  cardWidth: number;
  /** Horizontal distance between consecutive cards. */
  step: number;
  /** Total width of the fan (≤ available width). */
  width: number;
  /** Rotation in degrees for each card, left to right. */
  angles: number[];
  /** Vertical drop in px for each card (arc). */
  drops: number[];
}

const MIN_CARD = 44;
/** Minimum visible slice of an overlapped card, as a fraction of its width, before we shrink cards. */
const MIN_SLICE = 0.3;
const MAX_SLICE = 0.7;

export function computeHandLayout(count: number, available: number, preferredCardWidth: number): HandLayout {
  const n = Math.max(0, count);
  const space = Math.max(MIN_CARD, available);
  let cardWidth = Math.min(preferredCardWidth, space);

  if (n > 1) {
    // Shrink cards only when even the tightest comfortable overlap would not fit.
    const needed = cardWidth + (n - 1) * cardWidth * MIN_SLICE;
    if (needed > space) cardWidth = Math.max(MIN_CARD, space / (1 + (n - 1) * MIN_SLICE));
  }
  cardWidth = Math.min(cardWidth, space);

  const step = n > 1 ? Math.min(cardWidth * MAX_SLICE, (space - cardWidth) / (n - 1)) : 0;
  const width = n > 0 ? cardWidth + step * (n - 1) : 0;

  // Wider spread for few cards, flatter for many; the arc keeps the edges low like a real fan.
  const spread = n > 1 ? Math.min(3.4, 34 / n) : 0;
  const angles: number[] = [];
  const drops: number[] = [];
  for (let i = 0; i < n; i++) {
    const offset = i - (n - 1) / 2;
    angles.push(offset * spread);
    drops.push(Math.min(cardWidth * 0.14, offset * offset * spread * 0.18));
  }
  return { cardWidth, step, width, angles, drops };
}

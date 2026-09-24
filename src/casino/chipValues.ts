// Chip denominations and their colours, shared by the casino screens.

export const CHIP_VALUES = [10, 25, 50, 100, 500] as const;

const CHIP_COLORS: Record<number, string> = { 10: '#2563eb', 25: '#15a36a', 50: '#d4303f', 100: '#23232e', 500: '#7c3aed' };

/** Colour of the largest chip that fits in `value` (a stack shows its biggest chip). */
export function chipColor(value: number): string {
  const match = [...CHIP_VALUES].reverse().find((v) => value >= v) ?? 10;
  return CHIP_COLORS[match];
}

export function formatChips(n: number): string {
  // From 999,500 up, rounding to thousands would print "1000k": switch to millions instead.
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

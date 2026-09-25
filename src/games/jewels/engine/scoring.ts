// Every number the score is made of, in one place. The engine adds them up; nothing else hard-codes points.
export const SCORE = {
  /** A match, by the length of its longest line. */
  match: { 3: 100, 4: 250, 5: 500 } as Record<3 | 4 | 5, number>,
  /** A T or an L (it makes a Temple). */
  corner: 400,
  /** Each jewel a special clears beyond the matched ones. */
  extra: 20,
  /** Each special that goes off. */
  activation: 60,
  /** Two specials swapped together (or a Trident with anything). */
  combo: 300,
  /** Each hit on a marble seal, and each crystal broken. */
  stone: 40,
  ice: 30,
  /** Cascades: the n-th clear of a move scores ×(1 + cascadeStep·(n−1)) plus cascadeBonus·(n−1). */
  cascadeStep: 0.5,
  cascadeBonus: 50,
  /** Per move left when the level is won. */
  moveLeft: 200,
};

/** Points for one matched group (its length, or a T / L). */
export function groupPoints(size: number, corner: boolean): number {
  if (corner) return SCORE.corner;
  return SCORE.match[Math.min(5, Math.max(3, size)) as 3 | 4 | 5];
}

/** The multiplier and flat bonus of the n-th clear of a move. */
export function cascadeFactor(cascade: number): { mult: number; bonus: number } {
  const n = Math.max(1, cascade);
  return { mult: 1 + SCORE.cascadeStep * (n - 1), bonus: SCORE.cascadeBonus * (n - 1) };
}


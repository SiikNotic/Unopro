// Texas Hold'em hand evaluation: the best 5 of up to 7 cards, as one comparable number.
// Reuses the casino's French-suited cards (src/casino/cards.ts).
import type { PlayingCard, Rank } from '@/casino/cards';

export const RANK_VALUE: Record<Rank, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

export const CATEGORIES = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush', 'royalFlush'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface HandValue {
  /** Higher is better; equal scores split the pot. */
  score: number;
  category: Category;
  /** The five cards that make the hand. */
  cards: PlayingCard[];
}

// category (0–9) then up to five kickers, each 0–14, packed in base 15.
const pack = (cat: number, kick: number[]) => kick.slice(0, 5).reduce((s, v, i) => s + v * 15 ** (4 - i), cat * 15 ** 5);

/** Highest straight in a set of rank values (5 for the wheel A-2-3-4-5), or 0. */
function straightHigh(values: Set<number>): number {
  const has = (v: number) => values.has(v === 1 ? 14 : v);
  for (let hi = 14; hi >= 5; hi--) {
    let ok = true;
    for (let k = 0; k < 5 && ok; k++) ok = has(hi - k);
    if (ok) return hi;
  }
  return 0;
}

const straightCards = (cards: PlayingCard[], hi: number) => {
  const want = hi === 5 ? [5, 4, 3, 2, 14] : [hi, hi - 1, hi - 2, hi - 3, hi - 4];
  return want.map((v) => cards.find((c) => RANK_VALUE[c.rank] === v)!);
};

export function evaluate(cards: PlayingCard[]): HandValue {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  const sorted = cards.slice().sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  const bySuit = new Map<string, PlayingCard[]>();
  for (const c of sorted) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
  const flushCards = [...bySuit.values()].find((s) => s.length >= 5);

  if (flushCards) {
    const hi = straightHigh(new Set(flushCards.map((c) => RANK_VALUE[c.rank])));
    if (hi) return { score: pack(hi === 14 ? 9 : 8, [hi]), category: hi === 14 ? 'royalFlush' : 'straightFlush', cards: straightCards(flushCards, hi) };
  }

  const groups = new Map<number, PlayingCard[]>();
  for (const c of sorted) groups.set(RANK_VALUE[c.rank], [...(groups.get(RANK_VALUE[c.rank]) ?? []), c]);
  // Biggest groups first, then higher rank.
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const kickersFrom = (used: PlayingCard[], n: number) => sorted.filter((c) => !used.includes(c)).slice(0, n);

  const [top, second] = ordered;
  if (top[1].length === 4) {
    const k = kickersFrom(top[1], 1);
    return { score: pack(7, [top[0], ...k.map((c) => RANK_VALUE[c.rank])]), category: 'quads', cards: [...top[1], ...k] };
  }
  if (top[1].length === 3 && second && second[1].length >= 2) {
    return { score: pack(6, [top[0], second[0]]), category: 'fullHouse', cards: [...top[1], ...second[1].slice(0, 2)] };
  }
  if (flushCards) {
    const five = flushCards.slice(0, 5);
    return { score: pack(5, five.map((c) => RANK_VALUE[c.rank])), category: 'flush', cards: five };
  }
  const hi = straightHigh(new Set(sorted.map((c) => RANK_VALUE[c.rank])));
  if (hi) return { score: pack(4, [hi]), category: 'straight', cards: straightCards(sorted, hi) };
  if (top[1].length === 3) {
    const k = kickersFrom(top[1], 2);
    return { score: pack(3, [top[0], ...k.map((c) => RANK_VALUE[c.rank])]), category: 'trips', cards: [...top[1], ...k] };
  }
  if (top[1].length === 2 && second && second[1].length === 2) {
    const k = kickersFrom([...top[1], ...second[1]], 1);
    return { score: pack(2, [top[0], second[0], ...k.map((c) => RANK_VALUE[c.rank])]), category: 'twoPair', cards: [...top[1], ...second[1], ...k] };
  }
  if (top[1].length === 2) {
    const k = kickersFrom(top[1], 3);
    return { score: pack(1, [top[0], ...k.map((c) => RANK_VALUE[c.rank])]), category: 'pair', cards: [...top[1], ...k] };
  }
  const five = sorted.slice(0, 5);
  return { score: pack(0, five.map((c) => RANK_VALUE[c.rank])), category: 'highCard', cards: five };
}

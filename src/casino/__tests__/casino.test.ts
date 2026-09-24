import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/engine';
import type { PlayingCard, Rank } from '../cards';
import { createShoe, shuffle } from '../cards';
import * as bj from '../blackjack';
import * as roulette from '../roulette';
import * as slots from '../slots';
import { canRefill, MIN_BET, normalizeBalance, STARTING_CHIPS } from '../wallet';

let uid = 0;
const c = (rank: Rank, suit: PlayingCard['suit'] = 'S'): PlayingCard => ({ id: `t${uid++}`, rank, suit });

/** A table whose shoe starts with the given cards (deal order: player, dealer, player, dealer, …). */
function rigged(ranks: Rank[]): bj.BlackjackState {
  const base = bj.createBlackjack(1);
  return { ...base, shoe: [...ranks.map((r) => c(r)), ...createShoe(2)] };
}

describe('cards', () => {
  it('builds full shoes and shuffles deterministically', () => {
    expect(createShoe(6)).toHaveLength(312);
    const a = shuffle(createShoe(1), createRng(7)).map((x) => x.id);
    const b = shuffle(createShoe(1), createRng(7)).map((x) => x.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(52);
  });
});

describe('blackjack totals', () => {
  it('counts aces as 11 or 1', () => {
    expect(bj.handTotal([c('A'), c('6')])).toEqual({ total: 17, soft: true });
    expect(bj.handTotal([c('A'), c('6'), c('9')])).toEqual({ total: 16, soft: false });
    expect(bj.handTotal([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true });
    expect(bj.handTotal([c('K'), c('Q'), c('2')]).total).toBe(22);
    expect(bj.isBlackjack([c('A'), c('J')])).toBe(true);
    expect(bj.isBlackjack([c('7'), c('7'), c('7')])).toBe(false);
  });
});

describe('blackjack rounds', () => {
  it('pays a natural 3:2 at once', () => {
    const s = bj.deal(rigged(['A', '9', 'K', '7']), 100);
    expect(s.phase).toBe('SETTLED');
    expect(s.results[0]).toEqual({ outcome: 'blackjack', payout: 250 });
  });

  it('pushes when both have a natural, loses to a dealer natural', () => {
    expect(bj.deal(rigged(['A', 'A', 'K', 'Q']), 50).results[0].outcome).toBe('push');
    const s = bj.deal(rigged(['9', 'A', '9', 'K']), 50);
    expect(s.results[0]).toEqual({ outcome: 'lose', payout: 0 });
  });

  it('busting loses without the dealer drawing', () => {
    let s = bj.deal(rigged(['K', '9', '6', '5', 'Q']), 20);
    expect(s.phase).toBe('PLAYER');
    s = bj.hit(s);
    expect(s.phase).toBe('SETTLED');
    expect(s.dealer).toHaveLength(2);
    expect(s.results[0].outcome).toBe('lose');
  });

  it('dealer draws to 17 and stands on soft 17', () => {
    // Player 10+9=19. Dealer 6+A = soft 17: must stand.
    let s = bj.stand(bj.deal(rigged(['10', '6', '9', 'A']), 10));
    expect(s.dealer).toHaveLength(2);
    expect(s.results[0]).toEqual({ outcome: 'win', payout: 20 });
    // Dealer 10+6=16 draws a 5 → 21 and beats 19.
    s = bj.stand(bj.deal(rigged(['10', '10', '9', '6', '5']), 10));
    expect(bj.handTotal(s.dealer).total).toBe(21);
    expect(s.results[0].outcome).toBe('lose');
  });

  it('doubling doubles the bet and takes exactly one card', () => {
    let s = bj.deal(rigged(['6', '10', '5', '7', '10']), 40);
    expect(bj.canDouble(s)).toBe(true);
    expect(bj.extraStake(s, 'double')).toBe(40);
    s = bj.double(s);
    expect(s.hands[0].cards).toHaveLength(3);
    expect(s.hands[0].bet).toBe(80);
    expect(s.results[0]).toEqual({ outcome: 'win', payout: 160 });
  });

  it('splits a pair into two hands; 21 after a split is not a natural', () => {
    // Player 8,8 vs dealer 10,7. Split hands get 3 and A → 11 and 19... then play them.
    let s = bj.deal(rigged(['8', '10', '8', '7', '3', 'A', 'K']), 25);
    expect(bj.canSplit(s)).toBe(true);
    expect(bj.extraStake(s, 'split')).toBe(25);
    s = bj.split(s);
    expect(s.hands).toHaveLength(2);
    expect(s.hands.map((h) => h.bet)).toEqual([25, 25]);
    expect(bj.canSplit(s)).toBe(false);
    s = bj.hit(s); // 8+3+K = 21 → hand done, move to second hand
    expect(s.active).toBe(1);
    s = bj.stand(s); // 8+A = 19
    expect(s.phase).toBe('SETTLED');
    expect(s.results.map((r) => r.outcome)).toEqual(['win', 'win']);
    expect(bj.totalPayout(s)).toBe(100);

    const aces = bj.split(bj.deal(rigged(['A', '9', 'A', '9', 'K', '5']), 10));
    expect(aces.phase).toBe('SETTLED'); // split aces take one card each
    expect(aces.results[0]).toEqual({ outcome: 'win', payout: 20 });
  });

  it('ignores actions outside the player phase and conserves the shoe', () => {
    const s0 = bj.createBlackjack(3);
    expect(bj.hit(s0)).toBe(s0);
    expect(bj.canDeal(s0, 0)).toBe(false);
    const s1 = bj.deal(s0, 10);
    const used = s1.hands[0].cards.length + s1.dealer.length;
    expect(s1.shoe.length + used).toBe(312);
  });

  it('is deterministic for a seed', () => {
    const play = () => bj.stand(bj.deal(bj.createBlackjack(99), 10));
    expect(play()).toEqual(play());
  });
});

describe('roulette', () => {
  it('pays each bet type correctly (stake included)', () => {
    expect(roulette.betPayout({ type: 'straight', value: 17, amount: 10 }, 17)).toBe(360);
    expect(roulette.betPayout({ type: 'red', amount: 10 }, 1)).toBe(20);
    expect(roulette.betPayout({ type: 'black', amount: 10 }, 1)).toBe(0);
    expect(roulette.betPayout({ type: 'dozen', value: 3, amount: 10 }, 36)).toBe(30);
    expect(roulette.betPayout({ type: 'column', value: 1, amount: 10 }, 34)).toBe(30);
    expect(roulette.betPayout({ type: 'low', amount: 10 }, 18)).toBe(20);
    expect(roulette.betPayout({ type: 'high', amount: 10 }, 19)).toBe(20);
  });

  it('zero loses every outside bet and pays a straight on zero', () => {
    for (const type of ['red', 'black', 'even', 'odd', 'low', 'high'] as const) expect(roulette.betWins({ type, amount: 1 }, 0)).toBe(false);
    expect(roulette.betWins({ type: 'dozen', value: 1, amount: 1 }, 0)).toBe(false);
    expect(roulette.betPayout({ type: 'straight', value: 0, amount: 5 }, 0)).toBe(180);
    expect(roulette.pocketColor(0)).toBe('green');
  });

  it('has a proper wheel and a 1/37 house edge on every bet', () => {
    expect(new Set(roulette.WHEEL_ORDER).size).toBe(37);
    expect(roulette.RED_NUMBERS.size).toBe(18);
    const bets: roulette.Bet[] = [
      { type: 'straight', value: 5, amount: 1 },
      { type: 'red', amount: 1 },
      { type: 'odd', amount: 1 },
      { type: 'dozen', value: 2, amount: 1 },
      { type: 'column', value: 3, amount: 1 },
    ];
    for (const bet of bets) {
      let back = 0;
      for (let n = 0; n < 37; n++) back += roulette.betPayout(bet, n);
      expect(back / 37).toBeCloseTo(36 / 37, 10);
    }
  });

  it('spins within range', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const n = roulette.spin(rng);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(37);
    }
  });
});

describe('slots (5 reels)', () => {
  it('uses a 39-stop strip with the intended weights', () => {
    const count = (sym: slots.SlotSymbol) => slots.REEL.filter((x) => x === sym).length;
    expect(slots.REEL).toHaveLength(39);
    expect([count('seven'), count('gold'), count('eagle'), count('star'), count('cactus')]).toEqual([1, 2, 2, 3, 6]);
    expect(slots.LINES).toHaveLength(10);
    for (const line of slots.LINES) expect(line.every((r) => r >= 0 && r < 3)).toBe(true);
  });

  it('pays left to right with wilds substituting', () => {
    expect(slots.evaluateLine(['seven', 'seven', 'seven', 'seven', 'seven'])).toEqual({ symbol: 'seven', count: 5, multiplier: 2500 });
    expect(slots.evaluateLine(['cactus', 'cactus', 'cactus', 'hat', 'cactus'])).toEqual({ symbol: 'cactus', count: 3, multiplier: 4 });
    expect(slots.evaluateLine(['star', 'eagle', 'star', 'eagle', 'hat'])).toEqual({ symbol: 'eagle', count: 4, multiplier: 100 });
    expect(slots.evaluateLine(['hat', 'cactus', 'cactus', 'cactus', 'cactus'])).toBeNull();
    expect(slots.evaluateLine(['bison', 'bison', 'hat', 'bison', 'bison'])).toBeNull();
    // A wild run pays as itself when that is worth more.
    expect(slots.evaluateLine(['star', 'star', 'star', 'cactus', 'hat'])).toEqual({ symbol: 'star', count: 3, multiplier: 40 });
    expect(slots.evaluateLine(['star', 'star', 'star', 'star', 'star'])).toEqual({ symbol: 'star', count: 5, multiplier: 1000 });
  });

  it('only pays active lines and multiplies by the bet per line', () => {
    const stop = slots.REEL.indexOf('seven');
    const allSevens = [stop, stop, stop, stop, stop];
    const one = slots.evaluateSpin(allSevens, 1, 2);
    expect(one.wins).toHaveLength(1);
    expect(one.total).toBe(5000);
    expect(one.jackpot).toBe(true);
    expect(slots.winCells(one.wins[0])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]]);
    const ten = slots.evaluateSpin(allSevens, 10, 1);
    expect(ten.wins.length).toBeGreaterThanOrEqual(1);
    expect(ten.wins.every((w) => w.line < 10)).toBe(true);
  });

  it('returns between 90% and 100% to the player', () => {
    const rtp = slots.returnToPlayer();
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(1);
  });

  it('keeps long-run results close to the exact return', () => {
    const rng = createRng(2024);
    let bet = 0;
    let back = 0;
    for (let i = 0; i < 60000; i++) {
      back += slots.evaluateSpin(slots.spinReels(rng), 10, 1).total;
      bet += 10;
    }
    expect(back / bet).toBeGreaterThan(0.8);
    expect(back / bet).toBeLessThan(1.1);
  });

  it('shows three rows per reel and wraps the strip', () => {
    const grid = slots.visibleGrid([0, 1, 2, 3, 38]);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([slots.REEL[38], slots.REEL[0], slots.REEL[1]]);
    expect(grid[4][2]).toBe(slots.REEL[0]);
  });
});

describe('wallet', () => {
  it('normalizes stored balances', () => {
    expect(normalizeBalance(null)).toBe(STARTING_CHIPS);
    expect(normalizeBalance('500')).toBe(STARTING_CHIPS);
    expect(normalizeBalance(-3)).toBe(STARTING_CHIPS);
    expect(normalizeBalance(Number.NaN)).toBe(STARTING_CHIPS);
    expect(normalizeBalance(250.7)).toBe(250);
    expect(normalizeBalance(0)).toBe(0);
  });

  it('offers a refill only when broke', () => {
    expect(canRefill(MIN_BET - 1)).toBe(true);
    expect(canRefill(MIN_BET)).toBe(false);
  });
});

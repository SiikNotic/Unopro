// Blackjack engine. Pure: every function returns a new state. Rules:
// 6 decks, dealer stands on soft 17, blackjack pays 3:2, double on any first two cards,
// one split per round (split aces get one card each), dealer peeks for blackjack, no insurance.
import type { Rng } from '@/game/engine';
import { createRng } from '@/game/engine';
import type { PlayingCard } from './cards';
import { createShoe, shuffle } from './cards';

export type Phase = 'BETTING' | 'PLAYER' | 'SETTLED';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose';

export interface Hand {
  cards: PlayingCard[];
  bet: number;
  done: boolean;
  doubled: boolean;
  fromSplit: boolean;
}

export interface HandResult {
  outcome: Outcome;
  /** Chips credited back (stake included). */
  payout: number;
}

export interface BlackjackState {
  phase: Phase;
  shoe: PlayingCard[];
  rngState: number;
  hands: Hand[];
  active: number;
  dealer: PlayingCard[];
  results: HandResult[];
}

const DECKS = 6;
const RESHUFFLE_BELOW = 52;

export function cardValue(card: PlayingCard): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

/** Best total ≤ 21 when possible; `soft` means an ace still counts as 11. */
export function handTotal(cards: PlayingCard[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: PlayingCard[]) => cards.length === 2 && handTotal(cards).total === 21;
export const isBust = (cards: PlayingCard[]) => handTotal(cards).total > 21;

export function createBlackjack(seed: number): BlackjackState {
  const rng = createRng(seed);
  const shoe = shuffle(createShoe(DECKS), rng);
  return { phase: 'BETTING', shoe, rngState: rng.state(), hands: [], active: 0, dealer: [], results: [] };
}

function draw(s: BlackjackState, rng: Rng): PlayingCard {
  if (s.shoe.length === 0) s.shoe = shuffle(createShoe(DECKS), rng);
  return s.shoe.shift()!;
}

function clone(s: BlackjackState): BlackjackState {
  return { ...s, shoe: [...s.shoe], hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })), dealer: [...s.dealer], results: [...s.results] };
}

function withRng(state: BlackjackState, fn: (s: BlackjackState, rng: Rng) => void): BlackjackState {
  const s = clone(state);
  const rng = createRng(s.rngState);
  fn(s, rng);
  s.rngState = rng.state();
  return s;
}

export function canDeal(s: BlackjackState, bet: number): boolean {
  return (s.phase === 'BETTING' || s.phase === 'SETTLED') && bet > 0;
}

/** Starts a round. The caller has already taken `bet` from the wallet. */
export function deal(state: BlackjackState, bet: number): BlackjackState {
  if (!canDeal(state, bet)) return state;
  return withRng(state, (s, rng) => {
    if (s.shoe.length < RESHUFFLE_BELOW) s.shoe = shuffle(createShoe(DECKS), rng);
    const hand: Hand = { cards: [], bet, done: false, doubled: false, fromSplit: false };
    s.dealer = [];
    s.results = [];
    hand.cards.push(draw(s, rng));
    s.dealer.push(draw(s, rng));
    hand.cards.push(draw(s, rng));
    s.dealer.push(draw(s, rng));
    s.hands = [hand];
    s.active = 0;
    s.phase = 'PLAYER';
    // Naturals end the round at once (dealer peeks).
    if (isBlackjack(hand.cards) || isBlackjack(s.dealer)) {
      hand.done = true;
      settle(s);
    }
  });
}

function advance(s: BlackjackState, rng: Rng) {
  const next = s.hands.findIndex((h) => !h.done);
  if (next >= 0) {
    s.active = next;
    return;
  }
  if (s.hands.some((h) => !isBust(h.cards))) {
    // Dealer draws to 17 and stands on soft 17.
    while (handTotal(s.dealer).total < 17) s.dealer.push(draw(s, rng));
  }
  settle(s);
}

export function outcomeFor(hand: Hand, dealer: PlayingCard[]): HandResult {
  const player = handTotal(hand.cards).total;
  const dealerTotal = handTotal(dealer).total;
  const natural = isBlackjack(hand.cards) && !hand.fromSplit;
  const dealerNatural = isBlackjack(dealer);
  if (natural && !dealerNatural) return { outcome: 'blackjack', payout: hand.bet + Math.floor(hand.bet * 1.5) };
  if (dealerNatural) return natural ? { outcome: 'push', payout: hand.bet } : { outcome: 'lose', payout: 0 };
  if (player > 21) return { outcome: 'lose', payout: 0 };
  if (dealerTotal > 21 || player > dealerTotal) return { outcome: 'win', payout: hand.bet * 2 };
  if (player === dealerTotal) return { outcome: 'push', payout: hand.bet };
  return { outcome: 'lose', payout: 0 };
}

function settle(s: BlackjackState) {
  s.results = s.hands.map((h) => outcomeFor(h, s.dealer));
  s.phase = 'SETTLED';
}

export function totalPayout(s: BlackjackState): number {
  return s.results.reduce((sum, r) => sum + r.payout, 0);
}

const activeHand = (s: BlackjackState) => (s.phase === 'PLAYER' ? s.hands[s.active] : undefined);

export function hit(state: BlackjackState): BlackjackState {
  if (!activeHand(state)) return state;
  return withRng(state, (s, rng) => {
    const hand = s.hands[s.active];
    hand.cards.push(draw(s, rng));
    if (handTotal(hand.cards).total >= 21) {
      hand.done = true;
      advance(s, rng);
    }
  });
}

export function stand(state: BlackjackState): BlackjackState {
  if (!activeHand(state)) return state;
  return withRng(state, (s, rng) => {
    s.hands[s.active].done = true;
    advance(s, rng);
  });
}

export function canDouble(s: BlackjackState): boolean {
  const hand = activeHand(s);
  return !!hand && hand.cards.length === 2 && !hand.doubled;
}

/** Doubles the bet (the caller takes the extra stake from the wallet), takes exactly one card. */
export function double(state: BlackjackState): BlackjackState {
  if (!canDouble(state)) return state;
  return withRng(state, (s, rng) => {
    const hand = s.hands[s.active];
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(draw(s, rng));
    hand.done = true;
    advance(s, rng);
  });
}

export function canSplit(s: BlackjackState): boolean {
  const hand = activeHand(s);
  return !!hand && s.hands.length === 1 && hand.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
}

/** Splits a pair into two hands with the same bet each (the caller takes the second stake). */
export function split(state: BlackjackState): BlackjackState {
  if (!canSplit(state)) return state;
  return withRng(state, (s, rng) => {
    const [a, b] = s.hands[0].cards;
    const bet = s.hands[0].bet;
    const aces = a.rank === 'A';
    s.hands = [a, b].map((card) => {
      const hand: Hand = { cards: [card, draw(s, rng)], bet, done: aces, doubled: false, fromSplit: true };
      if (handTotal(hand.cards).total === 21) hand.done = true;
      return hand;
    });
    s.active = 0;
    advance(s, rng);
  });
}

/** Extra chips an action needs from the wallet. */
export function extraStake(s: BlackjackState, action: 'double' | 'split'): number {
  const hand = activeHand(s);
  if (!hand) return 0;
  return action === 'double' ? hand.bet : s.hands[0].bet;
}

// No-Limit Texas Hold'em with virtual chips only. Pure and deterministic: a table + a seed replays the
// same. The deck and every private card live only in this state; players (and bots) get pokerView().
//
// Rules: blinds (heads-up: the button posts the small blind and acts first preflop, last after), minimum
// raise = the last full raise (at least the big blind), an all-in short of a full raise doesn't reopen the
// betting for players who already acted, side pots for all-ins, ties split (odd chip to the first winner
// left of the button).
import type { PlayingCard } from '@/casino/cards';
import { createShoe } from '@/casino/cards';
import { createRng, shuffle } from '@/games/shared/rng';
import type { Category } from './evaluate';
import { evaluate } from './evaluate';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase = 'betting' | 'handOver' | 'gameOver';

export interface PokerPlayer {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  /** Chips behind (not yet in the pot). */
  stack: number;
  hole: PlayingCard[];
  /** Chips put in on this street. */
  bet: number;
  /** Chips put in this hand (all streets). */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Busted before this hand: not dealt in. */
  out: boolean;
  /** Value of `fullRaises` when this player last acted on this street (-1: hasn't acted). */
  acted: number;
}

export interface PotResult {
  amount: number;
  winners: string[];
  /** Winning hand (absent when everyone else folded). */
  category?: Category;
  cards?: string[];
}

export interface HandResult {
  handNo: number;
  pots: PotResult[];
  showdown: boolean;
  /** Hole cards shown at showdown. */
  shown: Record<string, PlayingCard[]>;
  best: Record<string, { category: Category; cards: string[] }>;
  /** Net chips won (or lost) this hand, per player. */
  net: Record<string, number>;
}

export interface PokerState {
  rng: number;
  handNo: number;
  players: PokerPlayer[];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  deck: PlayingCard[];
  board: PlayingCard[];
  street: Street;
  phase: Phase;
  /** Index of the player to act, -1 when nobody. */
  toAct: number;
  currentBet: number;
  minRaise: number;
  fullRaises: number;
  lastResult: HandResult | null;
}

export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'bet'; to: number } | { type: 'raise'; to: number } | { type: 'allIn' };

export type PokerEvent =
  | { type: 'blinds'; small: string; big: string }
  | { type: 'deal' }
  | { type: 'action'; player: string; action: PokerAction['type']; amount: number }
  | { type: 'street'; street: Street; cards: PlayingCard[] }
  | { type: 'handOver'; result: HandResult }
  | { type: 'gameOver'; winner: string | null };

export interface TableConfig {
  seats: { id: string; name: string; kind: 'human' | 'bot' }[];
  stack: number;
  smallBlind: number;
  bigBlind: number;
  seed: number;
}

// ------------------------------------------------------------------ helpers

const inHand = (p: PokerPlayer) => !p.out && !p.folded;
const canAct = (p: PokerPlayer) => inHand(p) && !p.allIn;
const needsToAct = (s: PokerState, p: PokerPlayer) => canAct(p) && (p.acted < s.fullRaises || p.bet < s.currentBet);
const nextIndex = (s: PokerState, from: number, pred: (p: PokerPlayer) => boolean) => {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.players[i])) return i;
  }
  return -1;
};
export const potTotal = (s: PokerState) => s.players.reduce((t, p) => t + p.committed, 0);
const clone = (s: PokerState): PokerState => ({ ...s, players: s.players.map((p) => ({ ...p, hole: p.hole.slice() })), deck: s.deck.slice(), board: s.board.slice() });

function put(p: PokerPlayer, amount: number) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

// ------------------------------------------------------------------ table and hands

export function createTable(cfg: TableConfig): { state: PokerState; events: PokerEvent[] } {
  if (cfg.seats.length < 2 || cfg.seats.length > 6) throw new Error('2–6 players');
  const state: PokerState = {
    rng: cfg.seed >>> 0,
    handNo: 0,
    players: cfg.seats.map((s) => ({ ...s, stack: cfg.stack, hole: [], bet: 0, committed: 0, folded: false, allIn: false, out: false, acted: -1 })),
    dealer: cfg.seats.length - 1,
    smallBlind: cfg.smallBlind,
    bigBlind: cfg.bigBlind,
    deck: [],
    board: [],
    street: 'preflop',
    phase: 'handOver',
    toAct: -1,
    currentBet: 0,
    minRaise: cfg.bigBlind,
    fullRaises: 0,
    lastResult: null,
  };
  return startHand(state);
}

/** Deals the next hand (or ends the game when fewer than two players have chips). */
export function startHand(prev: PokerState): { state: PokerState; events: PokerEvent[] } {
  const s = clone(prev);
  for (const p of s.players) Object.assign(p, { hole: [], bet: 0, committed: 0, folded: false, allIn: false, out: p.stack <= 0, acted: -1 });
  const alive = s.players.filter((p) => !p.out);
  if (alive.length < 2) {
    s.phase = 'gameOver';
    s.toAct = -1;
    return { state: s, events: [{ type: 'gameOver', winner: alive[0]?.id ?? null }] };
  }
  const rng = createRng(s.rng);
  s.handNo += 1;
  s.deck = shuffle(createShoe(1), rng);
  s.rng = rng.state();
  s.board = [];
  s.street = 'preflop';
  s.phase = 'betting';
  s.lastResult = null;
  s.dealer = nextIndex(s, s.dealer, (p) => !p.out);
  const headsUp = alive.length === 2;
  const sb = headsUp ? s.dealer : nextIndex(s, s.dealer, (p) => !p.out);
  const bb = nextIndex(s, sb, (p) => !p.out);
  put(s.players[sb], s.smallBlind);
  put(s.players[bb], s.bigBlind);
  s.currentBet = Math.max(s.players[sb].bet, s.players[bb].bet);
  s.minRaise = s.bigBlind;
  s.fullRaises = 0;
  // Two cards each, one at a time, starting left of the button.
  for (let round = 0; round < 2; round++) {
    let i = s.dealer;
    for (let k = 0; k < alive.length; k++) {
      i = nextIndex(s, i, (p) => !p.out);
      s.players[i].hole.push(s.deck.pop()!);
    }
  }
  const events: PokerEvent[] = [{ type: 'blinds', small: s.players[sb].id, big: s.players[bb].id }, { type: 'deal' }];
  s.toAct = nextIndex(s, bb, (p) => needsToAct(s, p));
  return settle(s, events);
}

// ------------------------------------------------------------------ actions

export interface Legal {
  fold: boolean;
  check: boolean;
  /** Chips a call costs (0 = no call). A call for all the stack is an all-in call. */
  call: number;
  /** Bet (nobody has bet yet) or raise, and its range as the total bet on this street. */
  raise: { kind: 'bet' | 'raise'; min: number; max: number } | null;
  /** Total bet if all chips go in, when that is allowed. */
  allIn: number;
}

export function legalActions(s: PokerState, index: number): Legal | null {
  if (s.phase !== 'betting' || s.toAct !== index) return null;
  const p = s.players[index];
  const toCall = Math.max(0, s.currentBet - p.bet);
  const others = s.players.filter((o, i) => i !== index && canAct(o)).length;
  const allInTotal = p.bet + p.stack;
  const reopened = p.acted < s.fullRaises;
  // A raise needs someone left to answer it, chips beyond the call, and the right to raise.
  const mayRaise = others > 0 && p.stack > toCall && reopened;
  const minTo = s.currentBet === 0 ? Math.min(allInTotal, s.bigBlind) : s.currentBet + s.minRaise;
  return {
    fold: toCall > 0,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, p.stack) : 0,
    raise: mayRaise && allInTotal > minTo ? { kind: s.currentBet === 0 ? 'bet' : 'raise', min: minTo, max: allInTotal } : null,
    allIn: p.stack > 0 && (mayRaise || p.stack <= toCall) ? allInTotal : 0,
  };
}

export type ApplyResult = { ok: true; state: PokerState; events: PokerEvent[] } | { ok: false; error: string };

export function applyAction(prev: PokerState, playerId: string, action: PokerAction): ApplyResult {
  const index = prev.players.findIndex((p) => p.id === playerId);
  const legal = index >= 0 ? legalActions(prev, index) : null;
  if (!legal) return { ok: false, error: 'not_your_turn' };
  const s = clone(prev);
  const p = s.players[index];
  let paid = 0;
  const raiseTo = (to: number) => {
    const increment = to - s.currentBet;
    paid = put(p, to - p.bet);
    if (increment >= s.minRaise) {
      s.minRaise = increment;
      s.fullRaises += 1;
    }
    s.currentBet = Math.max(s.currentBet, p.bet);
  };
  switch (action.type) {
    case 'fold':
      if (!legal.fold) return { ok: false, error: 'illegal' };
      p.folded = true;
      break;
    case 'check':
      if (!legal.check) return { ok: false, error: 'illegal' };
      break;
    case 'call':
      if (!legal.call) return { ok: false, error: 'illegal' };
      paid = put(p, legal.call);
      break;
    case 'bet':
    case 'raise': {
      const r = legal.raise;
      if (!r || r.kind !== action.type || !Number.isInteger(action.to) || action.to < r.min || action.to > r.max) return { ok: false, error: 'illegal' };
      raiseTo(action.to);
      break;
    }
    case 'allIn':
      if (!legal.allIn) return { ok: false, error: 'illegal' };
      if (legal.allIn <= s.currentBet) paid = put(p, p.stack);
      else raiseTo(legal.allIn);
      break;
  }
  p.acted = s.fullRaises;
  const events: PokerEvent[] = [{ type: 'action', player: p.id, action: action.type, amount: paid }];
  s.toAct = nextIndex(s, index, (o) => needsToAct(s, o));
  return { ok: true, ...settle(s, events) };
}

/** After an action (or the deal): next player, next street, or the end of the hand. */
function settle(s: PokerState, events: PokerEvent[]): { state: PokerState; events: PokerEvent[] } {
  const live = s.players.filter(inHand);
  if (live.length === 1) return finish(s, events, false);
  if (s.toAct !== -1 && needsToAct(s, s.players[s.toAct])) return { state: s, events };
  // Betting round over.
  while (true) {
    for (const p of s.players) {
      p.bet = 0;
      p.acted = -1;
    }
    s.currentBet = 0;
    s.minRaise = s.bigBlind;
    s.fullRaises = 0;
    if (s.street === 'river') return finish(s, events, true);
    const next: Street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
    s.deck.pop(); // burn
    const cards = Array.from({ length: next === 'flop' ? 3 : 1 }, () => s.deck.pop()!);
    s.board.push(...cards);
    s.street = next;
    events.push({ type: 'street', street: next, cards });
    // With fewer than two players able to bet, the board just runs out.
    if (s.players.filter(canAct).length >= 2) {
      s.toAct = nextIndex(s, s.dealer, canAct);
      return { state: s, events };
    }
  }
}

/** Side pots from what each player put in: each level is shared by the players still in who covered it. */
export function buildPots(players: PokerPlayer[]): { amount: number; eligible: string[] }[] {
  const levels = [...new Set(players.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = players.reduce((t, p) => t + Math.max(0, Math.min(p.committed, level) - prev), 0);
    const eligible = players.filter((p) => inHand(p) && p.committed >= level).map((p) => p.id);
    const last = pots[pots.length - 1];
    if (eligible.length === 0 && last) last.amount += amount;
    else if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

function finish(s: PokerState, events: PokerEvent[], showdown: boolean): { state: PokerState; events: PokerEvent[] } {
  const before = new Map(s.players.map((p) => [p.id, p.stack + p.committed]));
  const live = s.players.filter(inHand);
  const result: HandResult = { handNo: s.handNo, pots: [], showdown: showdown && live.length > 1, shown: {}, best: {}, net: {} };
  const values = new Map<string, ReturnType<typeof evaluate>>();
  if (result.showdown)
    for (const p of live) {
      const v = evaluate([...p.hole, ...s.board]);
      values.set(p.id, v);
      result.shown[p.id] = p.hole;
      result.best[p.id] = { category: v.category, cards: v.cards.map((c) => c.id) };
    }
  // Seat order for odd chips: starting left of the button.
  const order = Array.from({ length: s.players.length }, (_, k) => s.players[(s.dealer + 1 + k) % s.players.length].id);
  for (const pot of buildPots(s.players)) {
    let winners: string[];
    if (!result.showdown) winners = [live[0].id];
    else {
      const best = Math.max(...pot.eligible.map((id) => values.get(id)!.score));
      winners = pot.eligible.filter((id) => values.get(id)!.score === best);
    }
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const id of winners) {
      const p = s.players.find((x) => x.id === id)!;
      p.stack += share + (odd > 0 ? 1 : 0);
      odd--;
    }
    const top = result.showdown ? values.get(winners[0])! : null;
    result.pots.push({ amount: pot.amount, winners, ...(top ? { category: top.category, cards: top.cards.map((c) => c.id) } : {}) });
  }
  for (const p of s.players) {
    result.net[p.id] = p.stack - (before.get(p.id) ?? 0);
    p.committed = 0;
    p.bet = 0;
  }
  s.phase = 'handOver';
  s.toAct = -1;
  s.lastResult = result;
  events.push({ type: 'handOver', result });
  return { state: s, events };
}

// ------------------------------------------------------------------ what a player may know

export interface PokerView {
  me: string;
  hole: PlayingCard[];
  board: PlayingCard[];
  street: Street;
  pot: number;
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  dealer: number;
  toAct: number;
  players: { id: string; stack: number; bet: number; committed: number; folded: boolean; allIn: boolean; out: boolean }[];
  legal: Legal | null;
  handNo: number;
}

/** Only what `playerId` is allowed to see: their own cards and public information. Never the deck. */
export function pokerView(s: PokerState, playerId: string): PokerView {
  const index = s.players.findIndex((p) => p.id === playerId);
  return {
    me: playerId,
    hole: s.players[index]?.hole.slice() ?? [],
    board: s.board.slice(),
    street: s.street,
    pot: potTotal(s),
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    bigBlind: s.bigBlind,
    dealer: s.dealer,
    toAct: s.toAct,
    players: s.players.map((p) => ({ id: p.id, stack: p.stack, bet: p.bet, committed: p.committed, folded: p.folded, allIn: p.allIn, out: p.out })),
    legal: index >= 0 ? legalActions(s, index) : null,
    handNo: s.handNo,
  };
}

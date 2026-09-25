import { describe, expect, it } from 'vitest';
import type { PlayingCard, Rank, Suit } from '@/casino/cards';
import { createShoe } from '@/casino/cards';
import { applyAction, buildPots, createTable, decide, evaluate, legalActions, pokerView, startHand } from '../engine';
import type { PokerAction, PokerState, TableConfig } from '../engine';

const card = (s: string): PlayingCard => {
  const rank = s.slice(0, -1) as Rank;
  const suit = s.slice(-1) as Suit;
  return { id: `${rank}${suit}-0`, rank, suit };
};
const hand = (s: string) => s.split(' ').map(card);
const cat = (s: string) => evaluate(hand(s)).category;
const score = (s: string) => evaluate(hand(s)).score;

const seats = (n: number, humanFirst = true): TableConfig['seats'] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: i === 0 && humanFirst ? 'human' : 'bot' }));
const table = (n: number, seed = 1, stack = 1000) => createTable({ seats: seats(n), stack, smallBlind: 10, bigBlind: 20, seed });
const total = (s: PokerState) => s.players.reduce((t, p) => t + p.stack + p.committed, 0);
const act = (s: PokerState, a: PokerAction) => {
  const r = applyAction(s, s.players[s.toAct].id, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r;
};

describe('hand evaluation', () => {
  it('ranks every category', () => {
    expect(cat('AS KS QS JS 10S 2H 3D')).toBe('royalFlush');
    expect(cat('9H 8H 7H 6H 5H AD AC')).toBe('straightFlush');
    expect(cat('7S 7H 7D 7C KS 2H 3D')).toBe('quads');
    expect(cat('7S 7H 7D KC KS 2H 3D')).toBe('fullHouse');
    expect(cat('AS 9S 7S 4S 2S KH QD')).toBe('flush');
    expect(cat('9C 8D 7H 6S 5C AD KC')).toBe('straight');
    expect(cat('AC 2D 3H 4S 5C KD 9C')).toBe('straight');
    expect(cat('7S 7H 7D KC QS 2H 3D')).toBe('trips');
    expect(cat('7S 7H KD KC QS 2H 3D')).toBe('twoPair');
    expect(cat('7S 7H KD JC QS 2H 3D')).toBe('pair');
    expect(cat('7S 9H KD JC QS 2H 3D')).toBe('highCard');
  });

  it('orders hands and kickers, and ties exact equals', () => {
    expect(score('AS AH KD QC JS 3H 2D')).toBeGreaterThan(score('AS AH KD QC 10S 3H 2D'));
    expect(score('6C 5D 4H 3S 2C 9D KC')).toBeGreaterThan(score('AC 2D 3H 4S 5C KD 9C')); // 6-high beats the wheel
    expect(score('KS KH 2D 2C AS 3H 4D')).toBeGreaterThan(score('KS KH 2D 2C QS 3H 4D'));
    expect(score('7S 7H 7D KC KS 2H 3D')).toBeGreaterThan(score('6S 6H 6D AC AS 2H 3D'));
    expect(score('AS KD QH JC 9S 3H 2D')).toBe(score('AH KC QD JS 9C 3S 2H'));
    expect(evaluate(hand('9H 8H 7H 6H 5H AD AC')).cards.map((c) => c.rank)).toEqual(['9', '8', '7', '6', '5']);
  });

  it('never breaks on random 7-card hands', () => {
    const deck = createShoe(1);
    for (let i = 0; i < 2000; i++) {
      const pick = Array.from({ length: 7 }, (_, k) => deck[(i * 7 + k * 13) % 52]);
      if (new Set(pick.map((c) => c.id)).size < 7) continue;
      const v = evaluate(pick);
      expect(v.cards).toHaveLength(5);
    }
  });
});

describe('table and betting', () => {
  it('posts blinds, deals two private cards each and gives the turn after the big blind', () => {
    const { state, events } = table(4);
    expect(events[0]).toEqual({ type: 'blinds', small: 'p1', big: 'p2' });
    expect(state.dealer).toBe(0);
    expect(state.players.map((p) => p.hole.length)).toEqual([2, 2, 2, 2]);
    expect(state.players[1].bet).toBe(10);
    expect(state.players[2].bet).toBe(20);
    expect(state.toAct).toBe(3);
    expect(state.deck).toHaveLength(52 - 8);
    expect(new Set(state.players.flatMap((p) => p.hole.map((c) => c.id))).size).toBe(8);
  });

  it('heads-up: the button posts the small blind and acts first preflop, second after', () => {
    const { state } = table(2);
    expect(state.dealer).toBe(0);
    expect(state.players[0].bet).toBe(10);
    expect(state.toAct).toBe(0);
    let s = act(state, { type: 'call' }).state;
    expect(s.toAct).toBe(1);
    s = act(s, { type: 'check' }).state;
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1);
  });

  it('shows only the legal actions', () => {
    const { state } = table(3);
    const l = legalActions(state, state.toAct)!;
    expect(l.check).toBe(false);
    expect(l.fold).toBe(true);
    expect(l.call).toBe(20);
    expect(l.raise).toEqual({ kind: 'raise', min: 40, max: 1000 });
    expect(legalActions(state, (state.toAct + 1) % 3)).toBeNull();
    // after the flop nobody has bet: check or bet, no fold
    let s = act(state, { type: 'call' }).state;
    s = act(s, { type: 'call' }).state;
    s = act(s, { type: 'check' }).state;
    const post = legalActions(s, s.toAct)!;
    expect(post).toMatchObject({ check: true, fold: false, call: 0, raise: { kind: 'bet', min: 20 } });
  });

  it('refuses invalid actions', () => {
    const { state } = table(3);
    const who = state.players[state.toAct].id;
    expect(applyAction(state, who, { type: 'check' })).toEqual({ ok: false, error: 'illegal' });
    expect(applyAction(state, who, { type: 'raise', to: 30 })).toEqual({ ok: false, error: 'illegal' });
    expect(applyAction(state, who, { type: 'bet', to: 100 })).toEqual({ ok: false, error: 'illegal' });
    expect(applyAction(state, 'p1', { type: 'call' })).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('min raise follows the last full raise; everyone folding to a raise wins the pot', () => {
    let s = table(3).state;
    s = act(s, { type: 'raise', to: 60 }).state; // raise of 40
    expect(legalActions(s, s.toAct)!.raise!.min).toBe(100);
    s = act(s, { type: 'fold' }).state;
    const r = act(s, { type: 'fold' });
    expect(r.state.phase).toBe('handOver');
    expect(r.state.lastResult!.showdown).toBe(false);
    expect(r.state.lastResult!.pots[0]).toMatchObject({ amount: 90, winners: ['p0'] });
    expect(r.state.players[0].stack).toBe(1030);
    expect(total(r.state)).toBe(3000);
  });

  it('a short all-in does not reopen the betting for a player who already acted', () => {
    // p1 (SB) has only 50: p0 (button, first to act) raises to 40? use 3 players: p0 raises to 60, p1 all-in 70 (short), p2 calls
    const s0 = createTable({ seats: seats(3), stack: 1000, smallBlind: 10, bigBlind: 20, seed: 3 }).state;
    s0.players[1].stack = 60; // p1 has 70 in total with the small blind
    let s = act(s0, { type: 'raise', to: 60 }).state; // p0
    s = act(s, { type: 'allIn' }).state; // p1 → 70 total, a raise of 10 < 40
    expect(s.currentBet).toBe(70);
    s = act(s, { type: 'call' }).state; // p2 calls 70
    expect(s.players[s.toAct].id).toBe('p0');
    const l = legalActions(s, s.toAct)!;
    expect(l.call).toBe(10);
    expect(l.raise).toBeNull(); // may only call or fold
  });

  it('builds side pots and pays each to the best eligible hand', () => {
    const players = [
      { id: 'a', committed: 100, folded: false, out: false },
      { id: 'b', committed: 300, folded: false, out: false },
      { id: 'c', committed: 300, folded: false, out: false },
      { id: 'd', committed: 50, folded: true, out: false },
    ] as never;
    expect(buildPots(players)).toEqual([
      { amount: 350, eligible: ['a', 'b', 'c'] },
      { amount: 400, eligible: ['b', 'c'] },
    ]);
  });

  it('split pots go to every tied winner, odd chip to the first left of the button', () => {
    let s = table(3, 9).state;
    // Force a board that plays for everyone: royal flush on the board.
    const board = hand('AS KS QS JS 10S');
    s.deck = [...s.deck.filter((c) => !board.some((b) => b.id === c.id) && !s.players.some((p) => p.hole.some((h) => h.id === c.id)))];
    const d = s.deck;
    // the engine pops: burn, flop×3, burn, turn, burn, river
    s.deck = [...d.slice(0, d.length - 8), board[4], d[d.length - 7], board[3], d[d.length - 6], board[2], board[1], board[0], d[d.length - 5]];
    s.players[1].stack += 1; // an odd total
    s = act(s, { type: 'call' }).state; // p0
    s = act(s, { type: 'call' }).state; // p1 SB
    s = act(s, { type: 'check' }).state; // p2 BB
    for (let i = 0; i < 9 && s.phase === 'betting'; i++) s = act(s, { type: 'check' }).state;
    expect(s.lastResult!.showdown).toBe(true);
    expect(s.lastResult!.pots[0].winners.sort()).toEqual(['p0', 'p1', 'p2']);
    expect(s.lastResult!.pots[0].category).toBe('royalFlush');
    expect(s.players.map((p) => p.stack)).toEqual([1000, 1001, 1000]);
  });

  it('all-in players see the board run out to a showdown; chips are conserved', () => {
    let s = table(2, 5).state;
    s = act(s, { type: 'allIn' }).state;
    const r = act(s, { type: 'call' });
    expect(r.state.board).toHaveLength(5);
    expect(r.events.filter((e) => e.type === 'street')).toHaveLength(3);
    expect(r.state.lastResult!.showdown).toBe(true);
    expect(total(r.state)).toBe(2000);
    const winners = r.state.lastResult!.pots.flatMap((p) => p.winners);
    expect(winners.length).toBeGreaterThan(0);
  });

  it('the next hand moves the button; the game ends when one player has every chip', () => {
    let s = table(2, 5).state;
    s = act(s, { type: 'allIn' }).state;
    s = act(s, { type: 'call' }).state;
    const next = startHand(s);
    if (s.players.some((p) => p.stack === 0)) {
      expect(next.state.phase).toBe('gameOver');
      expect(next.events[0]).toMatchObject({ type: 'gameOver' });
    } else {
      expect(next.state.dealer).toBe(1);
      expect(next.state.handNo).toBe(2);
    }
  });

  it('is deterministic for a seed', () => {
    expect(table(5, 42).state).toEqual(table(5, 42).state);
    expect(table(5, 42).state.deck).not.toEqual(table(5, 43).state.deck);
  });
});

describe('bots', () => {
  it('see only their own cards and public information', () => {
    const { state } = table(4);
    const v = pokerView(state, 'p2');
    expect(v.hole).toEqual(state.players[2].hole);
    expect(JSON.stringify(v)).not.toContain('"deck"');
    for (const p of v.players) expect(Object.keys(p)).not.toContain('hole');
    expect(JSON.stringify(v.players)).not.toContain(state.players[1].hole[0].id);
  });

  it('always choose a legal action, at every difficulty, over thousands of hands; chips are conserved', () => {
    let hands = 0;
    for (const difficulty of ['easy', 'normal', 'hard'] as const)
      for (let n = 2; n <= 6; n++)
        for (let seed = 1; seed <= 4; seed++) {
          let { state } = createTable({ seats: seats(n, false), stack: 500, smallBlind: 10, bigBlind: 20, seed: seed * 101 + n });
          for (let h = 0; h < 25 && state.phase !== 'gameOver'; h++) {
            for (let guard = 0; guard < 200 && state.phase === 'betting'; guard++) {
              const id = state.players[state.toAct].id;
              const a = decide(pokerView(state, id), difficulty, seed);
              const r = applyAction(state, id, a);
              expect(r.ok).toBe(true);
              if (!r.ok) return;
              state = r.state;
              expect(total(state)).toBe(500 * n);
            }
            expect(state.phase).not.toBe('betting');
            hands++;
            state = startHand(state).state;
          }
        }
    expect(hands).toBeGreaterThan(200);
  });

  it('a strong hand bets or raises more often than a weak one', () => {
    const base = table(2, 1).state;
    const strong = pokerView(base, base.players[base.toAct].id);
    strong.hole = hand('AS AH');
    const weak = { ...strong, hole: hand('7C 2D') };
    let aggStrong = 0;
    let foldWeak = 0;
    for (let s = 1; s <= 60; s++) {
      const a = decide({ ...strong, handNo: s }, 'hard', s);
      if (a.type === 'raise' || a.type === 'allIn') aggStrong++;
      if (decide({ ...weak, handNo: s }, 'hard', s).type === 'fold') foldWeak++;
    }
    expect(aggStrong).toBeGreaterThan(20);
    expect(foldWeak).toBeGreaterThan(20);
  });
});

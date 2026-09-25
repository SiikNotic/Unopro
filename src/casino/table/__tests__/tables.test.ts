import { describe, expect, it } from 'vitest';
import { act, advanceBj, BJ_TIMING, bjTableView, canAct, canBet, createBjTable, markPaid as bjPaid, placeBet, unpaid as bjUnpaid } from '../blackjackTable';
import type { BjTable } from '../blackjackTable';
import { addBets, advanceRt, canAddBets, createRtTable, markPaid as rtPaid, parseSlip, RT_TIMING, rtTableView, slipsOf, unpaid as rtUnpaid } from '../rouletteTable';
import { handTotal } from '../../blackjack';
import { sha256, toHex } from '../fair';

/** A fixed seed for a test (a real table gets newSeed()). */
const S = (n: number) => toHex(sha256(new TextEncoder().encode(`test-${n}`)));

const T0 = 1_000_000;

describe('blackjack table', () => {
  it('runs a full round with two players and lists the payouts', () => {
    let t = createBjTable(S(42), T0);
    expect(canBet(t, 's0', 5)).toBe('amount');
    expect(canBet(t, 's0', 100)).toBeNull();
    t = placeBet(t, 's0', 'u0', 'Ana', 100, T0);
    expect(t.phase).toBe('betting');
    expect(canBet(t, 's0', 100)).toBe('already_bet');
    t = placeBet(t, 's1', 'u1', 'Beto', 50, T0 + 1000);
    // everyone present has bet: the cards are dealt right away
    t = advanceBj(t, T0 + 1500, ['s0', 's1']);
    expect(['playing', 'settled', 'dealer']).toContain(t.phase);
    const v = bjTableView(t);
    expect(v.seats.every((s) => s.cards.length === 2)).toBe(true);
    if (t.phase === 'playing') {
      expect(v.dealer[1]).toBeNull(); // hole card hidden
      expect(canAct(t, v.turn === 's0' ? 's1' : 's0', 'hit')).toBe('not_your_turn');
    }
    // nobody acts: every hand stands on the timer, the dealer plays, the round settles
    for (let i = 0; i < 20 && t.phase !== 'settled'; i++) t = advanceBj(t, t.phaseAt + (t.phase === 'playing' ? BJ_TIMING.turn : BJ_TIMING.dealerStep), ['s0', 's1']);
    expect(t.phase).toBe('settled');
    const view = bjTableView(t);
    expect(view.dealer.every((c) => c !== null)).toBe(true);
    const dealer = handTotal(t.dealer).total;
    expect(dealer >= 17 || t.seats.every((s) => handTotal(s.hand.cards).total > 21)).toBe(true);
    for (const s of t.seats) expect(s.outcome).not.toBeNull();
    // the next round waits for every payout
    const owed = bjUnpaid(t);
    const later = advanceBj(t, t.phaseAt + BJ_TIMING.settled + 1, ['s0', 's1']);
    expect(later.phase).toBe(owed.length ? 'settled' : 'waiting');
    let paid: BjTable = t;
    for (const s of owed) paid = bjPaid(paid, s.seat);
    const next = advanceBj(paid, paid.phaseAt + BJ_TIMING.settled + 1, ['s0', 's1']);
    expect(next.phase).toBe('waiting');
    expect(next.round).toBe(2);
    expect(next.seats).toEqual([]);
  });

  it('hit, double and stand only for the seat whose turn it is', () => {
    // find a seed where the round goes to the players (no dealer blackjack, first hand not a blackjack)
    for (let seed = 1; seed < 200; seed++) {
      let t = placeBet(createBjTable(S(seed), T0), 's0', 'u0', 'A', 100, T0);
      t = advanceBj(t, T0 + BJ_TIMING.betting, ['s0', 's1']);
      if (t.phase !== 'playing') continue;
      expect(canAct(t, 's1', 'hit')).toBe('not_your_turn');
      const doubled = act(t, 's0', 'double', T0 + BJ_TIMING.betting + 10);
      expect(doubled.seats[0].bet).toBe(200);
      expect(doubled.seats[0].hand.cards).toHaveLength(3);
      expect(doubled.phase).toBe('dealer');
      const hit = act(t, 's0', 'hit', T0 + BJ_TIMING.betting + 10);
      expect(hit.seats[0].hand.cards).toHaveLength(3);
      if (hit.phase === 'playing') expect(canAct(hit, 's0', 'double')).toBe('cannot_double');
      return;
    }
    throw new Error('no playable seed');
  });

  it('closes the betting window on its timer when someone present has not bet', () => {
    let t = placeBet(createBjTable(S(7), T0), 's0', 'u0', 'A', 100, T0);
    expect(advanceBj(t, T0 + 1000, ['s0', 's1']).phase).toBe('betting');
    t = advanceBj(t, T0 + BJ_TIMING.betting, ['s0', 's1']);
    expect(t.phase).not.toBe('betting');
    expect(canBet(t, 's1', 100)).toBe('phase');
  });

  it('never shows the shoe or the hole card', () => {
    let t = placeBet(createBjTable(S(9), T0), 's0', 'u0', 'A', 100, T0);
    t = advanceBj(t, T0 + BJ_TIMING.betting, ['s0']);
    const v = bjTableView(t) as unknown as Record<string, unknown>;
    expect('shoe' in v).toBe(false);
    expect('seed' in v).toBe(false);
    expect(JSON.stringify(v)).not.toContain(t.seed);
  });
});

describe('roulette table', () => {
  it('parses slips strictly', () => {
    expect(parseSlip([{ type: 'red', amount: 10 }])).toEqual([{ type: 'red', amount: 10 }]);
    expect(parseSlip([{ type: 'straight', value: 17, amount: 5 }])).toEqual([{ type: 'straight', value: 17, amount: 5 }]);
    expect(parseSlip([{ type: 'straight', value: 37, amount: 5 }])).toBeNull();
    expect(parseSlip([{ type: 'dozen', value: 4, amount: 5 }])).toBeNull();
    expect(parseSlip([{ type: 'red', amount: 0 }])).toBeNull();
    expect(parseSlip([{ type: 'red', amount: 1.5 }])).toBeNull();
    expect(parseSlip([])).toBeNull();
    expect(parseSlip('red')).toBeNull();
  });

  it('runs a round: bets, spin, result, payouts, next round only after paying', () => {
    let t = createRtTable(S(1234), T0);
    const bets = [{ type: 'red' as const, amount: 100 }, { type: 'black' as const, amount: 100 }, { type: 'straight' as const, value: 0, amount: 10 }];
    t = addBets(t, 's0', 'u0', 'Ana', bets, T0);
    expect(t.phase).toBe('betting');
    expect(slipsOf(t, 's0')).toBe(1);
    t = addBets(t, 's1', 'u1', 'Beto', [{ type: 'odd', amount: 50 }], T0 + 500);
    expect(rtTableView(t).pocket).toBeNull();
    t = advanceRt(t, T0 + RT_TIMING.betting);
    expect(t.phase).toBe('spinning');
    expect(canAddBets(t, 's0', bets)).toBe('phase');
    const pocket = t.pocket!;
    expect(rtTableView(t).pocket).toBe(pocket);
    t = advanceRt(t, T0 + RT_TIMING.betting + RT_TIMING.spin);
    expect(t.phase).toBe('result');
    expect(t.history[0]).toBe(pocket);
    const ana = t.seats.find((s) => s.seat === 's0')!;
    // red + black on 100 each: one of them wins 200 unless zero (then the straight 0 pays 360)
    expect(ana.payout).toBe(pocket === 0 ? 360 : 200);
    let paid = t;
    const held = advanceRt(t, t.phaseAt + RT_TIMING.result + 1);
    expect(held.phase).toBe(rtUnpaid(t).length ? 'result' : 'waiting');
    for (const s of rtUnpaid(t)) paid = rtPaid(paid, s.seat);
    const next = advanceRt(paid, paid.phaseAt + RT_TIMING.result + 1);
    expect(next.phase).toBe('waiting');
    expect(next.round).toBe(2);
  });

  it('limits coins per round and slips per player', () => {
    let t = createRtTable(S(1), T0);
    expect(canAddBets(t, 's0', [{ type: 'red', amount: 100001 }])).toBe('amount');
    for (let i = 0; i < 6; i++) t = addBets(t, 's0', 'u0', 'A', [{ type: 'red', amount: 10 }], T0);
    expect(canAddBets(t, 's0', [{ type: 'red', amount: 10 }])).toBe('too_many');
  });

  it('the pocket is the same for a given seed (drawn from the hidden state)', () => {
    const a = advanceRt(addBets(createRtTable(S(99), T0), 's0', 'u', 'A', [{ type: 'red', amount: 1 }], T0), T0 + RT_TIMING.betting).pocket;
    const b = advanceRt(addBets(createRtTable(S(99), T0), 's0', 'u', 'A', [{ type: 'red', amount: 1 }], T0), T0 + RT_TIMING.betting).pocket;
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(36);
  });
});

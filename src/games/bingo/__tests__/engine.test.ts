import { describe, expect, it } from 'vitest';
import { applyBingo, bingoRules, bingoView, createBingo, hasBingo, LINES, parseBingoAction, validateBingo } from '../engine';
import type { BingoAction, BingoState } from '../engine';
import { decideBingo } from '../bots/bingoBot';
import { HOUSE, LocalHost } from '@/games/shared/multiplayer/host';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'bot' as const }));

function must(state: BingoState, action: BingoAction): BingoState {
  const r = applyBingo(state, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return r.state;
}
/** Calls balls until `n` have been called. */
const callTo = (s: BingoState, n: number) => {
  while (s.called.length < n) s = must(s, { type: 'CALL_NUMBER' });
  return s;
};
/** Daubs every called number on every card. */
const daubAll = (s: BingoState) => {
  for (const p of s.players) for (const n of s.called) if (p.card.includes(n) && !p.marks[p.card.indexOf(n)]) s = must(s, { type: 'MARK_NUMBER', playerId: p.id, number: n });
  return s;
};

describe('Bingo — cards and balls', () => {
  it('cards follow B-I-N-G-O ranges, no repeats, FREE centre', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createBingo({ seats: seats(4), seed });
      for (const p of s.players) {
        expect(p.card).toHaveLength(25);
        expect(p.card[12]).toBe(0);
        expect(p.marks.filter(Boolean)).toHaveLength(1);
        const nums = p.card.filter((n) => n !== 0);
        expect(new Set(nums).size).toBe(24);
        p.card.forEach((n, i) => {
          if (i === 12) return;
          const col = i % 5;
          expect(n).toBeGreaterThanOrEqual(col * 15 + 1);
          expect(n).toBeLessThanOrEqual(col * 15 + 15);
        });
      }
    }
  });

  it('the ball order is a permutation of 1–75, called one at a time, then no more', () => {
    let s = createBingo({ seats: seats(1), seed: 3 });
    expect([...s.drawOrder].sort((a, b) => a - b)).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
    s = callTo(s, 75);
    expect(s.called).toEqual(s.drawOrder);
    expect(validateBingo(s, { type: 'CALL_NUMBER' })).toBe('no_balls');
  });

  it('supports 1–4 players only, with unique seats', () => {
    expect(() => createBingo({ seats: [], seed: 1 })).toThrow();
    expect(() => createBingo({ seats: seats(5), seed: 1 })).toThrow();
    expect(() => createBingo({ seats: [seats(1)[0], seats(1)[0]], seed: 1 })).toThrow();
  });

  it('there are 12 winning lines', () => {
    expect(LINES).toHaveLength(12);
    const marks = Array.from({ length: 25 }, (_, i) => [0, 6, 18, 24].includes(i) || i === 12);
    expect(hasBingo(marks)).toBe(true);
  });
});

describe('Bingo — daubing and claims', () => {
  it('only called numbers on your own card can be daubed, once', () => {
    let s = callTo(createBingo({ seats: seats(2), seed: 9 }), 20);
    const p = s.players[0];
    const onCard = s.called.find((n) => p.card.includes(n));
    const notCalled = p.card.find((n) => n !== 0 && !s.called.includes(n))!;
    const notMine = s.called.find((n) => !p.card.includes(n))!;
    expect(validateBingo(s, { type: 'MARK_NUMBER', playerId: 'p0', number: notCalled })).toBe('not_called');
    expect(validateBingo(s, { type: 'MARK_NUMBER', playerId: 'p0', number: notMine })).toBe('not_on_card');
    expect(validateBingo(s, { type: 'MARK_NUMBER', playerId: 'ghost', number: onCard ?? 1 })).toBe('unknown_player');
    if (onCard) {
      s = must(s, { type: 'MARK_NUMBER', playerId: 'p0', number: onCard });
      expect(validateBingo(s, { type: 'MARK_NUMBER', playerId: 'p0', number: onCard })).toBe('already_marked');
    }
  });

  it('a false BINGO is refused and blocks claims for 3 more balls', () => {
    let s = callTo(createBingo({ seats: seats(2), seed: 4 }), 2);
    s = must(s, { type: 'CLAIM', playerId: 'p0' });
    expect(s.status).toBe('playing');
    expect(s.winners).toEqual([]);
    expect(validateBingo(s, { type: 'CLAIM', playerId: 'p0' })).toBe('claim_blocked');
    s = callTo(s, 5);
    expect(validateBingo(s, { type: 'CLAIM', playerId: 'p0' })).toBeNull();
  });

  it('a real BINGO stops the caller; others may still share it until the round closes', () => {
    let s = createBingo({ seats: seats(3), seed: 12 });
    while (!s.players.some((p) => hasBingo(p.marks))) s = daubAll(must(s, { type: 'CALL_NUMBER' }));
    const first = s.players.find((p) => hasBingo(p.marks))!;
    s = must(s, { type: 'CLAIM', playerId: first.id });
    expect(s.status).toBe('closing');
    expect(validateBingo(s, { type: 'CALL_NUMBER' })).toBe('closing');
    expect(validateBingo(s, { type: 'CLAIM', playerId: first.id })).toBe('already_claimed');
    const others = s.players.filter((p) => p.id !== first.id && hasBingo(p.marks));
    for (const o of others) s = must(s, { type: 'CLAIM', playerId: o.id });
    s = must(s, { type: 'CLOSE_ROUND' });
    expect(s.status).toBe('round_over');
    expect(s.lastResult!.winners).toEqual([first.id, ...others.map((o) => o.id)]);
    const each = Math.floor(100 / (1 + others.length));
    expect(s.lastResult!.pointsEach).toBe(each);
    expect(s.scores[first.id]).toBe(each);
  });

  it('ties split the points', () => {
    // Force two players to hold a completed line at the same time.
    let s = callTo(createBingo({ seats: seats(2), seed: 5 }), 1);
    const line = [0, 1, 2, 3, 4];
    s = { ...s, players: s.players.map((p) => ({ ...p, marks: p.marks.map((m, i) => m || line.includes(i)) })) };
    s = must(s, { type: 'CLAIM', playerId: 'p1' });
    s = must(s, { type: 'CLAIM', playerId: 'p0' });
    s = must(s, { type: 'CLOSE_ROUND' });
    expect(s.lastResult).toMatchObject({ winners: ['p1', 'p0'], pointsEach: 50 });
    expect(s.scores).toEqual({ p0: 50, p1: 50 });
  });

  it('with every ball out and nobody claiming, the round can close with no winner', () => {
    let s = callTo(createBingo({ seats: seats(1), seed: 8 }), 74);
    expect(validateBingo(s, { type: 'CLOSE_ROUND' })).toBe('cannot_close');
    s = must(must(s, { type: 'CALL_NUMBER' }), { type: 'CLOSE_ROUND' });
    expect(s.lastResult).toMatchObject({ winners: [], atCall: 0, pointsEach: 0 });
  });

  it('NEXT_ROUND deals new cards and a new ball order; not before the round is over', () => {
    let s = createBingo({ seats: seats(2), seed: 21 });
    expect(validateBingo(s, { type: 'NEXT_ROUND', playerId: 'p0' })).toBe('round_not_over');
    const card = s.players[0].card;
    s = must(must(callTo(s, 75), { type: 'CLOSE_ROUND' }), { type: 'NEXT_ROUND', playerId: 'p1' });
    expect(s.round).toBe(2);
    expect(s.called).toEqual([]);
    expect(s.players[0].card).not.toEqual(card);
    expect(validateBingo(s, { type: 'MARK_NUMBER', playerId: 'p0', number: 1 })).not.toBeNull();
  });
});

describe('Bingo — determinism, views, serialisation, host', () => {
  it('same seed → same cards and balls', () => {
    const a = callTo(createBingo({ seats: seats(4), seed: 777 }), 30);
    const b = callTo(createBingo({ seats: seats(4), seed: 777 }), 30);
    expect(a).toEqual(b);
    expect(createBingo({ seats: seats(1), seed: 1 }).players[0].card).not.toEqual(createBingo({ seats: seats(1), seed: 2 }).players[0].card);
  });

  it('a view shows only your card and the called balls', () => {
    const s = callTo(createBingo({ seats: seats(3), seed: 31 }), 10);
    const v = bingoView(s, 'p1');
    expect(v.card).toEqual(s.players[1].card);
    const text = JSON.stringify(v);
    expect(text).not.toContain('drawOrder');
    expect(text).not.toContain('rngState');
    expect(text).not.toContain('seed');
    expect(text).not.toContain(JSON.stringify(s.players[0].card));
    expect(v.called).toEqual(s.called);
    expect(v.seats.map((x) => x.daubs)).toEqual([0, 0, 0]);
  });

  it('actions round-trip through JSON; malformed ones are refused', () => {
    const actions: BingoAction[] = [{ type: 'CALL_NUMBER' }, { type: 'CLOSE_ROUND' }, { type: 'MARK_NUMBER', playerId: 'p0', number: 42 }, { type: 'CLAIM', playerId: 'p1' }, { type: 'NEXT_ROUND', playerId: 'p2' }];
    for (const a of actions) expect(parseBingoAction(JSON.parse(JSON.stringify(a)))).toEqual(a);
    for (const bad of [null, [], { type: 'MARK_NUMBER', playerId: 'p0', number: 0 }, { type: 'MARK_NUMBER', playerId: 'p0', number: 76 }, { type: 'MARK_NUMBER', playerId: 'p0', number: 4.5 }, { type: 'CALL_NUMBER', playerId: 'p0' }, { type: 'CLAIM', playerId: 'p0', win: true }, { type: 'WIN', playerId: 'p0' }]) {
      expect(parseBingoAction(bad)).toBeNull();
    }
  });

  it('only the house calls numbers; seats only act for themselves', () => {
    const host = new LocalHost(bingoRules, createBingo({ seats: seats(2), seed: 6 }));
    expect(host.submit('p0', { type: 'CALL_NUMBER' })).toEqual({ ok: false, error: 'house_only' });
    expect(host.submit(HOUSE, { type: 'CALL_NUMBER' }).ok).toBe(true);
    expect(host.submit('p0', { type: 'CLAIM', playerId: 'p1' })).toEqual({ ok: false, error: 'impersonation' });
    expect(host.submit(HOUSE, { type: 'CLAIM', playerId: 'p1' })).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('Bingo bots', () => {
  /** Whole bot rounds: the house calls a ball, then every bot acts as long as it wants to. */
  function botRound(seed: number, n: number, level: 'easy' | 'normal' | 'hard') {
    let s = createBingo({ seats: seats(n), seed });
    for (let guard = 0; guard < 2000 && s.status !== 'round_over'; guard++) {
      let acted = false;
      for (const p of s.players) {
        const d = decideBingo(bingoView(s, p.id), level, seed);
        if (d) {
          s = must(s, d.action);
          acted = true;
        }
      }
      if (acted) continue;
      s = must(s, s.status === 'closing' || s.called.length === 75 ? { type: 'CLOSE_ROUND' } : { type: 'CALL_NUMBER' });
    }
    return s;
  }

  it('only take legal actions and always finish with a real winner', () => {
    for (const level of ['easy', 'normal', 'hard'] as const)
      for (let seed = 1; seed <= 15; seed++) {
        const s = botRound(seed, 1 + (seed % 4), level);
        expect(s.status).toBe('round_over');
        expect(s.lastResult!.winners.length).toBeGreaterThan(0);
        for (const w of s.lastResult!.winners) expect(hasBingo(s.players.find((p) => p.id === w)!.marks)).toBe(true);
      }
  });

  it('never claim without a line and are deterministic', () => {
    const s = callTo(createBingo({ seats: seats(2), seed: 44 }), 3);
    const v = bingoView(s, 'p0');
    const d = decideBingo(v, 'hard', 1);
    expect(d?.action.type).not.toBe('CLAIM');
    expect(decideBingo(v, 'hard', 1)).toEqual(d);
  });

  it('react faster when harder', () => {
    let easy = 0;
    let hard = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = callTo(createBingo({ seats: seats(1), seed }), 30);
      const v = bingoView(s, 'p0');
      if (!v.toMark.length) continue;
      easy += decideBingo(v, 'easy', seed)!.delayMs;
      hard += decideBingo(v, 'hard', seed)!.delayMs;
    }
    expect(hard).toBeLessThan(easy);
  });
});

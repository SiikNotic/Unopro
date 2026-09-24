import { describe, expect, it } from 'vitest';
import {
  applyDomino,
  createDomino,
  dominoRules,
  dominoView,
  fullSet,
  handPips,
  isBlocked,
  legalActionsFor,
  parseDominoAction,
  tileId,
  validateDomino,
} from '../engine';
import type { DominoAction, DominoState, Pip, Tile } from '../engine';
import { decideDomino } from '../bots/dominoBot';
import type { DominoDifficulty } from '../bots/dominoBot';
import { HOUSE, LocalHost } from '@/games/shared/multiplayer/host';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'bot' as const }));
const T = (a: number, b: number): Tile => ({ id: tileId(a, b), a: Math.min(a, b) as Pip, b: Math.max(a, b) as Pip });

function must(state: DominoState, action: DominoAction): DominoState {
  const r = applyDomino(state, action);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return r.state;
}

/** Plays whole rounds with bots, checking invariants after every action. */
function playRound(state: DominoState, level: DominoDifficulty = 'normal', seed = 1): DominoState {
  let s = state;
  for (let guard = 0; guard < 400 && s.status === 'playing'; guard++) {
    const actor = s.players[s.current].id;
    const action = decideDomino(dominoView(s, actor), level, seed)!;
    expect(legalActionsFor(s, actor)).toContainEqual(action);
    s = must(s, action);
    const tilesInPlay = s.players.reduce((n, p) => n + p.hand.length, 0) + s.boneyard.length + s.line.length;
    expect(tilesInPlay).toBe(28);
  }
  expect(s.status).not.toBe('playing');
  return s;
}

describe('Domino — set and deal', () => {
  it('has the 28 distinct tiles of a double-six set', () => {
    const set = fullSet();
    expect(set).toHaveLength(28);
    expect(new Set(set.map((t) => t.id)).size).toBe(28);
    expect(set.filter((t) => t.a === t.b)).toHaveLength(7);
  });

  it.each([2, 3, 4])('deals 7 tiles to each of %i players, the rest is the boneyard', (n) => {
    const s = createDomino({ seats: seats(n), seed: 7 });
    s.players.forEach((p) => expect(p.hand).toHaveLength(7));
    expect(s.boneyard).toHaveLength(28 - 7 * n);
    const all = [...s.players.flatMap((p) => p.hand), ...s.boneyard].map((t) => t.id);
    expect(new Set(all).size).toBe(28);
  });

  it('rejects 1 or 5 seats and duplicate ids', () => {
    expect(() => createDomino({ seats: seats(1), seed: 1 })).toThrow();
    expect(() => createDomino({ seats: seats(5), seed: 1 })).toThrow();
    expect(() => createDomino({ seats: [seats(2)[0], seats(2)[0]], seed: 1 })).toThrow();
  });

  it('round 1 is opened by the highest double (always 6-6 with four players)', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = createDomino({ seats: seats(4), seed });
      expect(s.mustLead).toBe('6-6');
      expect(s.players[s.current].hand.some((t) => t.id === '6-6')).toBe(true);
    }
  });

  it('the opener must lead the required tile', () => {
    const s = createDomino({ seats: seats(4), seed: 3 });
    const me = s.players[s.current];
    const other = me.hand.find((t) => t.id !== s.mustLead)!;
    expect(validateDomino(s, { type: 'PLAY_TILE', playerId: me.id, tileId: other.id, end: 'right' })).toBe('must_lead');
    expect(legalActionsFor(s, me.id)).toEqual([{ type: 'PLAY_TILE', playerId: me.id, tileId: '6-6', end: 'right' }]);
  });
});

describe('Domino — turns and legal plays', () => {
  const base = () => {
    const s = createDomino({ seats: seats(2), seed: 11 });
    // A controlled position: line 2-5, p0 to play.
    return {
      ...s,
      current: 0,
      mustLead: null,
      line: [{ tile: T(2, 5), left: 2 as Pip, right: 5 as Pip, by: 'p1', seq: 0 }],
      players: [
        { ...s.players[0], hand: [T(5, 6), T(0, 2), T(1, 1)] },
        { ...s.players[1], hand: [T(3, 3), T(4, 4)] },
      ],
      boneyard: [T(0, 0), T(3, 4)],
    } as DominoState;
  };

  it('only the current player may act', () => {
    const s = base();
    expect(validateDomino(s, { type: 'PLAY_TILE', playerId: 'p1', tileId: '3-3', end: 'left' })).toBe('not_your_turn');
    expect(validateDomino(s, { type: 'DRAW', playerId: 'ghost' })).toBe('unknown_player');
  });

  it('a tile must match the end it is laid on', () => {
    const s = base();
    expect(validateDomino(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '5-6', end: 'left' })).toBe('no_match');
    expect(validateDomino(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '1-1', end: 'left' })).toBe('no_match');
    expect(validateDomino(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '3-3', end: 'left' })).toBe('tile_not_in_hand');
    const legal = legalActionsFor(s, 'p0');
    expect(legal).toEqual([
      { type: 'PLAY_TILE', playerId: 'p0', tileId: '5-6', end: 'right' },
      { type: 'PLAY_TILE', playerId: 'p0', tileId: '0-2', end: 'left' },
    ]);
  });

  it('laying a tile orients it and moves the turn on', () => {
    let s = base();
    s = must(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '5-6', end: 'right' });
    expect(s.line.map((p) => [p.left, p.right])).toEqual([[2, 5], [5, 6]]);
    s = { ...s, current: 0 };
    s = must(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '0-2', end: 'left' });
    expect(s.line.map((p) => [p.left, p.right])).toEqual([[0, 2], [2, 5], [5, 6]]);
    expect(s.current).toBe(1);
  });

  it('you cannot draw or pass while you can play', () => {
    const s = base();
    expect(validateDomino(s, { type: 'DRAW', playerId: 'p0' })).toBe('must_play');
    expect(validateDomino(s, { type: 'PASS', playerId: 'p0' })).toBe('must_play');
  });

  it('with no play you draw (keeping the turn) until the boneyard is empty, then pass', () => {
    let s = { ...base(), current: 1 } as DominoState; // p1 holds 3-3, 4-4 against ends 2/5
    expect(legalActionsFor(s, 'p1')).toEqual([{ type: 'DRAW', playerId: 'p1' }]);
    expect(validateDomino(s, { type: 'PASS', playerId: 'p1' })).toBe('must_draw');
    s = must(s, { type: 'DRAW', playerId: 'p1' });
    expect(s.current).toBe(1);
    expect(s.players[1].hand.map((t) => t.id)).toContain('0-0');
    expect(s.lacks.p1).toEqual([2, 5]);
    s = must(s, { type: 'DRAW', playerId: 'p1' });
    expect(s.boneyard).toHaveLength(0);
    expect(validateDomino(s, { type: 'DRAW', playerId: 'p1' })).toBe('boneyard_empty');
    expect(legalActionsFor(s, 'p1')).toEqual([{ type: 'PASS', playerId: 'p1' }]);
    s = must(s, { type: 'PASS', playerId: 'p1' });
    expect(s.current).toBe(0);
  });
});

describe('Domino — end of round and scoring', () => {
  it('emptying your hand wins the round and scores the other hands', () => {
    const s0 = createDomino({ seats: seats(3), seed: 2 });
    const s = {
      ...s0,
      current: 0,
      mustLead: null,
      line: [{ tile: T(1, 4), left: 1 as Pip, right: 4 as Pip, by: 'p1', seq: 0 }],
      players: [
        { ...s0.players[0], hand: [T(4, 6)] },
        { ...s0.players[1], hand: [T(3, 3), T(0, 5)] },
        { ...s0.players[2], hand: [T(6, 6)] },
      ],
    } as DominoState;
    const r = applyDomino(s, { type: 'PLAY_TILE', playerId: 'p0', tileId: '4-6', end: 'right' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe('round_over');
    expect(r.state.lastResult).toMatchObject({ winnerId: 'p0', reason: 'domino', points: 6 + 5 + 12 });
    expect(r.state.scores.p0).toBe(23);
    expect(r.events.map((e) => e.type)).toEqual(['played', 'round_over']);
  });

  it('a blocked round goes to the lowest hand; a tie for lowest scores nobody', () => {
    const s0 = createDomino({ seats: seats(2), seed: 4 });
    const blockedWith = (h0: Tile[], h1: Tile[]) =>
      ({
        ...s0,
        current: 0,
        mustLead: null,
        boneyard: [],
        line: [{ tile: T(3, 3), left: 3 as Pip, right: 3 as Pip, by: 'p1', seq: 0 }],
        players: [
          { ...s0.players[0], hand: h0 },
          { ...s0.players[1], hand: h1 },
        ],
      }) as DominoState;
    const s = blockedWith([T(0, 1)], [T(5, 6)]);
    expect(isBlocked(s)).toBe(true);
    const r = applyDomino(s, { type: 'PASS', playerId: 'p0' });
    expect(r.ok && r.state.lastResult).toMatchObject({ winnerId: 'p0', reason: 'blocked', points: 11 });
    const tie = applyDomino(blockedWith([T(0, 4)], [T(1, 2), T(0, 1)]), { type: 'PASS', playerId: 'p0' });
    expect(tie.ok && tie.state.lastResult).toMatchObject({ winnerId: null, points: 0 });
  });

  it('NEXT_ROUND deals again and the winner leads with any tile', () => {
    let s = playRound(createDomino({ seats: seats(3), seed: 21 }));
    const winner = s.lastResult!.winnerId;
    expect(validateDomino({ ...s, status: 'playing' }, { type: 'NEXT_ROUND', playerId: 'p0' })).toBe('round_not_over');
    if (s.status === 'game_over') return;
    s = must(s, { type: 'NEXT_ROUND', playerId: 'p1' });
    expect(s.round).toBe(2);
    if (winner) {
      expect(s.players[s.current].id).toBe(winner);
      expect(s.mustLead).toBeNull();
    }
  });

  it('the match ends when someone reaches the target; totals always add up', () => {
    for (const n of [2, 3, 4]) {
      let s = createDomino({ seats: seats(n), seed: 90 + n, targetScore: 100 });
      let sum = 0;
      for (let round = 0; round < 60 && s.status !== 'game_over'; round++) {
        s = playRound(s, 'hard', n);
        sum += s.lastResult!.points;
        expect(Object.values(s.scores).reduce((a, b) => a + b, 0)).toBe(sum);
        if (s.status === 'round_over') s = must(s, { type: 'NEXT_ROUND', playerId: 'p0' });
      }
      expect(s.status).toBe('game_over');
      expect(s.matchWinners.length).toBeGreaterThan(0);
      s.matchWinners.forEach((w) => expect(s.scores[w]).toBeGreaterThanOrEqual(100));
      expect(applyDomino(s, { type: 'DRAW', playerId: 'p0' }).ok).toBe(false);
    }
  });
});

describe('Domino — determinism, views and serialisation', () => {
  it('same seed + same actions → identical states', () => {
    const run = () => playRound(createDomino({ seats: seats(4), seed: 1234 }), 'hard', 5);
    expect(run()).toEqual(run());
    expect(createDomino({ seats: seats(4), seed: 1 }).players[0].hand).not.toEqual(createDomino({ seats: seats(4), seed: 2 }).players[0].hand);
  });

  it('a view hides other hands, the boneyard and the RNG', () => {
    const s = createDomino({ seats: seats(3), seed: 55 });
    const v = dominoView(s, 'p1');
    const text = JSON.stringify(v);
    expect(v.hand).toEqual(s.players[1].hand);
    for (const t of [...s.players[0].hand, ...s.players[2].hand, ...s.boneyard]) {
      if (!s.players[1].hand.some((m) => m.id === t.id)) expect(text).not.toContain(`"${t.id}"`);
    }
    expect(text).not.toContain('rngState');
    expect(text).not.toContain('seed');
    expect(v.seats.map((x) => x.tiles)).toEqual([7, 7, 7]);
    expect(v.boneyardCount).toBe(7);
  });

  it('views give the same legal actions as the engine', () => {
    let s = createDomino({ seats: seats(4), seed: 8 });
    for (let i = 0; i < 20 && s.status === 'playing'; i++) {
      const actor = s.players[s.current].id;
      expect(dominoView(s, actor).legal).toEqual(legalActionsFor(s, actor));
      s.players.filter((p) => p.id !== actor).forEach((p) => expect(dominoView(s, p.id).legal).toEqual([]));
      s = must(s, decideDomino(dominoView(s, actor), 'normal', 3)!);
    }
  });

  it('actions round-trip through JSON; malformed ones are refused', () => {
    const actions: DominoAction[] = [
      { type: 'PLAY_TILE', playerId: 'p0', tileId: '3-5', end: 'left' },
      { type: 'DRAW', playerId: 'p1' },
      { type: 'PASS', playerId: 'p2' },
      { type: 'NEXT_ROUND', playerId: 'p3' },
    ];
    for (const a of actions) expect(parseDominoAction(JSON.parse(JSON.stringify(a)))).toEqual(a);
    for (const bad of [null, 'x', [], { type: 'PLAY_TILE', playerId: 'p0', tileId: '7-7', end: 'left' }, { type: 'PLAY_TILE', playerId: 'p0', tileId: '1-2', end: 'up' }, { type: 'DRAW', playerId: 'p0', extra: 1 }, { type: 'WIN', playerId: 'p0' }, { type: 'DRAW', playerId: '<script>' }]) {
      expect(parseDominoAction(bad)).toBeNull();
    }
  });

  it('the host only accepts a seat acting for itself', () => {
    const host = new LocalHost(dominoRules, createDomino({ seats: seats(2), seed: 6 }));
    const actor = host.state.players[host.state.current].id;
    const other = actor === 'p0' ? 'p1' : 'p0';
    const move = legalActionsFor(host.state, actor)[0];
    expect(host.submit(other, move)).toEqual({ ok: false, error: 'impersonation' });
    expect(host.submit(HOUSE, move)).toEqual({ ok: false, error: 'forbidden' });
    expect(host.submit(actor, { ...move, cheat: true })).toEqual({ ok: false, error: 'malformed' });
    expect(host.submit(actor, move).ok).toBe(true);
  });
});

describe('Domino bots', () => {
  it('only ever choose legal actions, at every level, and finish rounds', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) for (let seed = 1; seed <= 12; seed++) playRound(createDomino({ seats: seats(2 + (seed % 3)), seed }), level, seed);
  });

  it('decide identically from the same view', () => {
    const s = createDomino({ seats: seats(3), seed: 77 });
    const v = dominoView(s, s.players[s.current].id);
    expect(decideDomino(v, 'hard', 9)).toEqual(decideDomino(v, 'hard', 9));
  });

  it('cannot be influenced by hidden tiles: same view, same decision', () => {
    const s = createDomino({ seats: seats(2), seed: 31 });
    const actor = s.players[s.current].id;
    const swapped: DominoState = { ...s, boneyard: [...s.boneyard].reverse() };
    expect(decideDomino(dominoView(s, actor), 'hard', 1)).toEqual(decideDomino(dominoView(swapped, actor), 'hard', 1));
  });

  it('hard beats easy over many rounds', () => {
    let hard = 0;
    let easy = 0;
    for (let seed = 1; seed <= 120; seed++) {
      let s = createDomino({ seats: seats(2), seed });
      for (let guard = 0; guard < 400 && s.status === 'playing'; guard++) {
        const actor = s.players[s.current].id;
        s = must(s, decideDomino(dominoView(s, actor), actor === 'p0' ? 'hard' : 'easy', seed)!);
      }
      if (s.lastResult?.winnerId === 'p0') hard++;
      if (s.lastResult?.winnerId === 'p1') easy++;
    }
    expect(hard).toBeGreaterThan(easy);
  });

  it('hand pips are counted from the tiles', () => {
    expect(handPips([T(6, 6), T(0, 1)])).toBe(13);
  });
});

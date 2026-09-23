import { describe, expect, it } from 'vitest';
import { createGame, GameConfigError, startNextRound } from '../game';
import type { GameState } from '../types';
import { DEFAULT_SETTINGS } from '../settings';
import { allCards, currentId, ok, players } from './helpers';

function findSeed(predicate: (s: GameState) => boolean, n = 4): GameState {
  for (let seed = 1; seed < 5000; seed++) {
    const state = createGame({ players: players(n), seed });
    if (predicate(state)) return state;
  }
  throw new Error('No seed found');
}
const starter = (s: GameState) => s.discardPile[0];

describe('createGame', () => {
  it('deals the starting hands and builds the piles', () => {
    const state = createGame({ players: players(4), seed: 11 });
    expect(state.status).toBe('PLAYING');
    for (const p of state.players) {
      expect(p.hand).toHaveLength(7);
      expect(p.cardsRemaining).toBe(7);
    }
    expect(state.discardPile).toHaveLength(1);
    expect(state.deck).toHaveLength(108 - 28 - 1);
    expect(allCards(state)).toHaveLength(108);
    expect(new Set(allCards(state).map((c) => c.id)).size).toBe(108);
  });

  it('accepts a custom number of starting cards', () => {
    const state = createGame({ players: players(3), startingCards: 5, seed: 2 });
    expect(state.players.map((p) => p.hand.length).filter((n) => n !== 5).every((n) => n === 7)).toBe(true);
    expect(state.deck.length + state.discardPile.length).toBe(108 - 15 - (state.players.some((p) => p.hand.length === 7) ? 2 : 0));
    expect(state.settings.startingCards).toBe(5);
  });

  it('starts with official rules (no house rules enabled)', () => {
    const state = createGame({ players: players(2), seed: 1 });
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.stacking || DEFAULT_SETTINGS.jumpIn || DEFAULT_SETTINGS.drawUntilPlayable).toBe(false);
    expect(DEFAULT_SETTINGS.forcePlay || DEFAULT_SETTINGS.teamMode).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const a = createGame({ players: players(4), seed: 99 });
    const b = createGame({ players: players(4), seed: 99 });
    const c = createGame({ players: players(4), seed: 100 });
    expect(a).toEqual(b);
    expect(a.players[0].hand).not.toEqual(c.players[0].hand);
  });

  it('marks humans and bots', () => {
    const state = createGame({ players: players(3), seed: 1 });
    expect(state.players.map((p) => p.isHuman)).toEqual([true, false, false]);
    expect(state.players[1].type).toBe('BOT');
  });

  it('player after the dealer starts', () => {
    const state = findSeed((s) => starter(s).type === 'NUMBER');
    expect(state.dealerIndex).toBe(3);
    expect(currentId(state)).toBe('p0');
    const custom = createGame({ players: players(4), seed: 5, dealerIndex: 1 });
    expect(custom.dealerIndex).toBe(1);
  });

  it('sets the current color from the starting card', () => {
    const state = findSeed((s) => starter(s).type === 'NUMBER');
    expect(state.currentColor).toBe(starter(state).color);
  });

  it('never starts with a Wild Draw Four', () => {
    for (let seed = 1; seed <= 500; seed++) {
      expect(starter(createGame({ players: players(4), seed })).type).not.toBe('WILD_DRAW_FOUR');
    }
  });

  it('starting Skip skips the first player', () => {
    const state = findSeed((s) => starter(s).type === 'SKIP');
    expect(currentId(state)).toBe('p1');
  });

  it('starting Reverse lets the dealer play first, counter-clockwise', () => {
    const state = findSeed((s) => starter(s).type === 'REVERSE');
    expect(state.direction).toBe('COUNTER_CLOCKWISE');
    expect(currentId(state)).toBe('p3');
  });

  it('starting Draw Two makes the first player draw 2 and lose the turn', () => {
    const state = findSeed((s) => starter(s).type === 'DRAW_TWO');
    expect(state.players[0].hand).toHaveLength(9);
    expect(currentId(state)).toBe('p1');
  });

  it('starting Wild lets the first player choose the color', () => {
    const state = findSeed((s) => starter(s).type === 'WILD');
    expect(state.currentColor).toBeNull();
    expect(state.pendingAction).toMatchObject({ type: 'CHOOSE_COLOR', playerId: 'p0', reason: 'STARTING_CARD' });
  });

  it('can be created in WAITING and dealt with START_GAME', () => {
    const waiting = createGame({ players: players(3), seed: 4, autoStart: false });
    expect(waiting.status).toBe('WAITING');
    expect(waiting.players[0].hand).toHaveLength(0);
    const started = ok(startNextRound(waiting));
    expect(started.status).toBe('PLAYING');
    expect(started.roundNumber).toBe(1);
    expect(started).toEqual(createGame({ players: players(3), seed: 4 }));
  });

  it('logs the round start', () => {
    const state = createGame({ players: players(2), seed: 1 });
    expect(state.log[0].type).toBe('ROUND_STARTED');
    expect(state.log[1].type).toBe('STARTING_CARD');
  });

  it('rejects invalid configurations', () => {
    expect(() => createGame({ players: players(1) })).toThrow(GameConfigError);
    expect(() => createGame({ players: players(11) })).toThrow(GameConfigError);
    expect(() => createGame({ players: [...players(2), players(1)[0]] })).toThrow(/unique/);
    expect(() => createGame({ players: players(10), startingCards: 11 })).toThrow(GameConfigError);
  });
});

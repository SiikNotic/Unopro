import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '@/game/engine';
import type { GameState } from '@/game/engine';
import { createPlayerView } from '../playerView';

const players = ['p0', 'p1', 'p2'].map((id) => ({ id, name: id, type: 'BOT' as const }));

describe('PlayerView', () => {
  const state = createGame({ players, seed: 5 });
  const view = createPlayerView(state, 'p1');

  it('keeps the viewer’s own hand', () => {
    expect(view.state.players[1].hand).toEqual(state.players[1].hand);
  });

  it('hides every other hand but keeps the public card counts', () => {
    expect(view.state.players[0].hand).toEqual([]);
    expect(view.state.players[2].hand).toEqual([]);
    expect(view.state.players.map((p) => p.cardsRemaining)).toEqual(state.players.map((p) => p.cardsRemaining));
  });

  it('hides the draw pile and the engine PRNG (future shuffles)', () => {
    expect(view.state.deck).toEqual([]);
    expect(view.deckSize).toBe(state.deck.length);
    expect(view.state.seed).toBe(0);
    expect(view.state.rngState).toBe(0);
  });

  it('keeps public information: discard pile, color, turn, UNO state, log', () => {
    expect(view.state.discardPile).toEqual(state.discardPile);
    expect(view.state.currentColor).toBe(state.currentColor);
    expect(view.state.currentPlayerIndex).toBe(state.currentPlayerIndex);
    expect(view.state.unoState).toEqual(state.unoState);
    expect(view.state.log).toEqual(state.log);
  });

  it('masks the id of a card another player just drew (ids reveal the card)', () => {
    let s: GameState = state;
    for (let seed = 1; seed < 300; seed++) {
      s = createGame({ players, seed });
      const current = s.players[s.currentPlayerIndex].id;
      const drawn = applyAction(s, { type: 'DRAW_CARD', playerId: current }).state;
      if (drawn.pendingAction?.type !== 'PLAY_DRAWN_CARD') continue;
      const other = players.find((p) => p.id !== current)!.id;
      expect(createPlayerView(drawn, other).state.pendingAction).toMatchObject({ cardId: 'hidden' });
      expect(createPlayerView(drawn, current).state.pendingAction).toEqual(drawn.pendingAction);
      return;
    }
    throw new Error('No seed produced a playable draw');
  });

  it('is a copy: changing the view never touches the real state', () => {
    const snapshot = structuredClone(state);
    const v = createPlayerView(state, 'p0');
    v.state.players[0].hand.pop();
    v.state.discardPile.pop();
    v.state.log.pop();
    expect(state).toEqual(snapshot);
  });
});

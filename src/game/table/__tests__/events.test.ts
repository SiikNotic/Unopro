import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayableCards } from '@/game/engine';
import type { GameState } from '@/game/engine';
import { getTableEvents } from '../events';

const players = [
  { id: 'you', name: 'You', type: 'HUMAN' as const },
  { id: 'b1', name: 'B1', type: 'BOT' as const },
  { id: 'b2', name: 'B2', type: 'BOT' as const },
];

function numberStart(): GameState {
  for (let seed = 1; ; seed++) {
    const s = createGame({ players, seed });
    if (s.discardPile[0].type === 'NUMBER') return s;
  }
}

describe('Table events', () => {
  it('reports a deal for the first state and for a new round', () => {
    const s = numberStart();
    const events = getTableEvents(null, s);
    expect(events.dealt).toBe(true);
    expect(events.drawn).toEqual([]);
    expect(events.newLog[0].type).toBe('ROUND_STARTED');
  });

  it('reports the card played and who played it', () => {
    let s = numberStart();
    let current = s.players[s.currentPlayerIndex];
    while (getPlayableCards(s, current.id).length === 0) {
      s = applyAction(s, { type: 'DRAW_CARD', playerId: current.id }).state;
      if (s.pendingAction) break;
      current = s.players[s.currentPlayerIndex];
    }
    const card = getPlayableCards(s, current.id)[0];
    const next = applyAction(s, { type: 'PLAY_CARD', playerId: current.id, cardId: card.id, chosenColor: 'RED' }).state;
    const events = getTableEvents(s, next);
    expect(events.played).toEqual({ card, playerId: current.id });
    expect(events.dealt).toBe(false);
  });

  it('reports drawn cards per player', () => {
    const s = numberStart();
    const current = s.players[s.currentPlayerIndex];
    const next = applyAction(s, { type: 'DRAW_CARD', playerId: current.id }).state;
    const events = getTableEvents(s, next);
    expect(events.drawn).toHaveLength(1);
    expect(events.drawn[0]).toMatchObject({ playerId: current.id, count: 1 });
    expect(next.players[s.currentPlayerIndex].hand.map((c) => c.id)).toContain(events.drawn[0].cardIds[0]);
  });

  it('reports UNO calls with their validity', () => {
    const s = numberStart();
    const next = applyAction(s, { type: 'CALL_UNO', playerId: 'b2' }).state;
    expect(getTableEvents(s, next).unoCalls).toEqual([{ playerId: 'b2', valid: false }]);
    expect(getTableEvents(next, next).unoCalls).toEqual([]);
  });
});

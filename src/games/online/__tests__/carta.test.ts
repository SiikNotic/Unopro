import { describe, expect, it } from 'vitest';
import { advanceCarta, applyCarta, botSeat, CARTA_TIMING, cartaDeadline, cartaView, createCarta, parseCartaAction } from '../server/carta';

const T0 = 5_000_000;
const seats = [
  { id: 's0', name: 'Ana', kind: 'human' as const },
  { id: 's1', name: 'Beto', kind: 'human' as const },
  { id: 's2', name: 'Bot 1', kind: 'bot' as const },
];

describe('online Carta', () => {
  it('deals and hides other hands, the draw pile and the seed', () => {
    const s = createCarta(seats, 777);
    expect(s.status).toBe('PLAYING');
    const v = cartaView(s, 's0');
    expect(v.state.players.find((p) => p.id === 's0')!.hand.length).toBe(7);
    expect(v.state.players.find((p) => p.id === 's1')!.hand).toEqual([]);
    expect(v.state.players.find((p) => p.id === 's1')!.cardsRemaining).toBe(7);
    expect(v.state.deck).toEqual([]);
    expect(v.deckSize).toBe(s.deck.length);
    expect(v.state.seed).toBe(0);
    expect(v.state.rngState).toBe(0);
  });

  it('rebuilds actions for the sender seat only and rejects junk', () => {
    expect(parseCartaAction({ type: 'DRAW_CARD', playerId: 's1' }, 's0')).toEqual({ type: 'DRAW_CARD', playerId: 's0' });
    expect(parseCartaAction({ type: 'PLAY_CARD', cardId: 'r-5-1', chosenColor: 'RED' }, 's0')).toEqual({ type: 'PLAY_CARD', playerId: 's0', cardId: 'r-5-1', chosenColor: 'RED' });
    expect(parseCartaAction({ type: 'PLAY_CARD', cardId: '<x>' }, 's0')).toBeNull();
    expect(parseCartaAction({ type: 'CHOOSE_COLOR', color: 'PINK' }, 's0')).toBeNull();
    expect(parseCartaAction({ type: 'START_GAME' }, 's0')).toBeNull();
    expect(parseCartaAction({ type: 'RESTART_GAME' }, 's0')).toBeNull();
    expect(parseCartaAction(null, 's0')).toBeNull();
  });

  it('a player can only act on their turn (the engine validates)', () => {
    const s = createCarta(seats, 12);
    const actor = s.players[s.currentPlayerIndex].id;
    const other = s.players.find((p) => p.id !== actor && p.id !== 's2')!.id;
    expect(applyCarta(s, { type: 'DRAW_CARD', playerId: other }, T0).ok).toBe(false);
  });

  it('bots and idle humans are played on the server clock', () => {
    let s = createCarta(seats, 99);
    let lastAt = T0;
    // before any timer nothing moves
    expect(advanceCarta(s, lastAt, lastAt + 10, 'normal').state).toBe(s);
    // a long time later the table has moved on (humans auto-played after the turn limit)
    const turns = s.turnNumber;
    const r = advanceCarta(s, lastAt, lastAt + CARTA_TIMING.turnLimit * 6, 'normal');
    expect(r.state.turnNumber).toBeGreaterThan(turns);
    s = r.state;
    lastAt = r.lastAt;
    const d = cartaDeadline(s, lastAt);
    expect(d === null || d > lastAt).toBe(true);
  });

  it('a seat whose player left is played by a bot', () => {
    const s = botSeat(createCarta(seats, 5), 's1');
    expect(s.players.find((p) => p.id === 's1')!.type).toBe('BOT');
  });
});

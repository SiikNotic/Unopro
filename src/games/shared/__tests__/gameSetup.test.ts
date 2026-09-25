import { describe, expect, it } from 'vitest';
import { createGame } from '@/game/engine';
import { cartaConfig } from '@/game/rules/cartaConfig';
import { getBotTable } from '@/game/bots';
import { CARTA_PLAYERS, DEFAULT_CARTA, normalizeCarta, normalizeCasino } from '../setup';
import type { CartaSetup } from '../setup';

describe('Carta setup reaches the engine', () => {
  it('deals the chosen table with the chosen rules', () => {
    for (const format of ['classic', 'teams'] as const)
      for (const players of CARTA_PLAYERS[format]) {
        const setup: CartaSetup = { format, players, target: 250, stacking: true, drawUntilPlayable: true };
        const state = createGame(cartaConfig(setup, format));
        expect(state.players).toHaveLength(players);
        expect(state.players[0]).toMatchObject({ id: 'you', type: 'HUMAN' });
        expect(state.players.slice(1).every((p) => p.type === 'BOT')).toBe(true);
        expect(state.settings).toMatchObject({ targetScore: 250, stacking: true, drawUntilPlayable: true, teamMode: format === 'teams' });
        // every bot seat has its own configured personality
        for (const p of state.players.slice(1)) expect(getBotTable(format).bots[p.id]).toBeDefined();
      }
  });

  it('teams alternate so partners sit across', () => {
    const state = createGame(cartaConfig({ ...DEFAULT_CARTA, format: 'teams', players: 6 }, 'teams'));
    expect(state.players.map((p) => p.teamId)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
  });

  it('defaults keep the classic game (4 players, 500 points, no house rules)', () => {
    const state = createGame(cartaConfig(DEFAULT_CARTA, 'classic'));
    expect(state.players).toHaveLength(4);
    expect(state.settings).toMatchObject({ targetScore: 500, stacking: false, drawUntilPlayable: false, teamMode: false });
  });

  it('stored setups are validated', () => {
    expect(normalizeCarta({ format: 'teams', players: 3, target: 999, stacking: 'yes' })).toEqual({ format: 'teams', players: 4, target: 500, stacking: false, drawUntilPlayable: false });
    expect(normalizeCarta(null)).toEqual(DEFAULT_CARTA);
    expect(normalizeCasino('blackjack', { scene: 'ocean' })).toEqual({ scene: 'ocean' });
    expect(normalizeCasino('roulette', { scene: 'nowhere' })).toEqual({ scene: 'city' });
  });
});

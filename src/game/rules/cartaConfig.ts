import type { CreateGameConfig, PlayerType } from '@/game/engine';
import type { GameModeId } from './modes';
import { CARTA_PLAYERS, cartaTeamOf } from '@/games/shared/setup';
import type { CartaSetup } from '@/games/shared/setup';

/**
 * The game this device deals from the Carta setup (GameSetupScreen): you in seat 0, bots in the others.
 * Names are language-neutral ids; the table shows localised names ("You", "Bot 1"…). In team play the teams
 * alternate around the table, so partners sit across from each other (you + Bot 2 vs Bot 1 + Bot 3).
 */
export function cartaConfig(setup: CartaSetup, mode: GameModeId | undefined): CreateGameConfig {
  const teams = mode === 'teams';
  const count = teams && !CARTA_PLAYERS.teams.includes(setup.players) ? 4 : setup.players;
  const players = Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'you' : `bot${i}`,
    name: i === 0 ? 'You' : `Bot ${i}`,
    type: (i === 0 ? 'HUMAN' : 'BOT') as PlayerType,
    ...(teams ? { teamId: cartaTeamOf(i) } : {}),
  }));
  return {
    players,
    ...(teams ? { teams: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }] } : {}),
    settings: { teamMode: teams, targetScore: setup.target, stacking: setup.stacking, drawUntilPlayable: setup.drawUntilPlayable },
  };
}

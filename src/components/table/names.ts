import type { GameState, Player } from '@/game/engine';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Localised display name. Names stored in GameState stay language-neutral. */
export function displayName(state: GameState, player: Player, localPlayerId: string, t: T): string {
  if (player.id === localPlayerId) return t('table.you');
  if (player.type === 'BOT') {
    const botIndex = state.players.filter((p) => p.type === 'BOT').findIndex((p) => p.id === player.id) + 1;
    return t('table.botName', { n: botIndex });
  }
  return player.name;
}

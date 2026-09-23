// Inferences any attentive player could make from public events in the current round.
import type { CardColor, GameState } from '@/game/engine';

/**
 * Colors each player probably lacks: they drew voluntarily while that color was active
 * (a human watching the table notices this too). Forgotten when they play that color
 * or receive penalty cards.
 */
export function inferMissingColors(state: GameState): Record<string, Set<CardColor>> {
  const missing: Record<string, Set<CardColor>> = Object.fromEntries(state.players.map((p) => [p.id, new Set<CardColor>()]));
  let color: CardColor | null = null;
  for (const entry of state.log) {
    if (entry.roundNumber !== state.roundNumber) continue;
    const pid = entry.playerId;
    switch (entry.type) {
      case 'STARTING_CARD':
        color = entry.card && entry.card.color !== 'WILD' ? entry.card.color : null;
        break;
      case 'PLAYER_PLAYED_CARD':
        if (entry.card && entry.card.color !== 'WILD') {
          color = entry.card.color;
          if (pid) missing[pid]?.delete(entry.card.color);
        }
        break;
      case 'COLOR_CHANGED':
        color = entry.color ?? color;
        break;
      case 'PLAYER_DREW_CARD':
        if (pid && color) missing[pid]?.add(color);
        break;
      case 'DRAW_PENALTY':
      case 'UNO_PENALTY':
        if (pid) missing[pid]?.clear();
        break;
    }
  }
  return missing;
}

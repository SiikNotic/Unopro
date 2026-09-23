// Maps a GameState change to the sounds it should trigger. Pure: no audio calls here.
import type { GameState } from '@/game/engine';
import { areTeammates } from '@/game/engine';
import { getTableEvents } from '@/game/table/events';
import type { SfxName } from './sfx';

export function soundsForChange(prev: GameState | null, next: GameState, localPlayerId: string): SfxName[] {
  const events = getTableEvents(prev, next);
  const sounds: SfxName[] = [];

  if (events.dealt && next.roundNumber > 0) sounds.push('roundStart');

  if (events.played) {
    switch (events.played.card.type) {
      case 'NUMBER':
        sounds.push('cardPlay');
        break;
      case 'SKIP':
      case 'REVERSE':
        sounds.push('special');
        break;
      case 'DRAW_TWO':
        sounds.push('drawTwo');
        break;
      case 'WILD':
        sounds.push('wild');
        break;
      case 'WILD_DRAW_FOUR':
        sounds.push('drawFour');
        break;
    }
  } else {
    if (events.colorChanged && !events.dealt) sounds.push('colorPick');
    if (events.drawn.length > 0 && !events.dealt) sounds.push('draw');
  }

  for (const call of events.unoCalls) sounds.push(call.valid ? 'uno' : 'error');
  if (events.unoPenalties.length > 0) sounds.push('error');

  const finished = (s: GameState | null) => !!s && (s.status === 'ROUND_OVER' || s.status === 'GAME_OVER');
  if (finished(next) && !finished(prev) && next.winnerId) {
    const won = next.winnerId === localPlayerId || areTeammates(next, next.winnerId, localPlayerId);
    sounds.push(won ? 'victory' : 'defeat');
  } else if (next.status === 'PLAYING' && !events.dealt) {
    const actor = (s: GameState) => s.pendingAction?.playerId ?? s.players[s.currentPlayerIndex].id;
    if (actor(next) === localPlayerId && prev && actor(prev) !== localPlayerId) sounds.push('turn');
  }
  return sounds;
}

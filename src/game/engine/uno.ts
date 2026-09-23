import type { GameState, Player } from './types';
import type { EngineContext } from './log';
import { addLog } from './log';

export function createUnoState(): GameState['unoState'] {
  return { playersWithOneCard: [], declaredPlayerIds: [], penaltyWindowPlayerId: null, calls: [] };
}

const without = (ids: string[], id: string) => ids.filter((x) => x !== id);

/**
 * Keeps unoState in sync after a player's hand changed.
 * - Playing down to one card without having called UNO opens the penalty window for that player.
 * - Drawing cancels any UNO status the player had.
 */
export function syncUnoAfterHandChange(state: GameState, player: Player, change: 'PLAYED' | 'DREW'): void {
  const uno = state.unoState;
  if (change === 'PLAYED' && player.hand.length === 1) {
    if (!uno.playersWithOneCard.includes(player.id)) uno.playersWithOneCard.push(player.id);
    if (!uno.declaredPlayerIds.includes(player.id)) uno.penaltyWindowPlayerId = player.id;
    return;
  }
  if (change === 'PLAYED' && player.hand.length > 1) return;
  uno.playersWithOneCard = without(uno.playersWithOneCard, player.id);
  uno.declaredPlayerIds = without(uno.declaredPlayerIds, player.id);
  if (uno.penaltyWindowPlayerId === player.id) uno.penaltyWindowPlayerId = null;
}

function isCurrent(state: GameState, player: Player): boolean {
  return state.players[state.currentPlayerIndex]?.id === player.id;
}

/**
 * The penalty window stays open until another player takes their turn (plays or draws).
 */
export function closeUnoWindowOnAction(state: GameState, actingPlayerId: string): void {
  const id = state.unoState.penaltyWindowPlayerId;
  if (id && id !== actingPlayerId) state.unoState.penaltyWindowPlayerId = null;
}

/**
 * Valid calls: holding exactly one card, or holding two cards on your own turn
 * (announcing UNO while playing the second-to-last card).
 */
export function registerUnoCall(state: GameState, ctx: EngineContext, player: Player): void {
  const uno = state.unoState;
  const cards = player.hand.length;
  let valid = false;
  let reason: string;

  if (cards === 1) {
    valid = true;
    reason = 'Player has one card';
  } else if (cards === 2 && isCurrent(state, player) && state.pendingAction?.type !== 'CHOOSE_COLOR') {
    valid = true;
    reason = 'Player announced UNO before playing their second-to-last card';
  } else {
    reason = `Player has ${cards} cards`;
  }

  uno.calls.push({ playerId: player.id, turnNumber: state.turnNumber, timestamp: ctx.timestamp, valid, reason });
  if (valid) {
    if (!uno.declaredPlayerIds.includes(player.id)) uno.declaredPlayerIds.push(player.id);
    if (uno.penaltyWindowPlayerId === player.id) uno.penaltyWindowPlayerId = null;
  }
  addLog(state, ctx, 'PLAYER_CALLED_UNO', `${player.name} called UNO (${valid ? 'valid' : 'invalid'}: ${reason})`, {
    playerId: player.id,
  });
}

export function getLastUnoCall(state: GameState) {
  return state.unoState.calls[state.unoState.calls.length - 1];
}

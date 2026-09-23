import type { CardColor, GameAction } from './types';

/** Action creators. The caller may attach a timestamp; the engine only records it in the log. */
export const Actions = {
  playCard: (playerId: string, cardId: string, chosenColor?: CardColor): GameAction => ({
    type: 'PLAY_CARD',
    playerId,
    cardId,
    chosenColor,
  }),
  drawCard: (playerId: string): GameAction => ({ type: 'DRAW_CARD', playerId }),
  chooseColor: (playerId: string, color: CardColor): GameAction => ({ type: 'CHOOSE_COLOR', playerId, color }),
  callUno: (playerId: string): GameAction => ({ type: 'CALL_UNO', playerId }),
  challengeUno: (playerId: string, targetId: string): GameAction => ({ type: 'CHALLENGE_UNO', playerId, targetId }),
  endTurn: (playerId: string): GameAction => ({ type: 'END_TURN', playerId }),
  startGame: (): GameAction => ({ type: 'START_GAME' }),
  restartGame: (): GameAction => ({ type: 'RESTART_GAME' }),
};

export function withTimestamp<T extends GameAction>(action: T, timestamp: number): T {
  return { ...action, timestamp };
}

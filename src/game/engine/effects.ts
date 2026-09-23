import type { Card, GameState, TurnDirection } from './types';

export interface EffectResult {
  skipNext: boolean;
  drawAmount: number;
  directionChanged: boolean;
  colorChoice: boolean;
}

export function applyCardEffect(card: Card): EffectResult {
  switch (card.type) {
    case 'skip':
      return { skipNext: true, drawAmount: 0, directionChanged: false, colorChoice: false };
    case 'reverse':
      return { skipNext: false, drawAmount: 0, directionChanged: true, colorChoice: false };
    case 'draw_two':
      return { skipNext: true, drawAmount: 2, directionChanged: false, colorChoice: false };
    case 'wild':
      return { skipNext: false, drawAmount: 0, directionChanged: false, colorChoice: true };
    case 'wild_draw_four':
      return { skipNext: true, drawAmount: 4, directionChanged: false, colorChoice: true };
    default:
      return { skipNext: false, drawAmount: 0, directionChanged: false, colorChoice: false };
  }
}

export function reverseDirection(direction: TurnDirection): TurnDirection {
  return direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
}

export function getNextPlayerIndex(
  state: GameState,
  skip: boolean
): number {
  const n = state.players.length;
  const step = skip ? 2 : 1;
  if (state.direction === 'clockwise') {
    return (state.currentPlayerIndex + step) % n;
  }
  return ((state.currentPlayerIndex - step) % n + n) % n;
}

// Where each player sits around the visual table. Pure data — no React, no engine rules.
import type { GameState, Player } from '@/game/engine';
import { areTeammates } from '@/game/engine';

export type SeatPosition = 'bottom' | 'left' | 'top-left' | 'top' | 'top-right' | 'right';

export type SeatRelation = 'self' | 'teammate' | 'opponent';

export interface Seat {
  playerId: string;
  position: SeatPosition;
  relation: SeatRelation;
}

/**
 * Seat order for each table size, starting with the local player and following the engine's
 * CLOCKWISE order (seat index + 1) as seen from above: bottom → left → top → right.
 */
export const SEAT_LAYOUTS: Record<number, SeatPosition[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top-left', 'top-right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'left', 'top-left', 'top-right', 'right'],
  6: ['bottom', 'left', 'top-left', 'top', 'top-right', 'right'],
};

/** Opponents on the sides are drawn vertically; everyone else horizontally. */
export function seatOrientation(position: SeatPosition): 'horizontal' | 'vertical' {
  return position === 'left' || position === 'right' ? 'vertical' : 'horizontal';
}

const LOCAL_TYPES: Player['type'][] = ['HUMAN', 'LOCAL_HUMAN'];

/** The player this device renders at the bottom: the first local human, or seat 0 as a fallback. */
export function getLocalPlayerId(state: GameState): string {
  return (state.players.find((p) => LOCAL_TYPES.includes(p.type)) ?? state.players[0]).id;
}

function layoutFor(count: number): SeatPosition[] {
  if (SEAT_LAYOUTS[count]) return SEAT_LAYOUTS[count];
  // Larger tables: keep the sides and spread the rest across the top.
  const top: SeatPosition[] = Array.from({ length: count - 3 }, (_, i) =>
    i < (count - 3) / 2 ? 'top-left' : 'top-right'
  );
  return ['bottom', 'left', ...top, 'right'];
}

/** Seats rotated so the local player is at the bottom, with their relation (team mode aware). */
export function getSeats(state: GameState, localPlayerId: string): Seat[] {
  const n = state.players.length;
  const localIndex = Math.max(0, state.players.findIndex((p) => p.id === localPlayerId));
  const layout = layoutFor(n);
  return layout.map((position, offset) => {
    const player = state.players[(localIndex + offset) % n];
    const relation: SeatRelation =
      player.id === localPlayerId ? 'self' : areTeammates(state, player.id, localPlayerId) ? 'teammate' : 'opponent';
    return { playerId: player.id, position, relation };
  });
}

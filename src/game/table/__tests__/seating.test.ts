import { describe, expect, it } from 'vitest';
import { createGame } from '@/game/engine';
import type { PlayerConfig } from '@/game/engine';
import { getLocalPlayerId, getSeats, seatOrientation } from '../seating';

const four: PlayerConfig[] = [
  { id: 'you', name: 'You', type: 'HUMAN' },
  { id: 'b1', name: 'B1', type: 'BOT' },
  { id: 'b2', name: 'B2', type: 'BOT' },
  { id: 'b3', name: 'B3', type: 'BOT' },
];

describe('Seating', () => {
  it('puts the local human at the bottom and the rest clockwise', () => {
    const state = createGame({ players: four, seed: 1 });
    expect(getLocalPlayerId(state)).toBe('you');
    expect(getSeats(state, 'you').map((s) => [s.playerId, s.position])).toEqual([
      ['you', 'bottom'],
      ['b1', 'left'],
      ['b2', 'top'],
      ['b3', 'right'],
    ]);
  });

  it('rotates when the local player is not in seat 0', () => {
    const players = [four[1], four[2], four[0], four[3]];
    const state = createGame({ players, seed: 1 });
    expect(getSeats(state, 'you').map((s) => s.playerId)).toEqual(['you', 'b3', 'b1', 'b2']);
  });

  it('supports other table sizes', () => {
    expect(getSeats(createGame({ players: four.slice(0, 2), seed: 1 }), 'you').map((s) => s.position)).toEqual([
      'bottom',
      'top',
    ]);
    expect(getSeats(createGame({ players: four.slice(0, 3), seed: 1 }), 'you').map((s) => s.position)).toEqual([
      'bottom',
      'top-left',
      'top-right',
    ]);
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, type: 'BOT' as const }));
    const seats = getSeats(createGame({ players: eight, seed: 1 }), 'p0');
    expect(seats).toHaveLength(8);
    expect(seats[0].position).toBe('bottom');
    expect(seats.at(-1)?.position).toBe('right');
  });

  it('marks the teammate in 2 vs 2 using only GameState', () => {
    const players = [
      { ...four[0], teamId: 'A' },
      { ...four[1], teamId: 'B' },
      { ...four[2], teamId: 'A' },
      { ...four[3], teamId: 'B' },
    ];
    const state = createGame({
      players,
      teams: [
        { id: 'A', name: 'A' },
        { id: 'B', name: 'B' },
      ],
      settings: { teamMode: true },
      seed: 1,
    });
    expect(getSeats(state, 'you').map((s) => s.relation)).toEqual(['self', 'opponent', 'teammate', 'opponent']);
  });

  it('knows which seats are vertical', () => {
    expect(seatOrientation('left')).toBe('vertical');
    expect(seatOrientation('top')).toBe('horizontal');
  });
});

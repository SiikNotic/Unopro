import { describe, expect, it } from 'vitest';
import { isOnlineGame } from '../navigation';
import { SEAT_RANGE } from '@/games/online/protocol';

describe('isOnlineGame', () => {
  it('accepts every game that has online rooms (a missing one sent the room screen to Domino)', () => {
    for (const game of Object.keys(SEAT_RANGE)) expect(isOnlineGame(game)).toBe(true);
    expect(isOnlineGame('billiards')).toBe(true);
  });

  it('rejects anything else read back from history', () => {
    for (const bad of ['', 'poker', 'toString', '__proto__', 'constructor', 1, null, undefined, {}]) expect(isOnlineGame(bad)).toBe(false);
  });
});

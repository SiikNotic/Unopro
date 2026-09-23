import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '@/game/engine';
import type { GameState } from '@/game/engine';
import { getActingPlayerId, placeholderBot } from '../placeholderBot';

function playOut(state: GameState): GameState {
  let steps = 0;
  while (state.status === 'PLAYING' && steps++ < 2000) {
    const actor = getActingPlayerId(state)!;
    const action = placeholderBot.decide(state, actor);
    expect(action).not.toBeNull();
    const result = applyAction(state, action!);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe('Placeholder controller', () => {
  it('only proposes legal actions and finishes rounds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const players = Array.from({ length: 2 + (seed % 3) }, (_, i) => ({ id: `p${i}`, name: `P${i}`, type: 'BOT' as const }));
      expect(playOut(createGame({ players, seed })).status).toBe('ROUND_OVER');
    }
  });

  it('does nothing when it is not that player’s move', () => {
    const state = createGame({ players: [{ id: 'a', name: 'A', type: 'BOT' }, { id: 'b', name: 'B', type: 'BOT' }], seed: 3 });
    const idle = getActingPlayerId(state) === 'a' ? 'b' : 'a';
    expect(placeholderBot.decide(state, idle)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { Card, GameState } from '@/game/engine';
import { createRng, shuffleDeck } from '@/game/engine';
import { createBotController } from '../botController';
import { chooseAction } from '../strategy';
import { resolveProfile } from '../profiles';
import { createPlayerView } from '../playerView';
import type { PlayerView } from '../playerView';
import { LINEUPS, simulateRound } from './helpers';

/** Redistributes every card the bot cannot see (other hands + draw pile) and changes the engine PRNG. */
function scrambleHidden(state: GameState, viewerId: string, seed: number): GameState {
  const s = structuredClone(state);
  const others = s.players.filter((p) => p.id !== viewerId);
  const pool: Card[] = shuffleDeck([...s.deck, ...others.flatMap((p) => p.hand)], createRng(seed));
  for (const p of others) p.hand = pool.splice(0, p.hand.length);
  s.deck = pool;
  s.rngState = (s.rngState ^ 0xdeadbeef) >>> 0;
  s.seed = (s.seed + 12345) >>> 0;
  return s;
}

describe('Bots have no privileged information', () => {
  it('make exactly the same decision whatever the hidden cards and engine PRNG are', () => {
    let checked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const controller = createBotController({ seed: 77, fallback: LINEUPS[seed % LINEUPS.length] });
      simulateRound({
        seed,
        onDecision: (state) => {
          const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
          const expected = controller.decide(state, actor);
          const scrambled = scrambleHidden(state, actor, seed * 31 + state.turnNumber);
          expect(controller.decide(scrambled, actor)).toEqual(expected);
          checked++;
        },
      });
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('the strategy only ever receives a view without other hands or the deck', () => {
    const seen: PlayerView[] = [];
    const profile = resolveProfile('hard', 'balanced');
    simulateRound({
      seed: 3,
      onDecision: (state) => {
        const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
        const view = createPlayerView(state, actor);
        chooseAction(view, profile, createRng(1));
        seen.push(view);
      },
    });
    for (const view of seen) {
      for (const p of view.state.players) if (p.id !== view.playerId) expect(p.hand).toEqual([]);
      expect(view.state.deck).toEqual([]);
      expect(view.state.rngState).toBe(0);
    }
  });
});

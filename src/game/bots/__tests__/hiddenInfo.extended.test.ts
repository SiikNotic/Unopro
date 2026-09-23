import { describe, expect, it } from 'vitest';
import type { Card, GameState } from '@/game/engine';
import { areTeammates, createRng, shuffleDeck } from '@/game/engine';
import { createBotController } from '../botController';
import { LINEUPS, simulateRound } from './helpers';

type Perturbation = (state: GameState, viewerId: string, salt: number) => GameState;

const others = (s: GameState, viewer: string) => s.players.filter((p) => p.id !== viewer);

/** Redistributes cards among the given hands (and optionally the deck), keeping every public count. */
function redistribute(s: GameState, hands: GameState['players'], withDeck: boolean, salt: number): GameState {
  const pool: Card[] = shuffleDeck([...(withDeck ? s.deck : []), ...hands.flatMap((p) => p.hand)], createRng(salt));
  for (const p of hands) p.hand = pool.splice(0, p.hand.length);
  if (withDeck) s.deck = pool;
  return s;
}

const PERTURBATIONS: Record<string, Perturbation> = {
  'opponents’ hands only (swapped with the deck)': (state, viewer, salt) => {
    const s = structuredClone(state);
    return redistribute(s, others(s, viewer).filter((p) => !areTeammates(s, p.id, viewer)), true, salt);
  },
  'teammate’s hand only (swapped with the deck)': (state, viewer, salt) => {
    const s = structuredClone(state);
    const mates = others(s, viewer).filter((p) => areTeammates(s, p.id, viewer));
    return redistribute(s, mates, true, salt);
  },
  'draw pile order only': (state, _viewer, salt) => {
    const s = structuredClone(state);
    s.deck = shuffleDeck(s.deck, createRng(salt));
    return s;
  },
  'engine seed and PRNG state only': (state, _viewer, salt) => {
    const s = structuredClone(state);
    s.rngState = (s.rngState ^ (salt * 2654435761)) >>> 0;
    s.seed = (s.seed + salt) >>> 0;
    return s;
  },
  'ids of every hidden card (same cards, different ids)': (state, viewer, salt) => {
    const s = structuredClone(state);
    const relabel = (c: Card, i: number) => ({ ...c, id: `hidden-${salt}-${i}-${c.id.split('').reverse().join('')}` });
    let i = 0;
    for (const p of others(s, viewer)) p.hand = p.hand.map((c) => relabel(c, i++));
    s.deck = s.deck.map((c) => relabel(c, i++));
    return s;
  },
  'everything hidden at once': (state, viewer, salt) => {
    const s = structuredClone(state);
    redistribute(s, others(s, viewer), true, salt);
    s.rngState = (s.rngState + salt) >>> 0;
    return s;
  },
};

describe('Bots decide only from public information', () => {
  for (const [name, perturb] of Object.entries(PERTURBATIONS)) {
    for (const teams of [false, true]) {
      it(`same decision when changing ${name} (${teams ? '2 vs 2' : 'classic'})`, () => {
        let compared = 0;
        let changedHidden = 0;
        for (let seed = 1; seed <= 12; seed++) {
          const controller = createBotController({ seed: 5, fallback: LINEUPS[(seed * 4) % LINEUPS.length] });
          simulateRound({
            seed,
            teams,
            onDecision: (state) => {
              const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
              const perturbed = perturb(state, actor, seed * 1000 + state.log.length);
              if (JSON.stringify(perturbed) !== JSON.stringify(state)) changedHidden++;
              // Everything public stays identical
              expect(perturbed.discardPile).toEqual(state.discardPile);
              expect(perturbed.players.map((p) => p.cardsRemaining)).toEqual(state.players.map((p) => p.cardsRemaining));
              expect(perturbed.players.find((p) => p.id === actor)!.hand).toEqual(state.players.find((p) => p.id === actor)!.hand);
              expect(controller.decide(perturbed, actor)).toEqual(controller.decide(state, actor));
              compared++;
            },
          });
        }
        expect(compared).toBeGreaterThan(300);
        // The perturbation really changed hidden data (teammate case only applies in team mode).
        if (teams || !name.startsWith('teammate')) expect(changedHidden).toBeGreaterThan(compared / 2);
      });
    }
  }
});

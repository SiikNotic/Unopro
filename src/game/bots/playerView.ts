// What a single player is allowed to know. Bots only ever receive this view, never the full GameState.
import type { GameState } from '@/game/engine';

export interface PlayerView {
  playerId: string;
  /**
   * A GameState with every private field removed:
   * - other players' hands are emptied (their public `cardsRemaining` stays),
   * - the draw pile contents are removed (its size is kept in `deckSize`),
   * - the engine's seed and PRNG state are zeroed (they would reveal future shuffles),
   * - another player's "drawn card" id is masked (card ids encode the card).
   * It is still a valid GameState, so the engine's own validateAction can check the viewer's actions.
   */
  state: GameState;
  deckSize: number;
}

export function createPlayerView(full: GameState, playerId: string): PlayerView {
  const state: GameState = {
    ...full,
    players: full.players.map((p) =>
      p.id === playerId ? { ...p, hand: p.hand.map((c) => ({ ...c })) } : { ...p, hand: [] }
    ),
    teams: full.teams.map((t) => ({ ...t })),
    settings: { ...full.settings },
    deck: [],
    discardPile: full.discardPile.map((c) => ({ ...c })),
    pendingAction:
      full.pendingAction?.type === 'PLAY_DRAWN_CARD' && full.pendingAction.playerId !== playerId
        ? { ...full.pendingAction, cardId: 'hidden' }
        : full.pendingAction
          ? { ...full.pendingAction }
          : null,
    unoState: {
      ...full.unoState,
      playersWithOneCard: [...full.unoState.playersWithOneCard],
      declaredPlayerIds: [...full.unoState.declaredPlayerIds],
      calls: full.unoState.calls.map((c) => ({ ...c })),
    },
    scores: { ...full.scores },
    teamScores: { ...full.teamScores },
    rounds: full.rounds.map((r) => ({ ...r, handPoints: { ...r.handPoints } })),
    log: full.log.map((e) => ({ ...e })),
    seed: 0,
    rngState: 0,
  };
  return { playerId, state, deckSize: full.deck.length };
}

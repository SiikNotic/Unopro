// What one seat may know. Bots and the UI only ever get this, never the full DominoState.
import { legalMoves } from './rules';
import type { DominoAction, DominoState, DominoStatus, PlacedTile, Pip, RoundResult, Tile } from './types';
import type { SeatKind } from '@/games/shared/multiplayer/types';

export interface DominoSeatView {
  id: string;
  name: string;
  kind: SeatKind;
  tiles: number;
  score: number;
  lacks: Pip[];
}

export interface DominoView {
  me: string;
  hand: Tile[];
  seats: DominoSeatView[];
  line: PlacedTile[];
  boneyardCount: number;
  currentId: string;
  status: DominoStatus;
  round: number;
  targetScore: number;
  mustLead: string | null;
  lastResult: RoundResult | null;
  matchWinners: string[];
  turn: number;
  /** Legal actions for `me` right now (empty when it is someone else's turn). */
  legal: DominoAction[];
}

/**
 * Removes everything private: other hands (only their sizes stay), the boneyard's contents, the seed and
 * PRNG state (they would reveal every future deal). At round end hands are still hidden; the result
 * carries the pip totals a real table would count aloud.
 */
export function dominoView(state: DominoState, me: string): DominoView {
  const self = state.players.find((p) => p.id === me);
  const current = state.players[state.current];
  const view: DominoView = {
    me,
    hand: self ? self.hand.map((t) => ({ ...t })) : [],
    seats: state.players.map((p) => ({ id: p.id, name: p.name, kind: p.kind, tiles: p.hand.length, score: state.scores[p.id] ?? 0, lacks: [...(state.lacks[p.id] ?? [])] })),
    line: state.line.map((t) => ({ ...t, tile: { ...t.tile } })),
    boneyardCount: state.boneyard.length,
    currentId: current.id,
    status: state.status,
    round: state.round,
    targetScore: state.settings.targetScore,
    // Only the seat holding the required opening tile learns which tile it is.
    mustLead: self && state.mustLead && self.hand.some((t) => t.id === state.mustLead) ? state.mustLead : null,
    lastResult: state.lastResult ? { ...state.lastResult, pips: { ...state.lastResult.pips } } : null,
    matchWinners: [...state.matchWinners],
    turn: state.turn,
    legal: [],
  };
  if (self && state.status === 'playing' && current.id === me) {
    view.legal = legalMoves({ playerId: me, hand: self.hand, line: state.line, boneyardCount: state.boneyard.length, mustLead: state.mustLead });
  } else if (self && state.status === 'round_over') view.legal = [{ type: 'NEXT_ROUND', playerId: me }];
  return view;
}

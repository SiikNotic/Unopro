// What one seat may know: its own card, the called balls and everyone's public progress (how many
// daubs they made — you can see people daubing). Never other cards, never the ball order or the RNG.
import type { SeatKind } from '@/games/shared/multiplayer/types';
import { hasBingo, markable } from './rules';
import type { BingoResult, BingoStatus, BingoState } from './types';

export interface BingoSeatView {
  id: string;
  name: string;
  kind: SeatKind;
  daubs: number;
  score: number;
  won: boolean;
}

export interface BingoView {
  me: string;
  card: number[];
  marks: boolean[];
  seats: BingoSeatView[];
  called: number[];
  status: BingoStatus;
  round: number;
  winners: string[];
  lastResult: BingoResult | null;
  claimBlockedUntil: number;
  turn: number;
  /** Called numbers on my card still to daub. */
  toMark: number[];
  /** My daubs already make a line. */
  canClaim: boolean;
}

export function bingoView(state: BingoState, me: string): BingoView {
  const self = state.players.find((p) => p.id === me);
  const card = self ? [...self.card] : [];
  const marks = self ? [...self.marks] : [];
  const open = state.status !== 'round_over';
  return {
    me,
    card,
    marks,
    seats: state.players.map((p) => ({ id: p.id, name: p.name, kind: p.kind, daubs: p.marks.filter(Boolean).length - 1, score: state.scores[p.id] ?? 0, won: state.winners.includes(p.id) })),
    called: [...state.called],
    status: state.status,
    round: state.round,
    winners: [...state.winners],
    lastResult: state.lastResult ? { ...state.lastResult, winners: [...state.lastResult.winners] } : null,
    claimBlockedUntil: state.claimBlockedUntil[me] ?? 0,
    turn: state.turn,
    toMark: self && open ? markable(card, marks, state.called) : [],
    canClaim: !!self && open && !state.winners.includes(me) && hasBingo(marks),
  };
}

// Bingo — match lifecycle and the single entry point that changes state (applyBingo). Pure and
// deterministic: the same config + seed + actions always give the same states.
import { createRng } from '@/games/shared/rng';
import type { ApplyResult } from '@/games/shared/multiplayer/types';
import { BALLS } from './types';
import type { BingoAction, BingoConfig, BingoError, BingoEvent, BingoPlayer, BingoResult, BingoState } from './types';
import { FALSE_CLAIM_PENALTY, PLAYERS_MAX, PLAYERS_MIN, ROUND_POINTS, freshMarks, generateCard, hasBingo, newDrawOrder } from './rules';

export function createBingo(config: BingoConfig): BingoState {
  const n = config.seats.length;
  if (n < PLAYERS_MIN || n > PLAYERS_MAX) throw new Error(`Bingo needs ${PLAYERS_MIN}-${PLAYERS_MAX} players`);
  if (new Set(config.seats.map((s) => s.id)).size !== n) throw new Error('Seat ids must be unique');
  const base: BingoState = {
    version: 1,
    seed: config.seed >>> 0,
    rngState: config.seed >>> 0,
    round: 0,
    status: 'playing',
    players: config.seats.map((s) => ({ ...s, card: [], marks: [] })),
    drawOrder: [],
    called: [],
    winners: [],
    claimBlockedUntil: {},
    scores: Object.fromEntries(config.seats.map((s) => [s.id, 0])),
    lastResult: null,
    turn: 0,
  };
  return deal(base);
}

/** New cards for everyone and a new ball order, all from the match's PRNG. */
function deal(prev: BingoState): BingoState {
  const rng = createRng(prev.rngState);
  const players: BingoPlayer[] = prev.players.map((p) => ({ ...p, card: generateCard(rng), marks: freshMarks() }));
  const drawOrder = newDrawOrder(rng);
  return { ...prev, rngState: rng.state(), round: prev.round + 1, status: 'playing', players, drawOrder, called: [], winners: [], claimBlockedUntil: {}, lastResult: null };
}

export function validateBingo(state: BingoState, action: BingoAction): BingoError | null {
  switch (action.type) {
    case 'CALL_NUMBER':
      if (state.status === 'closing') return 'closing';
      if (state.status !== 'playing') return 'not_playing';
      return state.called.length < BALLS ? null : 'no_balls';
    case 'CLOSE_ROUND':
      return state.status === 'closing' || (state.status === 'playing' && state.called.length === BALLS) ? null : 'cannot_close';
  }
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return 'unknown_player';
  if (action.type === 'NEXT_ROUND') return state.status === 'round_over' ? null : 'round_not_over';
  if (state.status === 'round_over') return 'not_playing';
  if (action.type === 'MARK_NUMBER') {
    const i = player.card.indexOf(action.number);
    if (action.number === 0 || i < 0) return 'not_on_card';
    if (!state.called.includes(action.number)) return 'not_called';
    return player.marks[i] ? 'already_marked' : null;
  }
  // CLAIM: checked here only for being allowed to claim; whether it's a real BINGO is decided in apply.
  if (state.winners.includes(player.id)) return 'already_claimed';
  return state.called.length < (state.claimBlockedUntil[player.id] ?? 0) ? 'claim_blocked' : null;
}

export function applyBingo(state: BingoState, action: BingoAction): ApplyResult<BingoState, BingoEvent> {
  const error = validateBingo(state, action);
  if (error) return { ok: false, error };
  const next: BingoState = { ...state, turn: state.turn + 1 };
  switch (action.type) {
    case 'CALL_NUMBER': {
      const number = state.drawOrder[state.called.length];
      const called = [...state.called, number];
      return { ok: true, state: { ...next, called }, events: [{ type: 'called', number, count: called.length }] };
    }
    case 'CLOSE_ROUND':
      return finish(next);
    case 'NEXT_ROUND':
      return { ok: true, state: deal(next), events: [{ type: 'dealt', round: state.round + 1 }] };
    case 'MARK_NUMBER': {
      const players = state.players.map((p) => (p.id === action.playerId ? { ...p, marks: p.marks.map((m, i) => m || p.card[i] === action.number) } : p));
      return { ok: true, state: { ...next, players }, events: [{ type: 'marked', playerId: action.playerId, number: action.number }] };
    }
    case 'CLAIM': {
      const player = state.players.find((p) => p.id === action.playerId)!;
      const valid = hasBingo(player.marks);
      const events: BingoEvent[] = [{ type: 'claimed', playerId: player.id, valid }];
      if (!valid) {
        return { ok: true, state: { ...next, claimBlockedUntil: { ...state.claimBlockedUntil, [player.id]: state.called.length + FALSE_CLAIM_PENALTY } }, events };
      }
      // The first valid BINGO stops the caller; anyone else who has one before the round is closed shares it.
      return { ok: true, state: { ...next, status: 'closing', winners: [...state.winners, player.id] }, events };
    }
  }
}

/** Winners split ROUND_POINTS evenly (rounded down). Nobody wins if every ball went out unclaimed. */
function finish(state: BingoState): ApplyResult<BingoState, BingoEvent> {
  const winners = state.winners;
  const pointsEach = winners.length ? Math.floor(ROUND_POINTS / winners.length) : 0;
  const scores = { ...state.scores };
  for (const w of winners) scores[w] += pointsEach;
  const result: BingoResult = { round: state.round, winners: [...winners], atCall: winners.length ? state.called.length : 0, pointsEach };
  return { ok: true, state: { ...state, status: 'round_over', scores, lastResult: result }, events: [{ type: 'round_over', result }] };
}

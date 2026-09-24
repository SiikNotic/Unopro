// Domino — match lifecycle and the single entry point that changes state (applyDomino).
// Pure and deterministic: the same config + seed + actions always produce the same states.
import { createRng, shuffle } from '@/games/shared/rng';
import type { ApplyResult } from '@/games/shared/multiplayer/types';
import { DEFAULT_TARGET, HAND_SIZE, PLAYERS_MAX, PLAYERS_MIN, endsFor, fullSet, handPips, legalMoves, openEnds, openingTile, placeAt } from './rules';
import type { DominoAction, DominoConfig, DominoError, DominoEvent, DominoPlayer, DominoState, Pip, RoundResult } from './types';

export function createDomino(config: DominoConfig): DominoState {
  const n = config.seats.length;
  if (n < PLAYERS_MIN || n > PLAYERS_MAX) throw new Error(`Domino needs ${PLAYERS_MIN}-${PLAYERS_MAX} players`);
  if (new Set(config.seats.map((s) => s.id)).size !== n) throw new Error('Seat ids must be unique');
  const base: DominoState = {
    version: 1,
    seed: config.seed >>> 0,
    rngState: config.seed >>> 0,
    round: 0,
    status: 'playing',
    settings: { targetScore: config.targetScore ?? DEFAULT_TARGET },
    players: config.seats.map((s) => ({ id: s.id, name: s.name, kind: s.kind, hand: [] })),
    boneyard: [],
    line: [],
    current: 0,
    mustLead: null,
    lacks: {},
    scores: Object.fromEntries(config.seats.map((s) => [s.id, 0])),
    lastResult: null,
    matchWinners: [],
    turn: 0,
  };
  return dealRound(base, null).state;
}

/**
 * Shuffles the 28 tiles and deals 7 to each player; the rest is the boneyard (none with 4 players).
 * Round 1 (or after a tied block): the holder of the highest double opens with it. Otherwise the previous
 * round's winner opens with any tile.
 */
function dealRound(prev: DominoState, leaderId: string | null): { state: DominoState; events: DominoEvent[] } {
  const rng = createRng(prev.rngState);
  const tiles = shuffle(fullSet(), rng);
  const players: DominoPlayer[] = prev.players.map((p, i) => ({ ...p, hand: tiles.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE) }));
  const boneyard = tiles.slice(players.length * HAND_SIZE);
  let current: number;
  let mustLead: string | null = null;
  const leaderSeat = leaderId ? players.findIndex((p) => p.id === leaderId) : -1;
  if (leaderSeat >= 0) current = leaderSeat;
  else {
    const open = openingTile(players.map((p) => p.hand));
    current = open.seat;
    mustLead = open.tile.id;
  }
  const state: DominoState = {
    ...prev,
    rngState: rng.state(),
    round: prev.round + 1,
    status: 'playing',
    players,
    boneyard,
    line: [],
    current,
    mustLead,
    lacks: Object.fromEntries(players.map((p) => [p.id, []])),
    lastResult: null,
  };
  return { state, events: [{ type: 'dealt', round: state.round, leaderId: players[current].id }] };
}

export function currentPlayer(state: DominoState): DominoPlayer {
  return state.players[state.current];
}

export function legalActionsFor(state: DominoState, playerId: string): DominoAction[] {
  if (state.status === 'round_over') return [{ type: 'NEXT_ROUND', playerId }];
  if (state.status !== 'playing' || currentPlayer(state).id !== playerId) return [];
  const p = currentPlayer(state);
  return legalMoves({ playerId, hand: p.hand, line: state.line, boneyardCount: state.boneyard.length, mustLead: state.mustLead });
}

export function validateDomino(state: DominoState, action: DominoAction): DominoError | null {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return 'unknown_player';
  if (action.type === 'NEXT_ROUND') return state.status === 'round_over' ? null : 'round_not_over';
  if (state.status !== 'playing') return 'not_playing';
  if (currentPlayer(state).id !== player.id) return 'not_your_turn';
  const legal = legalActionsFor(state, player.id);
  const canPlay = legal.some((a) => a.type === 'PLAY_TILE');
  switch (action.type) {
    case 'PLAY_TILE': {
      const tile = player.hand.find((t) => t.id === action.tileId);
      if (!tile) return 'tile_not_in_hand';
      if (state.line.length === 0 && state.mustLead && tile.id !== state.mustLead) return 'must_lead';
      return endsFor(tile, state.line).includes(action.end) || (state.line.length === 0 && action.end === 'left') ? null : 'no_match';
    }
    case 'DRAW':
      if (canPlay) return 'must_play';
      return state.boneyard.length > 0 ? null : 'boneyard_empty';
    case 'PASS':
      if (canPlay) return 'must_play';
      return state.boneyard.length > 0 ? 'must_draw' : null;
  }
}

const addLack = (lacks: Record<string, Pip[]>, id: string, pips: Pip[]) => ({
  ...lacks,
  [id]: [...new Set([...(lacks[id] ?? []), ...pips])].sort((x, y) => x - y) as Pip[],
});

export function applyDomino(state: DominoState, action: DominoAction): ApplyResult<DominoState, DominoEvent> {
  const error = validateDomino(state, action);
  if (error) return { ok: false, error };
  if (action.type === 'NEXT_ROUND') {
    const dealt = dealRound({ ...state, turn: state.turn + 1 }, state.lastResult?.winnerId ?? null);
    return { ok: true, state: dealt.state, events: [...dealt.events, { type: 'turn', playerId: currentPlayer(dealt.state).id }] };
  }

  const events: DominoEvent[] = [];
  let next: DominoState = { ...state, turn: state.turn + 1 };
  const me = currentPlayer(state);
  const ends = openEnds(state.line);

  if (action.type === 'PLAY_TILE') {
    const tile = me.hand.find((t) => t.id === action.tileId)!;
    const placed = placeAt(tile, action.end, state.line, me.id, state.line.length);
    const line = state.line.length === 0 || action.end === 'right' ? [...state.line, placed] : [placed, ...state.line];
    next = {
      ...next,
      line,
      mustLead: null,
      players: state.players.map((p) => (p.id === me.id ? { ...p, hand: p.hand.filter((t) => t.id !== tile.id) } : p)),
    };
    events.push({ type: 'played', playerId: me.id, tileId: tile.id, end: action.end, seq: placed.seq });
    if (next.players[state.current].hand.length === 0) return finishRound(next, events, me.id, 'domino');
  } else if (action.type === 'DRAW') {
    const [drawn, ...rest] = state.boneyard;
    next = {
      ...next,
      boneyard: rest,
      players: state.players.map((p) => (p.id === me.id ? { ...p, hand: [...p.hand, drawn] } : p)),
      lacks: ends ? addLack(state.lacks, me.id, [ends.left, ends.right]) : state.lacks,
    };
    events.push({ type: 'drew', playerId: me.id });
    // Same player keeps the turn: they play the drawn tile if it fits, or draw again.
    return { ok: true, state: next, events };
  } else {
    next = { ...next, lacks: ends ? addLack(state.lacks, me.id, [ends.left, ends.right]) : state.lacks };
    events.push({ type: 'passed', playerId: me.id });
  }

  if (isBlocked(next)) return finishRound(next, events, null, 'blocked');
  next = { ...next, current: (state.current + 1) % state.players.length };
  events.push({ type: 'turn', playerId: currentPlayer(next).id });
  return { ok: true, state: next, events };
}

/** Nobody can play and nobody can draw: the round is blocked ("tranque"). */
export function isBlocked(state: DominoState): boolean {
  if (state.boneyard.length > 0 || state.line.length === 0) return false;
  const ends = openEnds(state.line)!;
  return state.players.every((p) => p.hand.every((t) => t.a !== ends.left && t.b !== ends.left && t.a !== ends.right && t.b !== ends.right));
}

/**
 * Scoring. Domino (a hand emptied): the winner scores every opponent's remaining pips.
 * Blocked: the lowest hand wins and scores the other hands' pips; a tie for lowest scores nobody.
 */
function finishRound(state: DominoState, events: DominoEvent[], dominoBy: string | null, reason: RoundResult['reason']): ApplyResult<DominoState, DominoEvent> {
  const pips = Object.fromEntries(state.players.map((p) => [p.id, handPips(p.hand)]));
  let winnerId = dominoBy;
  if (!winnerId) {
    const low = Math.min(...Object.values(pips));
    const lowest = state.players.filter((p) => pips[p.id] === low);
    winnerId = lowest.length === 1 ? lowest[0].id : null;
  }
  const points = winnerId ? state.players.filter((p) => p.id !== winnerId).reduce((s, p) => s + pips[p.id], 0) : 0;
  const scores = winnerId ? { ...state.scores, [winnerId]: state.scores[winnerId] + points } : state.scores;
  const result: RoundResult = { round: state.round, winnerId, reason, points, pips };
  const top = Math.max(...Object.values(scores));
  const over = top >= state.settings.targetScore;
  const matchWinners = over ? state.players.filter((p) => scores[p.id] === top).map((p) => p.id) : [];
  const next: DominoState = { ...state, scores, lastResult: result, status: over ? 'game_over' : 'round_over', matchWinners };
  events.push({ type: 'round_over', result });
  if (over) events.push({ type: 'game_over', winners: matchWinners });
  return { ok: true, state: next, events };
}

/** A fresh match with the same seats and settings (new seed). */
export function rematch(state: DominoState, seed: number): DominoState {
  return createDomino({ seats: state.players.map(({ id, name, kind }) => ({ id, name, kind })), seed, targetScore: state.settings.targetScore });
}

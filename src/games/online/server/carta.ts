// Online Carta: the same engine and bots as the solo game, driven by the game-room server.
// Each member receives createPlayerView (other hands and the draw pile removed, seed zeroed). Bots and
// idle humans are played on the server's clock.
import { applyAction, COLORS, createGame } from '@/game/engine';
import type { CardColor, GameAction, GameState } from '@/game/engine';
import { createBotController, createPlayerView } from '@/game/bots';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';
import type { Difficulty } from '@/games/shared/setup';

export const CARTA_TIMING = {
  /** Bots think this long; a little longer while someone can still be caught without UNO. */
  think: 800,
  penaltyWindow: 1700,
  /** A human who doesn't act in this long has a sensible move played for them. */
  turnLimit: 30000,
  /** The next round deals itself after this long. */
  nextRound: 12000,
};

export interface CartaSeat {
  id: string;
  name: string;
  kind: 'human' | 'bot';
}

export function createCarta(seats: CartaSeat[], seed: number): GameState {
  const s = createGame({
    players: seats.map((p) => ({ id: p.id, name: p.name, type: p.kind === 'bot' ? 'BOT' : 'REMOTE_HUMAN' })),
    seed,
  });
  return s;
}

export interface CartaView {
  state: GameState;
  deckSize: number;
}

export function cartaView(state: GameState, seat: string): CartaView {
  const v = createPlayerView(state, seat);
  return { state: v.state, deckSize: v.deckSize };
}

const isColor = (x: unknown): x is CardColor => typeof x === 'string' && (COLORS as readonly string[]).includes(x);
const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40 && /^[\w.-]+$/.test(x);

/** Rebuilds an untrusted action from whitelisted fields, for this seat only (null if malformed). */
export function parseCartaAction(raw: unknown, seat: string): GameAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'PLAY_CARD':
      if (!isId(a.cardId) || (a.chosenColor !== undefined && !isColor(a.chosenColor))) return null;
      return { type: 'PLAY_CARD', playerId: seat, cardId: a.cardId, ...(a.chosenColor ? { chosenColor: a.chosenColor as CardColor } : {}) };
    case 'DRAW_CARD':
      return { type: 'DRAW_CARD', playerId: seat };
    case 'CHOOSE_COLOR':
      return isColor(a.color) ? { type: 'CHOOSE_COLOR', playerId: seat, color: a.color } : null;
    case 'CALL_UNO':
      return { type: 'CALL_UNO', playerId: seat };
    case 'CHALLENGE_UNO':
      return isId(a.targetId) ? { type: 'CHALLENGE_UNO', playerId: seat, targetId: a.targetId } : null;
    case 'END_TURN':
      return { type: 'END_TURN', playerId: seat };
    default:
      return null;
  }
}

export function applyCarta(state: GameState, action: GameAction, now: number): { ok: true; state: GameState } | { ok: false; error: string } {
  const res = applyAction(state, { ...action, timestamp: now });
  return res.ok ? { ok: true, state: res.state } : { ok: false, error: res.error };
}

const DIFF: Record<Difficulty, 'easy' | 'normal' | 'hard'> = { easy: 'easy', normal: 'normal', hard: 'hard' };

/**
 * Bot moves, idle humans and the next round, up to `now`. `lastAt` is when the state last changed;
 * returns the new state and when it last changed.
 */
export function advanceCarta(state: GameState, lastAt: number, now: number, difficulty: Difficulty): { state: GameState; lastAt: number } {
  let s = state;
  let at = lastAt;
  const bots = createBotController({ seed: state.seed, fallback: { difficulty: DIFF[difficulty] ?? 'normal', personality: 'balanced' } });
  const helper = createBotController({ seed: state.seed ^ 0x5bd1e995, fallback: { difficulty: 'easy', personality: 'balanced' } });
  for (let guard = 0; guard < 80; guard++) {
    if (s.status === 'ROUND_OVER') {
      const due = at + CARTA_TIMING.nextRound;
      if (now < due) break;
      const res = applyAction(s, { type: 'START_GAME', timestamp: due });
      if (!res.ok) break;
      s = res.state;
      at = due;
      continue;
    }
    if (s.status !== 'PLAYING') break;
    const actorId = getActingPlayerId(s);
    const actor = s.players.find((p) => p.id === actorId);
    if (!actor) break;
    const bot = actor.type === 'BOT';
    const unoWindow = s.unoState.penaltyWindowPlayerId;
    const delay = bot ? (unoWindow && unoWindow !== actorId ? CARTA_TIMING.penaltyWindow : CARTA_TIMING.think) : CARTA_TIMING.turnLimit;
    const due = at + delay;
    if (now < due) break;
    const action = (bot ? bots : helper).decide(s, actor.id);
    if (!action) break;
    const res = applyAction(s, { ...action, timestamp: due });
    if (!res.ok) break;
    s = res.state;
    at = due;
  }
  return { state: s, lastAt: at };
}

/** When the current human actor will be played for (null when a bot acts or nobody has to). */
export function cartaDeadline(state: GameState, lastAt: number): number | null {
  if (state.status !== 'PLAYING') return state.status === 'ROUND_OVER' ? lastAt + CARTA_TIMING.nextRound : null;
  const actor = state.players.find((p) => p.id === getActingPlayerId(state));
  return actor && actor.type !== 'BOT' ? lastAt + CARTA_TIMING.turnLimit : null;
}

/** A player who left: a bot plays their seat from now on. */
export const botSeat = (state: GameState, seat: string): GameState => ({ ...state, players: state.players.map((p) => (p.id === seat ? { ...p, type: 'BOT' } : p)) });

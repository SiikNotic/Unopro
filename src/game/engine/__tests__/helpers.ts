import type { Card, CardColor, CardValue, Direction, GameSettings, GameState, Team } from '../types';
import { createGame, applyAction } from '../game';
import type { PlayerConfig } from '../game';
import { makeCard } from '../deck';
import { getPlayableCards } from '../validation';
import { createRng } from '../rng';
import { COLORS } from '../types';

let counter = 0;
const uid = (base: string) => `${base}#${++counter}`;

export const num = (color: CardColor, value: number): Card =>
  makeCard(uid(`${color}-${value}`), color, 'NUMBER', value as CardValue);
export const skip = (color: CardColor): Card => makeCard(uid(`${color}-SKIP`), color, 'SKIP');
export const reverse = (color: CardColor): Card => makeCard(uid(`${color}-REVERSE`), color, 'REVERSE');
export const drawTwo = (color: CardColor): Card => makeCard(uid(`${color}-DRAW_TWO`), color, 'DRAW_TWO');
export const wild = (): Card => makeCard(uid('WILD'), 'WILD', 'WILD');
export const wildFour = (): Card => makeCard(uid('WILD_DRAW_FOUR'), 'WILD', 'WILD_DRAW_FOUR');

export function players(n: number): PlayerConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    type: i === 0 ? ('HUMAN' as const) : ('BOT' as const),
  }));
}

export interface Scenario {
  players?: number;
  hands: Card[][];
  top: Card;
  color?: CardColor;
  deck?: Card[];
  discardBelow?: Card[];
  current?: number;
  direction?: Direction;
  settings?: Partial<GameSettings>;
  teams?: Team[];
  teamIds?: string[];
}

/** A PLAYING state with hand-picked cards, for testing one rule at a time. */
export function scenario(sc: Scenario): GameState {
  const count = sc.players ?? sc.hands.length;
  const cfg = players(count).map((p, i) => ({ ...p, teamId: sc.teamIds?.[i] }));
  const base = createGame({ players: cfg, seed: 1, settings: sc.settings, teams: sc.teams });
  const state: GameState = structuredClone(base);
  state.players.forEach((p, i) => {
    p.hand = sc.hands[i] ?? [];
    p.cardsRemaining = p.hand.length;
  });
  state.discardPile = [...(sc.discardBelow ?? []), sc.top];
  state.currentColor = sc.color ?? (sc.top.color === 'WILD' ? 'RED' : sc.top.color);
  state.deck = sc.deck ?? Array.from({ length: 20 }, (_, i) => num(COLORS[i % 4], (i % 9) + 1));
  state.currentPlayerIndex = sc.current ?? 0;
  state.direction = sc.direction ?? 'CLOCKWISE';
  state.pendingAction = null;
  state.pendingDraw = 0;
  state.log = [];
  return state;
}

export function ok(result: ReturnType<typeof applyAction>): GameState {
  if (!result.ok) throw new Error(`Expected action to succeed: ${result.error}`);
  return result.state;
}

export function currentId(state: GameState): string {
  return state.players[state.currentPlayerIndex].id;
}

export function allCards(state: GameState): Card[] {
  return [...state.deck, ...state.discardPile, ...state.players.flatMap((p) => p.hand)];
}

/** Random-but-legal player used to simulate whole games. Test-only: not a bot strategy. */
export function randomLegalAction(state: GameState, rngState: number) {
  const rng = createRng(rngState);
  const pick = <T,>(items: T[]) => items[Math.floor(rng.next() * items.length)];
  const current = state.players[state.currentPlayerIndex];
  const pending = state.pendingAction;

  let action;
  if (pending?.type === 'CHOOSE_COLOR') {
    action = { type: 'CHOOSE_COLOR' as const, playerId: pending.playerId, color: pick([...COLORS]) };
  } else if (current.hand.length === 2 && rng.next() < 0.5) {
    action = { type: 'CALL_UNO' as const, playerId: current.id };
  } else {
    const playable = getPlayableCards(state, current.id);
    if (playable.length > 0) {
      const card = pick(playable);
      action = {
        type: 'PLAY_CARD' as const,
        playerId: current.id,
        cardId: card.id,
        chosenColor: card.color === 'WILD' && rng.next() < 0.5 ? pick([...COLORS]) : undefined,
      };
    } else {
      action = { type: 'DRAW_CARD' as const, playerId: current.id };
    }
  }
  return { action, rngState: rng.state() };
}

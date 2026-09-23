// ── Cards ──────────────────────────────────────────────────────────────────

export const COLORS = ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const;

export type CardColor = (typeof COLORS)[number];

/** Wild cards carry no color until one is chosen (stored in GameState.currentColor). */
export type CardColorOrWild = CardColor | 'WILD';

export type CardType = 'NUMBER' | 'SKIP' | 'REVERSE' | 'DRAW_TWO' | 'WILD' | 'WILD_DRAW_FOUR';

/** 0-9 for NUMBER cards, null for every other type. */
export type CardValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null;

export interface Card {
  id: string;
  color: CardColorOrWild;
  type: CardType;
  value: CardValue;
}

// ── Players / Teams ──────────────────────────────────────────────────────────

/**
 * HUMAN is a human playing on this device (alias of LOCAL_HUMAN).
 * REMOTE_HUMAN is reserved for online multiplayer and is not driven by anything yet.
 */
export type PlayerType = 'HUMAN' | 'LOCAL_HUMAN' | 'REMOTE_HUMAN' | 'BOT';

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  hand: Card[];
  teamId?: string;
  isHuman: boolean;
  cardsRemaining: number;
}

export interface Team {
  id: string;
  name: string;
}

// ── Game status ──────────────────────────────────────────────────────────────

export type GameStatus = 'WAITING' | 'DEALING' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER';

export type Direction = 'CLOCKWISE' | 'COUNTER_CLOCKWISE';

/**
 * Something the current player must resolve before the turn can move on.
 * - CHOOSE_COLOR: a Wild was played (or turned up as the starting card) and needs a color.
 * - PLAY_DRAWN_CARD: the player drew a playable card and may play it or end the turn.
 */
export type PendingAction =
  | { type: 'CHOOSE_COLOR'; playerId: string; cardId: string; reason: 'PLAYED' | 'STARTING_CARD' }
  | { type: 'PLAY_DRAWN_CARD'; playerId: string; cardId: string };

// ── UNO ──────────────────────────────────────────────────────────────────────

export interface UnoCall {
  playerId: string;
  turnNumber: number;
  timestamp: number;
  valid: boolean;
  reason: string;
}

export interface UnoState {
  /** Players currently holding exactly one card. */
  playersWithOneCard: string[];
  /** Players that are protected: they called UNO for their current one-card hand. */
  declaredPlayerIds: string[];
  /** Player who may still be penalised for not calling UNO (penalty window). */
  penaltyWindowPlayerId: string | null;
  /** Every UNO call ever made this round, valid or not. */
  calls: UnoCall[];
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface GameSettings {
  startingCards: number;
  /** Points needed to win the whole game (multi-round). */
  targetScore: number;
  /** House rule: a +2 may be answered with a +2 (and +4 with +4) to pass the penalty on. */
  stacking: boolean;
  /** House rule: a player holding an identical card (color + symbol) may play it out of turn. */
  jumpIn: boolean;
  /** House rule: keep drawing until a playable card appears (instead of drawing one). */
  drawUntilPlayable: boolean;
  /** House rule: you may not draw while holding a playable card, and must play a playable drawn card. */
  forcePlay: boolean;
  /** Cards drawn by a player caught not calling UNO. 0 disables the penalty. */
  unoPenalty: number;
  /** Seconds per turn. 0 = no timer. Stored only; enforced by the UI layer in a later phase. */
  turnTimer: number;
  /** Score by team instead of by player. */
  teamMode: boolean;
  /**
   * Official rule: Wild Draw Four is only legal when the player has no card matching the current color.
   * The engine enforces it instead of using the challenge mechanic.
   */
  strictWildDrawFour: boolean;
}

// ── Scoring / rounds ─────────────────────────────────────────────────────────

export interface RoundResult {
  roundNumber: number;
  winnerId: string;
  winningTeamId: string | null;
  /** Points awarded to the winner (or the winner's team). */
  points: number;
  /** Point value of the cards left in each player's hand. */
  handPoints: Record<string, number>;
}

// ── Game state ───────────────────────────────────────────────────────────────

export interface GameState {
  players: Player[];
  teams: Team[];
  settings: GameSettings;

  status: GameStatus;
  roundNumber: number;
  turnNumber: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  direction: Direction;

  deck: Card[];
  discardPile: Card[];
  currentColor: CardColor | null;

  /** Cards the next player will have to draw (only accumulates while stacking is enabled). */
  pendingDraw: number;
  pendingAction: PendingAction | null;

  unoState: UnoState;

  winnerId: string | null;
  /** Cumulative score per player across rounds. */
  scores: Record<string, number>;
  /** Cumulative score per team across rounds (team mode). */
  teamScores: Record<string, number>;
  rounds: RoundResult[];
  gameWinnerId: string | null;
  gameWinnerTeamId: string | null;

  /** Seed the game was created with and the current PRNG state — keeps the engine deterministic. */
  seed: number;
  rngState: number;

  log: GameLogEntry[];
}

// ── Game log ─────────────────────────────────────────────────────────────────

export type GameLogType =
  | 'ROUND_STARTED'
  | 'ROUND_ENDED'
  | 'GAME_ENDED'
  | 'STARTING_CARD'
  | 'PLAYER_PLAYED_CARD'
  | 'PLAYER_JUMPED_IN'
  | 'PLAYER_DREW_CARD'
  | 'PLAYER_PASSED'
  | 'COLOR_CHANGED'
  | 'PLAYER_CALLED_UNO'
  | 'UNO_PENALTY'
  | 'PLAYER_SKIPPED'
  | 'DIRECTION_CHANGED'
  | 'DRAW_PENALTY'
  | 'DECK_RECYCLED'
  | 'DECK_EXHAUSTED';

export interface GameLogEntry {
  seq: number;
  type: GameLogType;
  roundNumber: number;
  turnNumber: number;
  timestamp: number;
  message: string;
  playerId?: string;
  card?: Card;
  color?: CardColor;
  amount?: number;
}

// ── Game actions ─────────────────────────────────────────────────────────────

interface BaseAction {
  /** Optional wall-clock time supplied by the caller; the engine never reads the clock itself. */
  timestamp?: number;
}

export type GameAction =
  | (BaseAction & { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: CardColor })
  | (BaseAction & { type: 'DRAW_CARD'; playerId: string })
  | (BaseAction & { type: 'CHOOSE_COLOR'; playerId: string; color: CardColor })
  | (BaseAction & { type: 'CALL_UNO'; playerId: string })
  | (BaseAction & { type: 'CHALLENGE_UNO'; playerId: string; targetId: string })
  | (BaseAction & { type: 'END_TURN'; playerId: string })
  | (BaseAction & { type: 'START_GAME' })
  | (BaseAction & { type: 'RESTART_GAME' });

export type GameActionType = GameAction['type'];

export type ValidationResult = { valid: true } | { valid: false; error: string };

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; state: GameState };

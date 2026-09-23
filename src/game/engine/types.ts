// ── Cards ──────────────────────────────────────────────────────────────────

export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';

export type CardType =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'wild_draw_four';

export type CardValue = number | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four';

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value: CardValue;
}

export type CardDeck = Card[];

// ── Players ────────────────────────────────────────────────────────────────

export type PlayerType = 'human' | 'bot' | 'remote';

export type PlayerStatus = 'active' | 'idle' | 'disconnected' | 'eliminated';

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  status: PlayerStatus;
  hand: Card[];
  teamId?: string;
  avatar?: string;
  isHost?: boolean;
  isHuman: boolean;
  cardsRemaining: number;
}

// ── Teams ───────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
  score: number;
}

// ── Turn / Round ─────────────────────────────────────────────────────────────

export type TurnDirection = 'clockwise' | 'counterclockwise';

export interface Turn {
  playerId: string;
  direction: TurnDirection;
  number: number;
}

export interface Round {
  number: number;
  startingPlayerId: string;
  winnerId?: string;
  scores: Record<string, number>;
}

// ── UNO ──────────────────────────────────────────────────────────────────────

export type UnoCallStatus = 'valid' | 'invalid' | 'pending';

export interface UnoState {
  calledByPlayerId: string | null;
  timestamp: number | null;
  status: UnoCallStatus;
  vulnerablePlayerIds: string[];
}

// ── Game Status / Phase ─────────────────────────────────────────────────────

export type GameStatus =
  | 'WAITING'
  | 'DEALING'
  | 'PLAYING'
  | 'CHOOSING_COLOR'
  | 'ROUND_OVER'
  | 'GAME_OVER';

// ── Settings ─────────────────────────────────────────────────────────────────

export type GameModeId = 'classic' | 'teams' | 'tournament' | 'custom';

export interface GameSettings {
  mode: GameModeId;
  startingCards: number;
  targetScore: number;
  drawUntilPlayable: boolean;
  stackingEnabled: boolean;
  jumpInEnabled: boolean;
  forcePlayEnabled: boolean;
  unoPenalty: number;
  turnTimer: number;
  teamMode: boolean;
  customRules?: Record<string, unknown>;
}

// ── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  teams: Team[];
  deck: CardDeck;
  discardPile: CardDeck;
  activeCard?: Card;
  activeColor?: CardColor;
  currentPlayerIndex: number;
  direction: TurnDirection;
  pendingDraw: number;
  pendingSkip: boolean;
  roundNumber: number;
  winnerId?: string;
  turnNumber: number;
  unoState: UnoState;
  settings: GameSettings;
  rounds: Round[];
  log: GameLogEntry[];
  createdAt: number;
  updatedAt: number;
}

// ── Game Mode metadata (for UI) ─────────────────────────────────────────────

export interface GameMode {
  id: GameModeId;
  nameKey: string;
  descriptionKey: string;
  minPlayers: number;
  maxPlayers: number;
  enabled: boolean;
  icon: string;
}

// ── Game Log ─────────────────────────────────────────────────────────────────

export type GameLogType =
  | 'ROUND_STARTED'
  | 'ROUND_ENDED'
  | 'PLAYER_PLAYED_CARD'
  | 'PLAYER_DREW_CARD'
  | 'COLOR_CHANGED'
  | 'PLAYER_CALLED_UNO'
  | 'PLAYER_SKIPPED'
  | 'DIRECTION_CHANGED'
  | 'DREW_TWO'
  | 'DREW_FOUR'
  | 'WILD_CHOSEN'
  | 'TURN_PASSED'
  | 'ERROR'
  | 'DECK_RECYCLED';

export interface GameLogEntry {
  type: GameLogType;
  timestamp: number;
  playerId?: string;
  cardId?: string;
  color?: CardColor;
  amount?: number;
  message: string;
}

// ── Game Actions ─────────────────────────────────────────────────────────────

export type GameActionType =
  | 'PLAY_CARD'
  | 'DRAW_CARD'
  | 'CHOOSE_COLOR'
  | 'CALL_UNO'
  | 'END_TURN'
  | 'PASS_TURN'
  | 'START_GAME'
  | 'RESTART_GAME';

export interface BaseGameAction {
  type: GameActionType;
  playerId: string;
  timestamp: number;
}

export interface PlayCardAction extends BaseGameAction {
  type: 'PLAY_CARD';
  cardId: string;
  chosenColor?: CardColor;
}

export interface DrawCardAction extends BaseGameAction {
  type: 'DRAW_CARD';
  count?: number;
}

export interface ChooseColorAction extends BaseGameAction {
  type: 'CHOOSE_COLOR';
  color: CardColor;
}

export interface CallUnoAction extends BaseGameAction {
  type: 'CALL_UNO';
}

export interface EndTurnAction extends BaseGameAction {
  type: 'END_TURN';
}

export interface PassTurnAction extends BaseGameAction {
  type: 'PASS_TURN';
}

export interface StartGameAction extends BaseGameAction {
  type: 'START_GAME';
  settings: GameSettings;
}

export interface RestartGameAction extends BaseGameAction {
  type: 'RESTART_GAME';
}

export type GameAction =
  | PlayCardAction
  | DrawCardAction
  | ChooseColorAction
  | CallUnoAction
  | EndTurnAction
  | PassTurnAction
  | StartGameAction
  | RestartGameAction;

// ── Multiplayer (conceptual, for future phases) ──────────────────────────────

export interface GameActionPayload {
  action: GameAction;
  gameId: string;
}

export type GameEvent =
  | 'CARD_PLAYED'
  | 'CARD_DRAWN'
  | 'COLOR_CHOSEN'
  | 'UNO_CALLED'
  | 'TURN_ENDED'
  | 'ROUND_ENDED'
  | 'GAME_ENDED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'ERROR';

export interface GameEventListener {
  (event: GameEvent, payload: unknown): void;
}

export interface MultiplayerTransport {
  connect(gameId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendAction(payload: GameActionPayload): Promise<void>;
  onAction(handler: (payload: GameActionPayload) => void): void;
  onEvent(listener: GameEventListener): void;
  isConnected(): boolean;
}

export interface MultiplayerRoom {
  id: string;
  code: string;
  players: Player[];
  maxPlayers: number;
  isPrivate: boolean;
  hostId: string;
}

export interface CardPlayResult {
  success: boolean;
  card?: Card;
  error?: string;
  nextPlayerId?: string;
}

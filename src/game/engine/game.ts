// Game lifecycle and the action reducer: GameState + GameAction → new GameState.
// Every public function is pure: the input state is never modified.
import type {
  ActionResult,
  Card,
  CardColor,
  GameAction,
  GameSettings,
  GameState,
  Player,
  PlayerType,
  Team,
} from './types';
import { DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS } from './settings';
import { createRng, randomSeed } from './rng';
import { DECK_SIZE, cardLabel, isWild, resetDeck, shuffleDeck } from './deck';
import type { EngineContext } from './log';
import { addLog } from './log';
import { advanceTurn, applyCardEffect, getNextPlayerIndex, giveCards } from './effects';
import { canPlayCard, getPlayer, validateAction } from './validation';
import { closeUnoWindowOnAction, createUnoState, registerUnoCall, syncUnoAfterHandChange } from './uno';

// ── Creating a game ──────────────────────────────────────────────────────────

export interface PlayerConfig {
  id: string;
  name: string;
  type: PlayerType;
  teamId?: string;
}

export interface CreateGameConfig {
  players: PlayerConfig[];
  startingCards?: number;
  settings?: Partial<GameSettings>;
  teams?: Team[];
  /** Fixes the shuffle so the whole game is reproducible. Random when omitted. */
  seed?: number;
  /** Seat index of the dealer; the player after the dealer starts. Defaults to the last seat. */
  dealerIndex?: number;
  /** When false the game is returned in WAITING status and START_GAME deals the first round. */
  autoStart?: boolean;
}

export class GameConfigError extends Error {}

function validateConfig(config: CreateGameConfig, settings: GameSettings): void {
  const { players } = config;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameConfigError(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players (got ${players.length})`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new GameConfigError('Player ids must be unique');
  }
  if (settings.startingCards < 1 || settings.startingCards * players.length >= DECK_SIZE - 4) {
    throw new GameConfigError(`Cannot deal ${settings.startingCards} cards to ${players.length} players`);
  }
  if (settings.teamMode) {
    const teamIds = new Set((config.teams ?? []).map((t) => t.id));
    if (teamIds.size < 2) throw new GameConfigError('Team mode needs at least two teams');
    for (const p of players) {
      if (!p.teamId || !teamIds.has(p.teamId)) {
        throw new GameConfigError(`Player ${p.id} must belong to one of the configured teams`);
      }
    }
  }
}

export function createGame(config: CreateGameConfig): GameState {
  const settings: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...config.settings,
    ...(config.startingCards !== undefined ? { startingCards: config.startingCards } : {}),
  };
  validateConfig(config, settings);

  const seed = (config.seed ?? randomSeed()) >>> 0;
  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    hand: [],
    teamId: p.teamId,
    isHuman: p.type !== 'BOT',
    cardsRemaining: 0,
  }));
  const teams = config.teams ?? [];
  const dealerIndex = config.dealerIndex ?? players.length - 1;

  const state: GameState = {
    players,
    teams,
    settings,
    status: 'WAITING',
    roundNumber: 0,
    turnNumber: 0,
    currentPlayerIndex: 0,
    // startRound rotates the dealer, so start one seat before the requested dealer.
    dealerIndex: (dealerIndex - 1 + players.length) % players.length,
    direction: 'CLOCKWISE',
    deck: [],
    discardPile: [],
    currentColor: null,
    pendingDraw: 0,
    pendingAction: null,
    unoState: createUnoState(),
    winnerId: null,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    teamScores: Object.fromEntries(teams.map((t) => [t.id, 0])),
    rounds: [],
    gameWinnerId: null,
    gameWinnerTeamId: null,
    seed,
    rngState: seed,
    log: [],
  };

  if (config.autoStart === false) return state;
  return applyAction(state, { type: 'START_GAME' }).state;
}

// ── Rounds ───────────────────────────────────────────────────────────────────

/** Deals a new round: fresh shuffled deck, hands, starting card and first player. */
function startRound(state: GameState, ctx: EngineContext): void {
  const n = state.players.length;
  state.status = 'DEALING';
  state.roundNumber += 1;
  state.turnNumber = 1;
  state.dealerIndex = (state.dealerIndex + 1) % n;
  state.direction = 'CLOCKWISE';
  state.pendingDraw = 0;
  state.pendingAction = null;
  state.winnerId = null;
  state.unoState = createUnoState();

  let deck = resetDeck(ctx.rng);
  for (const player of state.players) player.hand = [];
  for (let i = 0; i < state.settings.startingCards; i++) {
    for (let k = 1; k <= n; k++) {
      state.players[(state.dealerIndex + k) % n].hand.push(deck.shift()!);
    }
  }
  for (const player of state.players) player.cardsRemaining = player.hand.length;

  // A Wild Draw Four can't start the pile: return it to the deck, reshuffle and turn up another card.
  let starter = deck.shift()!;
  while (starter.type === 'WILD_DRAW_FOUR') {
    deck = shuffleDeck([...deck, starter], ctx.rng);
    starter = deck.shift()!;
  }
  state.deck = deck;
  state.discardPile = [starter];
  state.currentColor = isWild(starter) ? null : (starter.color as CardColor);
  state.currentPlayerIndex = getNextPlayerIndex(state, state.dealerIndex);
  state.status = 'PLAYING';

  addLog(state, ctx, 'ROUND_STARTED', `Round ${state.roundNumber} started, dealer ${state.players[state.dealerIndex].name}`);
  addLog(state, ctx, 'STARTING_CARD', `Starting card: ${cardLabel(starter)}`, { card: starter });

  const first = state.players[state.currentPlayerIndex];
  switch (starter.type) {
    case 'SKIP':
      addLog(state, ctx, 'PLAYER_SKIPPED', `${first.name} is skipped by the starting card`, { playerId: first.id });
      state.currentPlayerIndex = getNextPlayerIndex(state, state.currentPlayerIndex);
      break;
    case 'REVERSE':
      // The dealer plays first and play continues in the reversed direction.
      state.direction = 'COUNTER_CLOCKWISE';
      state.currentPlayerIndex = state.dealerIndex;
      addLog(state, ctx, 'DIRECTION_CHANGED', `Direction is now ${state.direction}`);
      break;
    case 'DRAW_TWO': {
      const drawn = giveCards(state, ctx, state.currentPlayerIndex, 2);
      addLog(state, ctx, 'DRAW_PENALTY', `${first.name} draws ${drawn.length} and loses the turn`, {
        playerId: first.id,
        amount: drawn.length,
      });
      state.currentPlayerIndex = getNextPlayerIndex(state, state.currentPlayerIndex);
      break;
    }
    case 'WILD':
      // The first player names the color, then plays normally.
      state.pendingAction = { type: 'CHOOSE_COLOR', playerId: first.id, cardId: starter.id, reason: 'STARTING_CARD' };
      break;
    default:
      break;
  }
}

// ── Action reducers (operate on a private draft) ─────────────────────────────

function reducePlayCard(s: GameState, ctx: EngineContext, playerId: string, cardId: string, chosenColor?: CardColor) {
  const playerIndex = s.players.findIndex((p) => p.id === playerId);
  const player = s.players[playerIndex];
  const card = player.hand.find((c) => c.id === cardId)!;

  closeUnoWindowOnAction(s, playerId);
  if (playerIndex !== s.currentPlayerIndex) {
    addLog(s, ctx, 'PLAYER_JUMPED_IN', `${player.name} jumps in with ${cardLabel(card)}`, { playerId, card });
    s.currentPlayerIndex = playerIndex;
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  player.cardsRemaining = player.hand.length;
  s.discardPile.push(card);
  s.pendingAction = null;
  addLog(s, ctx, 'PLAYER_PLAYED_CARD', `${player.name} played ${cardLabel(card)}`, { playerId, card });
  syncUnoAfterHandChange(s, player, 'PLAYED');

  if (!isWild(card)) {
    s.currentColor = card.color as CardColor;
    applyCardEffect(s, ctx, card, playerIndex);
  } else if (chosenColor) {
    setColor(s, ctx, player, chosenColor);
    applyCardEffect(s, ctx, card, playerIndex);
  } else {
    s.pendingAction = { type: 'CHOOSE_COLOR', playerId, cardId, reason: 'PLAYED' };
  }
}

function setColor(s: GameState, ctx: EngineContext, player: Player, color: CardColor) {
  s.currentColor = color;
  addLog(s, ctx, 'COLOR_CHANGED', `${player.name} chose ${color}`, { playerId: player.id, color });
}

function reduceChooseColor(s: GameState, ctx: EngineContext, playerId: string, color: CardColor) {
  const pending = s.pendingAction;
  if (pending?.type !== 'CHOOSE_COLOR') return;
  const playerIndex = s.players.findIndex((p) => p.id === playerId);
  s.pendingAction = null;
  setColor(s, ctx, s.players[playerIndex], color);
  if (pending.reason === 'PLAYED') {
    const card = s.discardPile[s.discardPile.length - 1];
    applyCardEffect(s, ctx, card, playerIndex);
  }
}

function reduceDrawCard(s: GameState, ctx: EngineContext, playerId: string) {
  const playerIndex = s.currentPlayerIndex;
  const player = s.players[playerIndex];
  closeUnoWindowOnAction(s, playerId);

  // Answering a draw stack (stacking rule): take the whole stack and lose the turn.
  if (s.pendingDraw > 0) {
    const drawn = giveCards(s, ctx, playerIndex, s.pendingDraw);
    s.pendingDraw = 0;
    addLog(s, ctx, 'DRAW_PENALTY', `${player.name} draws ${drawn.length} and loses the turn`, {
      playerId,
      amount: drawn.length,
    });
    advanceTurn(s, playerIndex);
    return;
  }

  const drawn: Card[] = [];
  let last: Card | undefined;
  do {
    const [card] = giveCards(s, ctx, playerIndex, 1);
    if (!card) break;
    drawn.push(card);
    last = card;
  } while (s.settings.drawUntilPlayable && !canPlayCard(last!, s));

  addLog(s, ctx, 'PLAYER_DREW_CARD', `${player.name} drew ${drawn.length} card(s)`, { playerId, amount: drawn.length });

  if (last && canPlayCard(last, s)) {
    s.pendingAction = { type: 'PLAY_DRAWN_CARD', playerId, cardId: last.id };
    return;
  }
  addLog(s, ctx, 'PLAYER_PASSED', `${player.name} passes`, { playerId });
  advanceTurn(s, playerIndex);
}

function reduceEndTurn(s: GameState, ctx: EngineContext, playerId: string) {
  const player = getPlayer(s, playerId)!;
  addLog(s, ctx, 'PLAYER_PASSED', `${player.name} keeps the drawn card and passes`, { playerId });
  advanceTurn(s, s.currentPlayerIndex);
}

function reduceChallengeUno(s: GameState, ctx: EngineContext, playerId: string, targetId: string) {
  const targetIndex = s.players.findIndex((p) => p.id === targetId);
  const target = s.players[targetIndex];
  const challenger = getPlayer(s, playerId)!;
  s.unoState.penaltyWindowPlayerId = null;
  const drawn = giveCards(s, ctx, targetIndex, s.settings.unoPenalty);
  addLog(s, ctx, 'UNO_PENALTY', `${challenger.name} caught ${target.name} without UNO: +${drawn.length} cards`, {
    playerId: targetId,
    amount: drawn.length,
  });
}

function resetForNewGame(s: GameState) {
  s.scores = Object.fromEntries(s.players.map((p) => [p.id, 0]));
  s.teamScores = Object.fromEntries(s.teams.map((t) => [t.id, 0]));
  s.rounds = [];
  s.roundNumber = 0;
  s.gameWinnerId = null;
  s.gameWinnerTeamId = null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The engine's single entry point. Validates the action first; an invalid action returns the
 * original state untouched together with the reason.
 */
export function applyAction(state: GameState, action: GameAction): ActionResult {
  const validation = validateAction(state, action);
  if (!validation.valid) return { ok: false, error: validation.error, state };

  const s: GameState = structuredClone(state);
  const ctx: EngineContext = { rng: createRng(s.rngState), timestamp: action.timestamp ?? 0 };

  switch (action.type) {
    case 'PLAY_CARD':
      reducePlayCard(s, ctx, action.playerId, action.cardId, action.chosenColor);
      break;
    case 'DRAW_CARD':
      reduceDrawCard(s, ctx, action.playerId);
      break;
    case 'CHOOSE_COLOR':
      reduceChooseColor(s, ctx, action.playerId, action.color);
      break;
    case 'END_TURN':
      reduceEndTurn(s, ctx, action.playerId);
      break;
    case 'CALL_UNO':
      registerUnoCall(s, ctx, getPlayer(s, action.playerId)!);
      break;
    case 'CHALLENGE_UNO':
      reduceChallengeUno(s, ctx, action.playerId, action.targetId);
      break;
    case 'START_GAME':
      startRound(s, ctx);
      break;
    case 'RESTART_GAME':
      resetForNewGame(s);
      startRound(s, ctx);
      break;
  }

  s.rngState = ctx.rng.state();
  return { ok: true, state: s };
}

/** Replays a list of actions from an initial state (useful for replays, debugging and sync). */
export function replay(initial: GameState, actions: GameAction[]): GameState {
  return actions.reduce((state, action) => applyAction(state, action).state, initial);
}

export function playCard(state: GameState, playerId: string, cardId: string, chosenColor?: CardColor): ActionResult {
  return applyAction(state, { type: 'PLAY_CARD', playerId, cardId, chosenColor });
}

/**
 * Draws for the current player: one card on a normal turn (or until playable with drawUntilPlayable),
 * or the whole pending stack when stacking. The amount is decided by the rules, not the caller.
 */
export function drawCards(state: GameState, playerId: string): ActionResult {
  return applyAction(state, { type: 'DRAW_CARD', playerId });
}

export function chooseColor(state: GameState, playerId: string, color: CardColor): ActionResult {
  return applyAction(state, { type: 'CHOOSE_COLOR', playerId, color });
}

export function callUno(state: GameState, playerId: string): ActionResult {
  return applyAction(state, { type: 'CALL_UNO', playerId });
}

export function challengeUno(state: GameState, playerId: string, targetId: string): ActionResult {
  return applyAction(state, { type: 'CHALLENGE_UNO', playerId, targetId });
}

export function endTurn(state: GameState, playerId: string): ActionResult {
  return applyAction(state, { type: 'END_TURN', playerId });
}

/** Deals the next round after ROUND_OVER (or the first one from WAITING). */
export function startNextRound(state: GameState): ActionResult {
  return applyAction(state, { type: 'START_GAME' });
}

/** New game with the same players and settings: scores reset, round 1 dealt. */
export function restartGame(state: GameState): ActionResult {
  return applyAction(state, { type: 'RESTART_GAME' });
}

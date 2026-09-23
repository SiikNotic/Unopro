import type {
  Card,
  CardColor,
  GameSettings,
  GameState,
  GameStatus,
  Player,
  PlayerType,
  Team,
  TurnDirection,
} from './types';
import { createDeck, drawFromDeck, getHandScore, recycleDiscardPile, shuffleDeck } from './deck';
import { applyCardEffect, getNextPlayerIndex, reverseDirection } from './effects';
import { canPlayCard } from './validation';
import { createLogEntry } from './log';

let gameIdCounter = 0;

export function nextGameId(): string {
  gameIdCounter += 1;
  return `g${gameIdCounter}`;
}

export function resetGameIdCounter(): void {
  gameIdCounter = 0;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'classic',
  startingCards: 7,
  targetScore: 500,
  drawUntilPlayable: false,
  stackingEnabled: false,
  jumpInEnabled: false,
  forcePlayEnabled: false,
  unoPenalty: 2,
  turnTimer: 0,
  teamMode: false,
};

export interface CreateGameConfig {
  players: Array<{ id: string; name: string; type: PlayerType; teamId?: string }>;
  startingCards?: number;
  settings?: Partial<GameSettings>;
  teams?: Team[];
  seed?: number;
}

function makePlayer(
  id: string,
  name: string,
  type: PlayerType,
  teamId?: string
): Player {
  return {
    id,
    name,
    type,
    status: 'active',
    hand: [],
    teamId,
    isHuman: type === 'human',
    cardsRemaining: 0,
  };
}

function pickInitialCard(deck: Card[]): { card: Card; remaining: Card[] } {
  // Keep drawing until we find a non-wild card for the initial discard
  let idx = 0;
  while (idx < deck.length) {
    const card = deck[idx];
    if (card.type !== 'wild' && card.type !== 'wild_draw_four') {
      const remaining = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
      return { card, remaining };
    }
    idx++;
  }
  // Fallback: use first card
  return { card: deck[0], remaining: deck.slice(1) };
}

export function createGame(config: CreateGameConfig): GameState {
  const settings: GameSettings = { ...DEFAULT_SETTINGS, ...config.settings };
  const startingCards = config.startingCards ?? settings.startingCards;

  const players: Player[] = config.players.map((p) =>
    makePlayer(p.id, p.name, p.type, p.teamId)
  );

  let deck = shuffleDeck(createDeck());

  // Deal cards
  for (let i = 0; i < startingCards; i++) {
    for (const player of players) {
      const { drawn, remaining } = drawFromDeck(deck, 1);
      player.hand.push(...drawn);
      deck = remaining;
    }
  }

  // Update cardsRemaining
  for (const player of players) {
    player.cardsRemaining = player.hand.length;
  }

  // Create discard pile with initial card
  const { card: initialCard, remaining } = pickInitialCard(deck);
  deck = remaining;

  const now = Date.now();

  const state: GameState = {
    id: nextGameId(),
    status: 'PLAYING',
    players,
    teams: config.teams ?? [],
    deck,
    discardPile: [initialCard],
    activeCard: initialCard,
    activeColor: initialCard.color,
    currentPlayerIndex: 0,
    direction: 'clockwise',
    pendingDraw: 0,
    pendingSkip: false,
    roundNumber: 1,
    turnNumber: 1,
    unoState: {
      calledByPlayerId: null,
      timestamp: null,
      status: 'pending',
      vulnerablePlayerIds: [],
    },
    settings,
    rounds: [],
    log: [
      createLogEntry('ROUND_STARTED', `Round 1 started`, {}),
    ],
    createdAt: now,
    updatedAt: now,
  };

  // Apply initial card effect if it's a special card
  if (initialCard.type === 'skip') {
    state.currentPlayerIndex = getNextPlayerIndex(state, false);
    state.log.push(createLogEntry('PLAYER_SKIPPED', `Player skipped by initial Skip`, {}));
  } else if (initialCard.type === 'reverse') {
    state.direction = reverseDirection(state.direction);
    // In 2-player, reverse acts like skip
    if (players.length === 2) {
      state.currentPlayerIndex = getNextPlayerIndex(state, false);
    }
    state.log.push(createLogEntry('DIRECTION_CHANGED', `Direction reversed by initial Reverse`, {}));
  } else if (initialCard.type === 'draw_two') {
    state.pendingDraw = 2;
    state.pendingSkip = true;
    state.log.push(createLogEntry('DREW_TWO', `Initial Draw Two: pending 2 cards`, {}));
  }

  state.updatedAt = Date.now();
  return state;
}

export function playCard(
  state: GameState,
  playerId: string,
  cardId: string,
  chosenColor?: CardColor
): GameState {
  const s = cloneState(state);
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return logError(s, `Player ${playerId} not found`);

  if (s.players[s.currentPlayerIndex].id !== playerId) {
    return logError(s, `Not ${playerId}'s turn`);
  }

  if (s.status !== 'PLAYING') {
    return logError(s, `Game is not in PLAYING status`);
  }

  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    return logError(s, `Card ${cardId} not in player's hand`);
  }

  const card = player.hand[cardIndex];
  if (!canPlayCard(card, s)) {
    return logError(s, `Card ${cardId} cannot be played`);
  }

  // Wild cards require a color choice
  if ((card.type === 'wild' || card.type === 'wild_draw_four') && !chosenColor) {
    s.status = 'CHOOSING_COLOR';
    s.activeCard = card;
    // Remove from hand now, commit after color is chosen
    player.hand.splice(cardIndex, 1);
    player.cardsRemaining = player.hand.length;
    s.log.push(createLogEntry('PLAYER_PLAYED_CARD', `${player.name} played ${card.type}`, { playerId, cardId }));
    s.updatedAt = Date.now();
    return s;
  }

  // Remove card from hand
  player.hand.splice(cardIndex, 1);
  player.cardsRemaining = player.hand.length;

  // Place on discard pile
  s.discardPile.push(card);
  s.activeCard = card;

  // Set active color
  if (card.type === 'wild' || card.type === 'wild_draw_four') {
    s.activeColor = chosenColor!;
    s.log.push(createLogEntry('COLOR_CHANGED', `Color changed to ${chosenColor}`, { color: chosenColor }));
  } else {
    s.activeColor = card.color;
  }

  s.log.push(createLogEntry('PLAYER_PLAYED_CARD', `${player.name} played ${card.type}`, { playerId, cardId }));

  // Apply effect
  const effect = applyCardEffect(card);

  if (effect.directionChanged) {
    s.direction = reverseDirection(s.direction);
    s.log.push(createLogEntry('DIRECTION_CHANGED', `Direction reversed`, { playerId }));
  }

  if (effect.drawAmount > 0) {
    s.pendingDraw += effect.drawAmount;
    s.pendingSkip = true;
    if (effect.drawAmount === 2) {
      s.log.push(createLogEntry('DREW_TWO', `Next player must draw 2`, { playerId }));
    } else if (effect.drawAmount === 4) {
      s.log.push(createLogEntry('DREW_FOUR', `Next player must draw 4`, { playerId }));
    }
  }

  // Check for round end (player has 0 cards)
  if (player.hand.length === 0) {
    return endRound(s, playerId);
  }

  // Check UNO state
  if (player.hand.length === 1) {
    s.unoState = {
      calledByPlayerId: null,
      timestamp: null,
      status: 'pending',
      vulnerablePlayerIds: [playerId],
    };
  } else {
    s.unoState = {
      calledByPlayerId: null,
      timestamp: null,
      status: 'pending',
      vulnerablePlayerIds: [],
    };
  }

  // Advance turn
  s.currentPlayerIndex = getNextPlayerIndex(s, effect.skipNext);

  if (effect.skipNext && effect.drawAmount === 0) {
    s.log.push(createLogEntry('PLAYER_SKIPPED', `Next player skipped`, { playerId }));
  }

  s.turnNumber += 1;
  s.updatedAt = Date.now();
  return s;
}

export function chooseColor(
  state: GameState,
  playerId: string,
  color: CardColor
): GameState {
  const s = cloneState(state);
  if (s.status !== 'CHOOSING_COLOR') {
    return logError(s, `Not in choosing color state`);
  }

  s.activeColor = color;
  s.status = 'PLAYING';
  s.log.push(createLogEntry('COLOR_CHANGED', `${playerId} chose ${color}`, { color }));

  // The card was already removed from hand and placed on discard in playCard
  // Now apply the effect (wild or wild_draw_four)
  const card = s.activeCard!;
  const effect = applyCardEffect(card);

  if (effect.drawAmount > 0) {
    s.pendingDraw += effect.drawAmount;
    s.pendingSkip = true;
    s.log.push(createLogEntry('DREW_FOUR', `Next player must draw 4`, { playerId }));
  }

  // Check round end
  const player = s.players.find((p) => p.id === playerId);
  if (player && player.hand.length === 0) {
    return endRound(s, playerId);
  }

  // Check UNO
  if (player && player.hand.length === 1) {
    s.unoState = {
      calledByPlayerId: null,
      timestamp: null,
      status: 'pending',
      vulnerablePlayerIds: [playerId],
    };
  }

  // Advance turn
  s.currentPlayerIndex = getNextPlayerIndex(s, effect.skipNext);
  s.turnNumber += 1;
  s.updatedAt = Date.now();
  return s;
}

export function drawCards(
  state: GameState,
  playerId: string,
  amount: number
): GameState {
  const s = cloneState(state);
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return logError(s, `Player ${playerId} not found`);

  if (s.players[s.currentPlayerIndex].id !== playerId) {
    return logError(s, `Not ${playerId}'s turn`);
  }

  // Determine actual draw amount (use pendingDraw if set)
  let drawAmount = amount;
  if (s.pendingDraw > 0) {
    drawAmount = s.pendingDraw;
    s.pendingDraw = 0;
    s.pendingSkip = false;
  }

  // Draw cards, recycling deck if needed
  const drawn: Card[] = [];
  let remainingDeck = s.deck;

  for (let i = 0; i < drawAmount; i++) {
    if (remainingDeck.length === 0) {
      // Recycle discard pile
      const { newDeck, topCard } = recycleDiscardPile(s.discardPile);
      remainingDeck = newDeck;
      s.discardPile = [topCard];
      s.log.push(createLogEntry('DECK_RECYCLED', `Deck recycled from discard pile`, {}));
    }
    const { drawn: cards, remaining } = drawFromDeck(remainingDeck, 1);
    drawn.push(...cards);
    remainingDeck = remaining;
  }

  player.hand.push(...drawn);
  player.cardsRemaining = player.hand.length;
  s.deck = remainingDeck;

  s.log.push(createLogEntry('PLAYER_DREW_CARD', `${player.name} drew ${drawAmount} cards`, { playerId, amount: drawAmount }));

  // If there was a pending skip (from draw two / draw four), the turn passes
  if (s.pendingSkip) {
    s.pendingSkip = false;
    s.currentPlayerIndex = getNextPlayerIndex(s, false);
    s.turnNumber += 1;
  }

  s.updatedAt = Date.now();
  return s;
}

export function endTurn(state: GameState, playerId: string): GameState {
  const s = cloneState(state);
  if (s.players[s.currentPlayerIndex].id !== playerId) {
    return logError(s, `Not ${playerId}'s turn`);
  }

  s.currentPlayerIndex = getNextPlayerIndex(s, false);
  s.turnNumber += 1;
  s.log.push(createLogEntry('TURN_PASSED', `${playerId} passed turn`, { playerId }));
  s.updatedAt = Date.now();
  return s;
}

export function callUno(state: GameState, playerId: string): GameState {
  const s = cloneState(state);
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return logError(s, `Player ${playerId} not found`);

  if (player.hand.length === 1) {
    s.unoState = {
      calledByPlayerId: playerId,
      timestamp: Date.now(),
      status: 'valid',
      vulnerablePlayerIds: [],
    };
    s.log.push(createLogEntry('PLAYER_CALLED_UNO', `${player.name} called UNO!`, { playerId }));
  } else {
    s.unoState = {
      calledByPlayerId: playerId,
      timestamp: Date.now(),
      status: 'invalid',
      vulnerablePlayerIds: [playerId],
    };
    s.log.push(createLogEntry('PLAYER_CALLED_UNO', `${player.name} called UNO (invalid)`, { playerId }));
  }

  s.updatedAt = Date.now();
  return s;
}

function endRound(state: GameState, winnerId: string): GameState {
  const s = state;
  const winner = s.players.find((p) => p.id === winnerId);
  if (!winner) return s;

  // Calculate scores from remaining hands
  const scores: Record<string, number> = {};
  for (const player of s.players) {
    if (player.id === winnerId) {
      scores[player.id] = 0;
    } else {
      scores[player.id] = getHandScore(player.hand);
    }
  }

  // Update team scores
  if (s.settings.teamMode) {
    for (const team of s.teams) {
      let teamRoundScore = 0;
      for (const player of s.players) {
        if (player.teamId === team.id) {
          teamRoundScore += scores[player.id] ?? 0;
        }
      }
      // Winner's team gets the points
      if (winner.teamId === team.id) {
        team.score += teamRoundScore;
      }
    }
  }

  const round = {
    number: s.roundNumber,
    startingPlayerId: s.players[0].id,
    winnerId,
    scores,
  };
  s.rounds.push(round);
  s.winnerId = winnerId;
  s.status = 'ROUND_OVER' as GameStatus;
  s.log.push(createLogEntry('ROUND_ENDED', `Round ${s.roundNumber} ended. Winner: ${winner.name}`, { playerId: winnerId }));

  // Check if game is over (target score reached)
  if (s.settings.teamMode) {
    for (const team of s.teams) {
      if (team.score >= s.settings.targetScore) {
        s.status = 'GAME_OVER';
        s.log.push(createLogEntry('ROUND_ENDED', `Game over. Team ${team.name} wins!`, {}));
        break;
      }
    }
  } else {
    // For non-team mode, accumulate player scores across rounds
    // (stored in rounds array; game over when someone reaches target)
    const totalScores: Record<string, number> = {};
    for (const r of s.rounds) {
      for (const [pid, sc] of Object.entries(r.scores)) {
        totalScores[pid] = (totalScores[pid] ?? 0) + sc;
      }
    }
    for (const player of s.players) {
      if ((totalScores[player.id] ?? 0) >= s.settings.targetScore) {
        s.status = 'GAME_OVER';
        s.log.push(createLogEntry('ROUND_ENDED', `Game over. ${player.name} wins!`, {}));
        break;
      }
    }
  }

  s.updatedAt = Date.now();
  return s;
}

export function startNewRound(state: GameState): GameState {
  const s = cloneState(state);
  if (s.status !== 'ROUND_OVER') {
    return logError(s, `Cannot start new round when not in ROUND_OVER status`);
  }

  // Reset hands and deck
  let deck = shuffleDeck(createDeck());

  for (let i = 0; i < s.settings.startingCards; i++) {
    for (const player of s.players) {
      const { drawn, remaining } = drawFromDeck(deck, 1);
      player.hand.push(...drawn);
      deck = remaining;
    }
  }

  for (const player of s.players) {
    player.cardsRemaining = player.hand.length;
  }

  const { card: initialCard, remaining } = pickInitialCard(deck);
  deck = remaining;

  s.deck = deck;
  s.discardPile = [initialCard];
  s.activeCard = initialCard;
  s.activeColor = initialCard.color;
  s.currentPlayerIndex = 0;
  s.direction = 'clockwise';
  s.pendingDraw = 0;
  s.pendingSkip = false;
  s.roundNumber += 1;
  s.turnNumber = 1;
  s.winnerId = undefined;
  s.status = 'PLAYING';
  s.unoState = {
    calledByPlayerId: null,
    timestamp: null,
    status: 'pending',
    vulnerablePlayerIds: [],
  };

  s.log.push(createLogEntry('ROUND_STARTED', `Round ${s.roundNumber} started`, {}));
  s.updatedAt = Date.now();
  return s;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
    })),
    teams: state.teams.map((t) => ({ ...t })),
    deck: [...state.deck],
    discardPile: [...state.discardPile],
    unoState: { ...state.unoState },
    settings: { ...state.settings },
    rounds: state.rounds.map((r) => ({ ...r, scores: { ...r.scores } })),
    log: [...state.log],
  };
}

function logError(state: GameState, message: string): GameState {
  state.log.push(createLogEntry('ERROR', message, {}));
  state.updatedAt = Date.now();
  return state;
}

export function getTeamWinner(state: GameState): Team | null {
  if (!state.settings.teamMode) return null;
  for (const team of state.teams) {
    if (team.score >= state.settings.targetScore) return team;
  }
  return null;
}

export function getCurrentPlayer(state: GameState): Player | undefined {
  return state.players[state.currentPlayerIndex];
}

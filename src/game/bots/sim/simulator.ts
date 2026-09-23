// Headless bot-vs-bot simulator for statistical validation. Pure: no React, no clock, no Math.random.
// It observes the FULL state to measure decisions; the bots themselves still only see their PlayerView.
import type { Card, GameAction, GameSettings, GameState } from '@/game/engine';
import { applyAction, areTeammates, createGame, getNextPlayerIndex, isWild, validateAction } from '@/game/engine';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';
import { createBotController } from '../botController';
import type { BotSetup } from '../botController';
import { checkInvariants } from './invariants';
import { emptyBatchMetrics } from './metrics';
import type { BatchMetrics, GroupMetrics } from './metrics';

export type Group = 'A' | 'B';

export interface Experiment {
  id: string;
  title: string;
  /** Group of each seat, e.g. ['A','B','A','B']. In team mode the group is also the team. */
  seating: Group[];
  setups: Record<Group, BotSetup>;
  teams?: boolean;
  settings?: Partial<GameSettings>;
  /** Swap which group sits where on every other seed, to cancel seat-order advantages. */
  alternateSeats?: boolean;
  /** Also ask this profile what it would have done in every decision of `group` (same state, same seed). */
  counterfactual?: { group: Group; setup: BotSetup };
  /** Re-ask every Nth decision with other bot seeds to measure how random the choice is. 0 = off. */
  consistencyEvery?: number;
}

const MAX_STEPS = 5000;

function fnv(h: number, text: string): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ATTACK_TYPES = new Set(['SKIP', 'DRAW_TWO', 'WILD_DRAW_FOUR']);

function seatGroups(exp: Experiment, seed: number): Group[] {
  if (!exp.alternateSeats || seed % 2 === 1) return exp.seating;
  return exp.seating.map((g) => (g === 'A' ? 'B' : 'A'));
}

/** Plays one round and adds its measurements to `m`. */
export function simulateRound(exp: Experiment, seed: number, m: BatchMetrics): GameState | null {
  const groups = seatGroups(exp, seed);
  const players = groups.map((g, i) => ({ id: `s${i}`, name: `S${i}`, type: 'BOT' as const, teamId: exp.teams ? g : undefined }));
  const setupOf = (i: number) => exp.setups[groups[i]];
  let state = createGame({
    players,
    seed,
    settings: { ...exp.settings, teamMode: !!exp.teams },
    teams: exp.teams
      ? [
          { id: 'A', name: 'A' },
          { id: 'B', name: 'B' },
        ]
      : undefined,
  });
  const bots = Object.fromEntries(players.map((p, i) => [p.id, setupOf(i)]));
  const controller = createBotController({ seed, bots });
  const counterfactual = exp.counterfactual
    ? createBotController({
        seed,
        bots: Object.fromEntries(players.map((p, i) => [p.id, groups[i] === exp.counterfactual!.group ? exp.counterfactual!.setup : setupOf(i)])),
      })
    : null;
  const consistency = exp.consistencyEvery
    ? [1, 2, 3, 4].map((k) => createBotController({ seed: (seed * 7919 + k) >>> 0, bots }))
    : [];

  for (const g of groups) m.groups[g].seats += 1;
  m.rounds += 1;
  let steps = 0;

  while (state.status === 'PLAYING') {
    if (++steps > MAX_STEPS) {
      m.loops += 1;
      m.unfinished += 1;
      m.failures.push({ seed, kind: 'loop', detail: `${exp.id}: no end after ${MAX_STEPS} actions` });
      return null;
    }
    const actorId = getActingPlayerId(state)!;
    const actorIndex = state.players.findIndex((p) => p.id === actorId);
    const g = m.groups[groups[actorIndex]];
    const action = controller.decide(state, actorId);
    if (!action) {
      m.stalls += 1;
      m.unfinished += 1;
      m.failures.push({ seed, kind: 'stall', detail: `${exp.id}: ${actorId} returned no action at turn ${state.turnNumber}` });
      return null;
    }
    m.decisionHash = fnv(m.decisionHash, JSON.stringify(action));

    if (counterfactual && groups[actorIndex] === exp.counterfactual!.group) {
      g.counterfactualCompared += 1;
      if (JSON.stringify(counterfactual.decide(state, actorId)) === JSON.stringify(action)) g.counterfactualAgree += 1;
    }
    if (consistency.length && steps % exp.consistencyEvery! === 0) {
      for (const c of consistency) {
        g.consistencyCompared += 1;
        if (JSON.stringify(c.decide(state, actorId)) === JSON.stringify(action)) g.consistencyAgree += 1;
      }
    }

    const result = applyAction(state, action);
    if (!result.ok) {
      m.illegalActions += 1;
      m.unfinished += 1;
      m.failures.push({ seed, kind: 'illegal', detail: `${exp.id}: ${JSON.stringify(action)} → ${result.error}` });
      return null;
    }
    recordDecision(state, result.state, action, actorIndex, g, m, groups);
    const problems = checkInvariants(state, action, result.state);
    if (problems.length) {
      m.invariantViolations += problems.length;
      m.failures.push({ seed, kind: 'invariant', detail: `${exp.id}: ${problems.join('; ')} after ${JSON.stringify(action)}` });
    }
    state = result.state;
  }

  m.finished += 1;
  m.turnsSum += state.turnNumber;
  m.stepsSum += steps;
  state.players.forEach((p, i) => {
    const gm = m.groups[groups[i]];
    gm.endHandCards += p.hand.length;
    if (p.id !== state.winnerId) {
      gm.endHandCardsLosers += p.hand.length;
      gm.losingSeatRounds += 1;
    }
  });
  const winnerIndex = state.players.findIndex((p) => p.id === state.winnerId);
  m.groups[groups[winnerIndex]].roundsWon += 1;
  return state;
}

function colorFit(hand: Card[], color: string | null): number {
  if (!color || hand.length === 0) return 0;
  return hand.filter((c) => c.color === color || isWild(c)).length / hand.length;
}

/** Classifies one decision using the full before/after states (measurement only). */
function recordDecision(
  before: GameState,
  after: GameState,
  action: GameAction,
  actorIndex: number,
  g: GroupMetrics,
  m: BatchMetrics,
  groups: Group[]
) {
  const actor = before.players[actorIndex];
  const n = before.players.length;
  g.decisions += 1;

  // Cards each seat received during this action (draws and penalties), from hand-size deltas.
  after.players.forEach((p, i) => {
    const played = action.type === 'PLAY_CARD' && i === actorIndex ? 1 : 0;
    const received = p.hand.length - before.players[i].hand.length + played;
    if (received > 0) m.groups[groups[i]].cardsDrawn += received;
  });
  const newLog = after.log.slice(before.log.length);
  for (const e of newLog) {
    if (e.type === 'UNO_PENALTY' && e.playerId) {
      const i = after.players.findIndex((p) => p.id === e.playerId);
      m.groups[groups[i]].unoPenaltiesSuffered += 1;
    }
  }

  const isMyTurn = before.players[before.currentPlayerIndex].id === actor.id;
  const pending = before.pendingAction;
  const legalPlays = isMyTurn && pending?.type !== 'CHOOSE_COLOR'
    ? actor.hand.filter((c) => validateAction(before, { type: 'PLAY_CARD', playerId: actor.id, cardId: c.id }).valid)
    : [];
  const teammateIndex = before.players.findIndex((p, i) => i !== actorIndex && areTeammates(before, p.id, actor.id));

  // UNO opportunity: own turn, two cards, a legal play, not yet declared.
  if (isMyTurn && pending?.type !== 'CHOOSE_COLOR' && actor.hand.length === 2 && legalPlays.length > 0 && !before.unoState.declaredPlayerIds.includes(actor.id)) {
    g.unoOpportunities += 1;
    if (action.type === 'CALL_UNO') g.unoCalls += 1;
    else if (action.type === 'PLAY_CARD') g.unoForgets += 1;
  }
  // Challenge opportunity against an opponent.
  const target = before.unoState.penaltyWindowPlayerId;
  if (target && target !== actor.id && !areTeammates(before, target, actor.id) &&
      validateAction(before, { type: 'CHALLENGE_UNO', playerId: actor.id, targetId: target }).valid) {
    g.challengeOpportunities += 1;
    if (action.type === 'CHALLENGE_UNO') g.challenges += 1;
  }

  if (action.type === 'CHOOSE_COLOR') g.colorChoices += 1;
  if (action.type === 'END_TURN') g.endTurns += 1;
  if (action.type === 'DRAW_CARD') {
    g.draws += 1;
    if (legalPlays.length > 0) g.drawsWithLegalPlay += 1;
  }

  if (isMyTurn && legalPlays.length > 0) {
    const hasWild = legalPlays.some(isWild);
    const hasNonWild = legalPlays.some((c) => !isWild(c));
    if (hasWild && hasNonWild) g.wildAlternativeOpportunities += 1;

    const next = getNextPlayerIndex(before, actorIndex, 1);
    const nextIsThreatenedOpponent =
      !areTeammates(before, before.players[next].id, actor.id) && before.players[next].hand.length <= 2;
    const attackAvailable = legalPlays.some((c) => ATTACK_TYPES.has(c.type) || (c.type === 'REVERSE' && n === 2));
    if (nextIsThreatenedOpponent && attackAvailable) g.attackOnThreatOpportunities += 1;

    if (action.type === 'PLAY_CARD') {
      const card = actor.hand.find((c) => c.id === action.cardId)!;
      if (card.type === 'NUMBER') g.playNumber += 1;
      else if (card.type === 'WILD') g.playWild += 1;
      else if (card.type === 'WILD_DRAW_FOUR') g.playWildFour += 1;
      else g.playAction += 1;
      if (isWild(card) && hasNonWild) g.wildWhenAlternative += 1;
      if (nextIsThreatenedOpponent && attackAvailable && (ATTACK_TYPES.has(card.type) || (card.type === 'REVERSE' && n === 2))) {
        g.attackOnThreatTaken += 1;
      }
    }
  }

  // Effects of a resolved play (a wild whose color is chosen later is measured at CHOOSE_COLOR).
  const resolved = (action.type === 'PLAY_CARD' && after.pendingAction?.type !== 'CHOOSE_COLOR') || action.type === 'CHOOSE_COLOR';
  if (resolved && after.currentColor) {
    if (after.currentColor !== before.currentColor && before.currentColor) g.colorChanges += 1;
    const handAfter = after.players[actorIndex].hand;
    if (handAfter.length > 0) {
      g.colorFitSum += colorFit(handAfter, after.currentColor);
      g.colorFitSamples += 1;
    }
    const wasWild =
      action.type === 'CHOOSE_COLOR' ||
      (action.type === 'PLAY_CARD' && isWild(actor.hand.find((c) => c.id === action.cardId)!));
    if (wasWild && teammateIndex >= 0) {
      g.teammateColorFitSum += colorFit(after.players[teammateIndex].hand, after.currentColor);
      g.teammateColorFitSamples += 1;
    }

    // Who was hit (skipped or made to draw) — read from the engine's own log.
    const victims = newLog.filter((e) => (e.type === 'PLAYER_SKIPPED' || e.type === 'DRAW_PENALTY') && e.playerId).map((e) => e.playerId!);
    for (const v of new Set(victims)) {
      if (v === actor.id) continue;
      if (areTeammates(before, v, actor.id)) {
        g.attacksOnTeammate += 1;
        if (teammateIndex >= 0 && before.players[teammateIndex].hand.length <= 2) g.teammateNearWinAttacks += 1;
      } else g.attackPlays += 1;
    }
  }

  // Where the turn goes after the actor's move.
  if (after.status === 'PLAYING' && teammateIndex >= 0 && (action.type === 'PLAY_CARD' || action.type === 'CHOOSE_COLOR' || action.type === 'DRAW_CARD' || action.type === 'END_TURN')) {
    const nextActor = after.pendingAction?.playerId ?? after.players[after.currentPlayerIndex].id;
    if (nextActor !== actor.id) {
      g.turnDecisions += 1;
      if (before.players[teammateIndex].hand.length <= 2) g.teammateNearWinDecisions += 1;
      const toMate = nextActor === before.players[teammateIndex].id;
      if (toMate) g.turnToTeammate += 1;
      if (toMate && before.players[teammateIndex].hand.length <= 2) g.teammateNearWinPassTurn += 1;
    }
  }
}

export function runBatch(exp: Experiment, rounds: number, firstSeed = 1): BatchMetrics {
  const m = emptyBatchMetrics();
  for (let seed = firstSeed; seed < firstSeed + rounds; seed++) simulateRound(exp, seed, m);
  return m;
}

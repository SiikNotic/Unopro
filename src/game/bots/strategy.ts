// Bot decision making. Works only on a PlayerView and only chooses among actions the
// engine's validateAction already accepts — legality is never re-implemented here.
import type { Card, CardColor, GameAction, GameState, Rng } from '@/game/engine';
import { COLORS, areTeammates, getCardScore, getNextPlayerIndex, isWild, validateAction } from '@/game/engine';
import type { PlayerView } from './playerView';
import type { BotProfile } from './profiles';
import { inferMissingColors } from './knowledge';

type Relation = 'self' | 'teammate' | 'opponent';

interface Context {
  view: PlayerView;
  state: GameState;
  me: string;
  myIndex: number;
  hand: Card[];
  profile: BotProfile;
  rng: Rng;
  missing: Record<string, Set<CardColor>> | null;
}

const isLegal = (state: GameState, action: GameAction) => validateAction(state, action).valid;

function relation(ctx: Context, index: number): Relation {
  const id = ctx.state.players[index].id;
  if (id === ctx.me) return 'self';
  return areTeammates(ctx.state, id, ctx.me) ? 'teammate' : 'opponent';
}

/** 0 = no threat; grows as a player gets closer to going out. */
function threat(ctx: Context, index: number): number {
  const cards = ctx.state.players[index].cardsRemaining;
  return cards <= ctx.profile.threatThreshold ? ctx.profile.threatThreshold + 1 - cards : 0;
}

/** Who is hit and who plays next after `card` — public turn order only (mirrors what a player sees happen). */
function consequences(ctx: Context, card: Card) {
  const n = ctx.state.players.length;
  const next = getNextPlayerIndex(ctx.state, ctx.myIndex, 1);
  const afterNext = getNextPlayerIndex(ctx.state, ctx.myIndex, 2);
  switch (card.type) {
    case 'SKIP':
      return { victim: next, delayed: null, turnGoesTo: afterNext };
    case 'DRAW_TWO':
    case 'WILD_DRAW_FOUR':
      return { victim: next, delayed: null, turnGoesTo: ctx.state.settings.stacking ? next : afterNext };
    case 'REVERSE': {
      if (n === 2) return { victim: next, delayed: null, turnGoesTo: ctx.myIndex };
      const previous = getNextPlayerIndex(ctx.state, ctx.myIndex, -1);
      return { victim: null, delayed: next, turnGoesTo: previous };
    }
    default:
      return { victim: null, delayed: null, turnGoesTo: next };
  }
}

/** How well a color suits a hand: matching cards (action cards a bit more), wilds help any color. */
function colorFit(hand: Card[], color: CardColor): number {
  return hand.reduce((sum, c) => sum + (c.color === color ? (c.type === 'NUMBER' ? 1 : 1.3) : 0), 0);
}

function chooseColor(ctx: Context, handAfter: Card[], turnGoesTo: number): CardColor {
  if (ctx.rng.next() < ctx.profile.randomColorRate) return COLORS[Math.floor(ctx.rng.next() * COLORS.length)];
  let best: CardColor = COLORS[0];
  let bestScore = -Infinity;
  for (const color of COLORS) {
    let score = colorFit(handAfter, color) + ctx.rng.next() * 0.1;
    if (ctx.missing) {
      const nextId = ctx.state.players[turnGoesTo].id;
      const rel = relation(ctx, turnGoesTo);
      if (rel === 'opponent' && ctx.missing[nextId]?.has(color)) score += 1.5;
      if (rel === 'teammate' && ctx.missing[nextId]?.has(color)) score -= 1.2 * ctx.profile.team;
    }
    if (score > bestScore) {
      bestScore = score;
      best = color;
    }
  }
  return best;
}

function scorePlay(ctx: Context, card: Card, chosenColor: CardColor | undefined, hasNonWildOption: boolean): number {
  const { profile, hand } = ctx;
  const handAfter = hand.filter((c) => c.id !== card.id);
  if (handAfter.length === 0) return 1000; // going out always wins the round

  const { victim, delayed, turnGoesTo } = consequences(ctx, card);
  const anyThreat = ctx.state.players.some((_, i) => relation(ctx, i) === 'opponent' && threat(ctx, i) > 0);
  let score = 4;

  // Keep a color the rest of the hand can follow.
  const resultingColor = chosenColor ?? (card.color as CardColor);
  const followers = colorFit(handAfter, resultingColor) + handAfter.filter(isWild).length * 0.5;
  score += (profile.colorWeight * 6 * followers) / handAfter.length;

  // Dump expensive cards, more urgently when someone is about to go out.
  score += profile.shedWeight * (getCardScore(card) / 50) * (anyThreat ? 3 : 1.2);

  // Hold wilds back while there are alternatives and the hand is still big.
  if (isWild(card)) {
    const handFactor = handAfter.length >= 3 ? 6 : 2;
    score -= profile.wildConserve * handFactor * (hasNonWildOption ? 1 : 0.3) + (card.type === 'WILD_DRAW_FOUR' ? 1.5 : 0);
  }

  const isAttack = victim !== null;
  if (isAttack) {
    const rel = relation(ctx, victim);
    const power = card.type === 'WILD_DRAW_FOUR' ? 1.6 : card.type === 'DRAW_TWO' ? 1.3 : 1;
    if (rel === 'opponent') {
      const t = threat(ctx, victim);
      score += profile.attack * power * (1 + 4 * t);
      if (t === 0) score -= profile.actionConserve * 2.5;
    } else if (rel === 'teammate') {
      score -= profile.team * (6 + 3 * threat(ctx, victim));
    }
  } else if (card.type === 'REVERSE') {
    if (delayed !== null) {
      const rel = relation(ctx, delayed);
      const t = threat(ctx, delayed);
      if (rel === 'opponent') score += profile.attack * 2 * t;
      if (rel === 'teammate') score -= profile.team * 3 * t;
      if (t === 0) score -= profile.actionConserve * 1.5;
    }
  }

  // Who plays next: hand the turn to a teammate close to going out, not to a threatening opponent.
  if (turnGoesTo !== ctx.myIndex) {
    const rel = relation(ctx, turnGoesTo);
    const nextId = ctx.state.players[turnGoesTo].id;
    if (rel === 'teammate') {
      const cards = ctx.state.players[turnGoesTo].cardsRemaining;
      const closeness = Math.max(0, 4 - cards);
      score += profile.team * (1 + 2 * closeness);
      if (ctx.missing?.[nextId]?.has(resultingColor)) score -= 2 * profile.team;
    } else if (rel === 'opponent' && profile.readsTable) {
      score -= 1.5 * threat(ctx, turnGoesTo);
      if (ctx.missing?.[nextId]?.has(resultingColor)) score += 3;
    }
  }

  return score;
}

interface Option {
  action: GameAction;
  score: number;
}

/**
 * Picks the bot's next action from its PlayerView. Returns null when it has nothing to do.
 * Randomness comes only from `rng`, so the same view + profile + rng seed gives the same decision.
 */
export function chooseAction(view: PlayerView, profile: BotProfile, rng: Rng): GameAction | null {
  const state = view.state;
  const me = view.playerId;
  if (state.status !== 'PLAYING') return null;
  const myIndex = state.players.findIndex((p) => p.id === me);
  const hand = state.players[myIndex].hand;
  const ctx: Context = {
    view,
    state,
    me,
    myIndex,
    hand,
    profile,
    rng,
    missing: profile.readsTable ? inferMissingColors(state) : null,
  };
  const pending = state.pendingAction;

  // 1. A color is owed (wild just played, or wild starting card).
  if (pending?.type === 'CHOOSE_COLOR') {
    if (pending.playerId !== me) return null;
    const next = getNextPlayerIndex(state, myIndex, 1);
    const action: GameAction = { type: 'CHOOSE_COLOR', playerId: me, color: chooseColor(ctx, hand, next) };
    return isLegal(state, action) ? action : null;
  }

  // 2. Catch an opponent who forgot to call UNO (never the teammate).
  const target = state.unoState.penaltyWindowPlayerId;
  if (target && target !== me && !areTeammates(state, target, me)) {
    const challenge: GameAction = { type: 'CHALLENGE_UNO', playerId: me, targetId: target };
    if (isLegal(state, challenge) && rng.next() < profile.challengeRate) return challenge;
  }

  if (state.players[state.currentPlayerIndex].id !== me) return null;

  // 3. Legal options, straight from the engine's validator.
  const plays = hand
    .map((card) => {
      const base: GameAction = { type: 'PLAY_CARD', playerId: me, cardId: card.id };
      if (!isLegal(state, base)) return null;
      if (!isWild(card)) return { card, action: base, color: undefined as CardColor | undefined };
      const handAfter = hand.filter((c) => c.id !== card.id);
      const { turnGoesTo } = consequences(ctx, card);
      const color = chooseColor(ctx, handAfter, turnGoesTo);
      return { card, action: { ...base, chosenColor: color } as GameAction, color };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && isLegal(state, p.action));

  // 4. UNO: announce before playing the second-to-last card (or late, if still allowed) — unless it forgets.
  const declared = state.unoState.declaredPlayerIds.includes(me);
  const unoApplies = !declared && ((hand.length === 2 && plays.length > 0) || state.unoState.penaltyWindowPlayerId === me);
  if (unoApplies && rng.next() < profile.unoCallRate) {
    return { type: 'CALL_UNO', playerId: me };
  }

  const drawAction: GameAction = { type: 'DRAW_CARD', playerId: me };
  const passAction: GameAction = { type: 'END_TURN', playerId: me };
  if (plays.length === 0) {
    if (isLegal(state, drawAction)) return drawAction;
    if (isLegal(state, passAction)) return passAction;
    return null;
  }

  // Easy bots sometimes just play whatever.
  if (rng.next() < profile.mistakeRate) return plays[Math.floor(rng.next() * plays.length)].action;

  const hasNonWild = plays.some((p) => !isWild(p.card));
  const onlyWilds = !hasNonWild;
  const anyThreat = state.players.some((_, i) => relation(ctx, i) === 'opponent' && threat(ctx, i) > 0);
  const options: Option[] = plays.map((p) => ({
    action: p.action,
    score: scorePlay(ctx, p.card, p.color, hasNonWild) + rng.next() * profile.noise,
  }));

  // Drawing instead of spending a wild (official rules allow it) — only sensible with a big hand and no danger.
  if (isLegal(state, drawAction)) {
    const saveWild = onlyWilds && hand.length >= 5 && !anyThreat ? profile.wildConserve * 5 - 2 : 0;
    options.push({ action: drawAction, score: -6 + saveWild + rng.next() * profile.noise });
  }
  // After drawing a playable card: keep it (e.g. a wild) and pass.
  if (isLegal(state, passAction)) {
    const drawn = hand.find((c) => pending?.type === 'PLAY_DRAWN_CARD' && c.id === pending.cardId);
    const keepWild = drawn && isWild(drawn) && hand.length >= 4 && !anyThreat ? profile.wildConserve * 4 : 0;
    options.push({ action: passAction, score: -4 + keepWild + rng.next() * profile.noise });
  }

  return options.reduce((best, o) => (o.score > best.score ? o : best)).action;
}

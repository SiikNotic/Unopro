// The account-coins casino server, free of any platform API so it runs (and is tested) anywhere; the
// `casino` edge function wraps it. Every round is drawn here with the crypto generator and the same pure
// engines the browser uses, then booked in one database transaction (balance check, debit, credit,
// record, idempotent on the request id). Guests are refused: their chips live in their own browser.
//
// Two request shapes:
//  - the premium slot protocol (GET ?balance=1, GET ?requestId=, POST { requestId, machine, bet }), so the
//    slot machines' existing remote client works unchanged;
//  - POST { op, ... } for the account, the welcome credit, roulette, classic slots and blackjack.
import { cryptoUint32, isMachineId, isRequestId, isValidBetFor, playRound } from '../premium/engine';
import type { MachineId, RoundDraws } from '../premium/engine';
import { MACHINES } from '../premium/machines';
import { cryptoRng, secureSeed } from '../random';
import { BET_PER_LINE, evaluateSpin, LINE_OPTIONS, spinReels } from '../slots';
import { spin as spinWheel, totalPayout as roulettePayout } from '../roulette';
import type { Bet, BetType } from '../roulette';
import * as bj from '../blackjack';
import type { BlackjackState } from '../blackjack';
import type { Rng } from '@/game/engine';
import type { AccountInfo, BlackjackView, CasinoErrorCode, RouletteResult, SlotsResult } from './protocol';

export type InstantGame = 'premium' | 'roulette' | 'slots';

export interface Booking {
  requestId: string;
  game: InstantGame | 'bonus' | 'blackjack';
  stake: number;
  payout: number;
  balance: number;
  detail: Record<string, unknown>;
  at: number;
}

export interface BjRow {
  requestId: string;
  stake: number;
  state: BlackjackState;
  version: number;
}

export type CasinoStoreErrorCode = 'insufficient_funds' | 'conflict' | 'invalid_bet' | 'not_registered' | 'game_disabled';
export class CasinoStoreError extends Error {
  constructor(readonly code: CasinoStoreErrorCode) {
    super(code);
  }
}

/** Database operations (see the accounts migration). Each one is a single transaction. */
export interface CasinoStore {
  account(userId: string): Promise<AccountInfo>;
  claimBonus(userId: string, requestId: string): Promise<{ balance: number; granted: boolean }>;
  play(c: { userId: string; requestId: string; game: InstantGame; stake: number; payout: number; detail: Record<string, unknown> }): Promise<Booking & { replayed: boolean }>;
  find(userId: string, requestId: string): Promise<Booking | null>;
  bjLoad(userId: string): Promise<BjRow | null>;
  bjOpen(userId: string, requestId: string, stake: number, state: BlackjackState): Promise<number>;
  bjStep(userId: string, requestId: string, version: number, extra: number, state: BlackjackState, payout: number | null, detail: Record<string, unknown> | null): Promise<number>;
}

export interface CasinoUser {
  id: string;
  /** Not anonymous and email confirmed (the database checks this again). */
  registered: boolean;
}

export interface CasinoDeps {
  store: CasinoStore;
  /** Premium slot draws (uint32). */
  random?: () => number;
  /** Roulette, classic slots and blackjack shuffles. */
  rng?: () => Rng;
  seed?: () => number;
  allow?: (userId: string) => boolean;
  /** Owner's game control (game_enabled): is this game in service? Absent = always. */
  gameEnabled?: (game: 'slots' | 'roulette' | 'blackjack') => Promise<boolean>;
}

export interface HttpIn {
  method: string;
  url: string;
  user: CasinoUser | null;
  body: unknown;
}
export interface HttpOut {
  status: number;
  body: unknown;
}

const STATUS: Record<CasinoErrorCode, number> = {
  unauthorized: 401,
  account_required: 403,
  insufficient_funds: 402,
  invalid_bet: 400,
  conflict: 409,
  rate_limited: 429,
  bad_request: 400,
  game_disabled: 423,
  server: 500,
};
const fail = (code: CasinoErrorCode): HttpOut => ({ status: STATUS[code], body: { code } });
const ok = (body: unknown): HttpOut => ({ status: 200, body });

/** The most a single round may stake (the database enforces it too). */
export const MAX_STAKE = 100000;
const MAX_ROULETTE_BETS = 60;
const BET_TYPES: BetType[] = ['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'column'];

/** Strict parse of the roulette bets: known spots, whole positive amounts, bounded total. */
export function parseBets(x: unknown): Bet[] | null {
  if (!Array.isArray(x) || x.length === 0 || x.length > MAX_ROULETTE_BETS) return null;
  const out: Bet[] = [];
  let total = 0;
  for (const raw of x) {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const type = b.type as BetType;
    if (!BET_TYPES.includes(type)) return null;
    if (typeof b.amount !== 'number' || !Number.isInteger(b.amount) || b.amount < 1) return null;
    let value: number | undefined;
    if (type === 'straight') {
      if (typeof b.value !== 'number' || !Number.isInteger(b.value) || b.value < 0 || b.value > 36) return null;
      value = b.value;
    } else if (type === 'dozen' || type === 'column') {
      if (typeof b.value !== 'number' || !Number.isInteger(b.value) || b.value < 1 || b.value > 3) return null;
      value = b.value;
    } else if (b.value !== undefined) return null;
    total += b.amount;
    out.push(value === undefined ? { type, amount: b.amount } : { type, value, amount: b.amount });
  }
  return total <= MAX_STAKE ? out : null;
}

const stakeOf = (bets: Bet[]) => bets.reduce((s, b) => s + b.amount, 0);

/** What the player may see of a table: no shoe, no hole card while the round is being played. */
export function bjView(row: { requestId: string; stake: number; state: BlackjackState }, balance: number): BlackjackView {
  const s = row.state;
  const hidden = s.phase === 'PLAYER';
  return {
    requestId: row.requestId,
    phase: s.phase,
    hands: s.hands,
    active: s.active,
    dealer: s.dealer.map((c, i) => (hidden && i === 1 ? null : c)),
    results: s.results,
    stake: row.stake,
    balance,
  };
}

const premiumReceipt = (b: Booking) => ({
  requestId: b.requestId,
  machine: b.detail.machine as MachineId,
  bet: b.stake,
  draws: b.detail.draws as RoundDraws,
  payout: b.payout,
  balance: b.balance,
  at: b.at,
});

export async function handleCasinoRequest(req: HttpIn, deps: CasinoDeps): Promise<HttpOut> {
  if (!req.user) return fail('unauthorized');
  const user = req.user;
  if (deps.allow && !deps.allow(user.id)) return fail('rate_limited');
  const rng = deps.rng ?? cryptoRng;
  const seed = deps.seed ?? secureSeed;
  const store = deps.store;

  try {
    // ---- premium slot protocol ----
    if (req.method === 'GET') {
      if (!user.registered) return fail('account_required');
      const url = new URL(req.url);
      if (url.searchParams.has('balance')) return ok({ balance: (await store.account(user.id)).balance });
      const requestId = url.searchParams.get('requestId');
      if (!isRequestId(requestId)) return fail('invalid_bet');
      const found = await store.find(user.id, requestId.toLowerCase());
      return found && found.game === 'premium' ? ok(premiumReceipt(found)) : { status: 404, body: { found: false } };
    }
    if (req.method !== 'POST') return fail('bad_request');
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    if (b.op === undefined) {
      if (!user.registered) return fail('account_required');
      const { requestId, machine, bet } = b;
      if (!isRequestId(requestId) || !isMachineId(machine) || !isValidBetFor(MACHINES[machine], bet)) return fail('invalid_bet');
      const id = requestId.toLowerCase();
      const existing = await store.find(user.id, id);
      if (existing) return existing.game === 'premium' && existing.detail.machine === machine && existing.stake === bet ? ok(premiumReceipt(existing)) : fail('conflict');
      // Out of service: no new round (a round already booked is still returned above). account_play refuses it too.
      if (deps.gameEnabled && !(await deps.gameEnabled('slots'))) return fail('game_disabled');
      const round = playRound(MACHINES[machine], bet, deps.random ?? cryptoUint32);
      const booked = await store.play({ userId: user.id, requestId: id, game: 'premium', stake: bet, payout: round.payout, detail: { machine, draws: round.draws } });
      if (booked.detail.machine !== machine) return fail('conflict');
      return ok(premiumReceipt(booked));
    }

    if (b.op === 'account') return ok(await store.account(user.id));
    if (!user.registered) return fail('account_required');

    const requestId = typeof b.requestId === 'string' && isRequestId(b.requestId) ? b.requestId.toLowerCase() : null;

    switch (b.op) {
      case 'claim': {
        if (!requestId) return fail('bad_request');
        return ok(await store.claimBonus(user.id, requestId));
      }

      case 'roulette': {
        const bets = parseBets(b.bets);
        if (!requestId || !bets) return fail('invalid_bet');
        const stake = stakeOf(bets);
        const existing = await store.find(user.id, requestId);
        if (existing) {
          if (existing.game !== 'roulette' || existing.stake !== stake) return fail('conflict');
          return ok({ requestId, pocket: existing.detail.pocket as number, stake, payout: existing.payout, balance: existing.balance } satisfies RouletteResult);
        }
        if (deps.gameEnabled && !(await deps.gameEnabled('roulette'))) return fail('game_disabled');
        const pocket = spinWheel(rng());
        const booked = await store.play({ userId: user.id, requestId, game: 'roulette', stake, payout: roulettePayout(bets, pocket), detail: { pocket, bets } });
        return ok({ requestId, pocket: booked.detail.pocket as number, stake, payout: booked.payout, balance: booked.balance } satisfies RouletteResult);
      }

      case 'slots': {
        const { lines, betPerLine } = b;
        if (!requestId || !(LINE_OPTIONS as readonly unknown[]).includes(lines) || !(BET_PER_LINE as readonly unknown[]).includes(betPerLine)) return fail('invalid_bet');
        const l = lines as number;
        const bpl = betPerLine as number;
        const stake = l * bpl;
        const existing = await store.find(user.id, requestId);
        const answer = (bk: Booking): SlotsResult => ({ requestId, stops: bk.detail.stops as number[], lines: l, betPerLine: bpl, payout: bk.payout, balance: bk.balance });
        if (existing) return existing.game === 'slots' && existing.stake === stake && existing.detail.lines === l ? ok(answer(existing)) : fail('conflict');
        if (deps.gameEnabled && !(await deps.gameEnabled('slots'))) return fail('game_disabled');
        const stops = spinReels(rng());
        const outcome = evaluateSpin(stops, l, bpl);
        return ok(answer(await store.play({ userId: user.id, requestId, game: 'slots', stake, payout: outcome.total, detail: { stops, lines: l, betPerLine: bpl } })));
      }

      case 'bj': {
        const row = await store.bjLoad(user.id);
        const { balance } = await store.account(user.id);
        return ok({ table: row ? bjView(row, balance) : null, balance });
      }

      case 'bj_deal': {
        const bet = b.bet;
        if (!requestId || typeof bet !== 'number' || !Number.isInteger(bet) || bet < 1 || bet > MAX_STAKE) return fail('invalid_bet');
        const current = await store.bjLoad(user.id);
        if (current) {
          // A retried deal gets the same table back; another hand in progress must be finished first.
          if (current.requestId !== requestId) return fail('conflict');
          return ok(bjView(current, (await store.account(user.id)).balance));
        }
        // A new hand only while blackjack is in service (a hand already dealt finishes: bj_act).
        if (deps.gameEnabled && !(await deps.gameEnabled('blackjack'))) return fail('game_disabled');
        const state = bj.deal(bj.createBlackjack(seed()), bet);
        let balance = await store.bjOpen(user.id, requestId, bet, state);
        if (state.phase === 'SETTLED') {
          // Naturals end the round at once (the dealer peeks).
          balance = await store.bjStep(user.id, requestId, 1, 0, state, bj.totalPayout(state), finalDetail(state));
        }
        return ok(bjView({ requestId, stake: bet, state }, balance));
      }

      case 'bj_act': {
        const action = b.action;
        if (!requestId || (action !== 'hit' && action !== 'stand' && action !== 'double' && action !== 'split')) return fail('bad_request');
        const row = await store.bjLoad(user.id);
        if (!row || row.requestId !== requestId || row.state.phase !== 'PLAYER') return fail('conflict');
        const s = row.state;
        if (action === 'double' && !bj.canDouble(s)) return fail('bad_request');
        if (action === 'split' && !bj.canSplit(s)) return fail('bad_request');
        const extra = action === 'double' || action === 'split' ? bj.extraStake(s, action) : 0;
        const next = action === 'hit' ? bj.hit(s) : action === 'stand' ? bj.stand(s) : action === 'double' ? bj.double(s) : bj.split(s);
        const settled = next.phase === 'SETTLED';
        const balance = await store.bjStep(user.id, requestId, row.version, extra, next, settled ? bj.totalPayout(next) : null, settled ? finalDetail(next) : null);
        return ok(bjView({ requestId, stake: row.stake + extra, state: next }, balance));
      }

      default:
        return fail('bad_request');
    }
  } catch (e) {
    if (e instanceof CasinoStoreError) return fail(e.code === 'not_registered' ? 'account_required' : e.code);
    throw e;
  }
}

/** What a finished hand records (no shoe). */
function finalDetail(s: BlackjackState): Record<string, unknown> {
  return { hands: s.hands, dealer: s.dealer, results: s.results };
}

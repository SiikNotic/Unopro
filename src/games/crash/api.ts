// Calls to the CRASH database functions. Watching needs no account (the public key reads the state); betting
// and cashing out go as the signed-in player, and the database checks who that is and what they may do.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';
import { onlineConfig } from '@/games/online/client';

export type BetStatus = 'placed' | 'cashed' | 'lost';

export interface CrashBetRow {
  name: string;
  amount: number;
  status: BetStatus;
  cashout: number | null;
  payout: number | null;
  me: boolean;
}

export interface CrashState {
  /** Database clock when the state was read (ms since epoch). */
  now: number;
  enabled: boolean;
  round: { id: number; hash: string; startsAt: number; crashed: boolean; crash: number | null; crashAt: number | null; seed: string | null };
  bets: CrashBetRow[];
  players: number;
  mine: { amount: number; auto: number | null; status: BetStatus; cashout: number | null; payout: number | null } | null;
  balance: number | null;
  history: { id: number; crash: number }[];
}

export interface MyCrashBet {
  round: number;
  amount: number;
  status: BetStatus;
  cashout: number | null;
  payout: number | null;
  crash: number | null;
  at: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const time = (v: unknown): number | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);
const status = (v: unknown): BetStatus => (v === 'cashed' || v === 'lost' ? v : 'placed');

/** Validates the server's answer (anything malformed is refused rather than drawn). */
export function parseState(raw: unknown): CrashState | null {
  const s = raw as Record<string, unknown> | null;
  const r = (s?.round ?? null) as Record<string, unknown> | null;
  const now = time(s?.now);
  const id = num(r?.id);
  const startsAt = time(r?.startsAt);
  if (!s || !r || now === null || id === null || startsAt === null || typeof r.hash !== 'string') return null;
  const mine = s.mine as Record<string, unknown> | null;
  return {
    now,
    enabled: s.enabled !== false,
    round: { id, hash: r.hash, startsAt, crashed: r.crashed === true, crash: num(r.crash), crashAt: time(r.crashAt), seed: typeof r.seed === 'string' ? r.seed : null },
    bets: (Array.isArray(s.bets) ? s.bets : []).map((b: Record<string, unknown>) => ({
      name: typeof b.name === 'string' ? b.name : '***',
      amount: num(b.amount) ?? 0,
      status: status(b.status),
      cashout: num(b.cashout),
      payout: num(b.payout),
      me: b.me === true,
    })),
    players: num(s.players) ?? 0,
    mine: mine ? { amount: num(mine.amount) ?? 0, auto: num(mine.auto), status: status(mine.status), cashout: num(mine.cashout), payout: num(mine.payout) } : null,
    balance: num(s.balance),
    history: (Array.isArray(s.history) ? s.history : []).map((h: Record<string, unknown>) => ({ id: num(h.id) ?? 0, crash: num(h.crash) ?? 1 })),
  };
}

/** The state, as the signed-in player (their own bet included) or, without an account, as a viewer. */
export async function fetchState(signedIn: boolean, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<RpcResult<CrashState>> {
  let res: RpcResult<unknown>;
  if (signedIn) {
    res = await rpc<unknown>('crash_state', {}, onlineConfig(), fetchImpl);
  } else {
    const cfg = onlineConfig();
    if (!cfg) return { ok: false, code: 'server', detail: 'no server' };
    try {
      const r = await fetchImpl(`${cfg.base}/rest/v1/rpc/crash_state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: cfg.apiKey, authorization: `Bearer ${cfg.apiKey}` },
        body: '{}',
      });
      res = r.ok ? { ok: true, data: await r.json() } : { ok: false, code: 'server', detail: String(r.status) };
    } catch {
      res = { ok: false, code: 'network', detail: '' };
    }
  }
  if (!res.ok) return res;
  const state = parseState(res.data);
  return state ? { ok: true, data: state } : { ok: false, code: 'server', detail: 'bad state' };
}

export interface BetAnswer {
  round: number;
  balance: number | null;
}
export async function placeBet(requestId: string, amount: number, auto: number | null): Promise<RpcResult<BetAnswer>> {
  const res = await rpc<Record<string, unknown>>('crash_bet', { p_request: requestId, p_amount: amount, p_auto: auto });
  return res.ok ? { ok: true, data: { round: num(res.data?.round) ?? 0, balance: num(res.data?.balance) } } : res;
}

export interface CashoutAnswer {
  multiplier: number;
  payout: number;
  balance: number | null;
}
export async function cashOut(round: number): Promise<RpcResult<CashoutAnswer>> {
  const res = await rpc<Record<string, unknown>>('crash_cashout', { p_round: round });
  return res.ok ? { ok: true, data: { multiplier: num(res.data?.multiplier) ?? 0, payout: num(res.data?.payout) ?? 0, balance: num(res.data?.balance) } } : res;
}

export async function myBets(): Promise<MyCrashBet[]> {
  const res = await rpc<unknown>('crash_my_bets');
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data.map((b: Record<string, unknown>) => ({
    round: num(b.round) ?? 0,
    amount: num(b.amount) ?? 0,
    status: status(b.status),
    cashout: num(b.cashout),
    payout: num(b.payout),
    crash: num(b.crash),
    at: typeof b.at === 'string' ? b.at : '',
  }));
}

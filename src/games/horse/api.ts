// Calls to the HORSE RACING database functions. Watching needs no account; betting goes as the signed-in player,
// and the database checks who that is and what they may do.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';
import { onlineConfig } from '@/games/online/client';

export type HorseBetStatus = 'placed' | 'won' | 'lost';

export interface Runner {
  horse: number;
  /** Hundredths (450 = 4.50×). */
  odds: number;
}

export interface RacePath {
  horse: number;
  /** ms since the start at each eighth of the distance; the last one is the finishing time. */
  cp: number[];
}

export interface HorseBetRow {
  name: string;
  horse: number;
  amount: number;
  odds: number;
  status: HorseBetStatus;
  payout: number | null;
  me: boolean;
}

export interface HorseState {
  now: number;
  enabled: boolean;
  race: {
    id: number;
    hash: string;
    rtp: number;
    minBet: number;
    maxBet: number;
    startsAt: number;
    runners: Runner[];
    started: boolean;
    finished: boolean;
    paths: RacePath[] | null;
    finishAt: number | null;
    order: number[] | null;
    seed: string | null;
  };
  bets: HorseBetRow[];
  players: number;
  mine: { horse: number; amount: number; odds: number; status: HorseBetStatus; payout: number | null } | null;
  balance: number | null;
  history: { id: number; horse: number; odds: number }[];
}

export interface MyHorseBet {
  race: number;
  horse: number;
  amount: number;
  odds: number;
  status: HorseBetStatus;
  payout: number | null;
  winner: number | null;
  at: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const time = (v: unknown): number | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);
const status = (v: unknown): HorseBetStatus => (v === 'won' || v === 'lost' ? v : 'placed');
const horseNo = (v: unknown) => {
  const n = num(v);
  return n !== null && n >= 1 && n <= 8 ? Math.round(n) : null;
};

/** Validates the server's answer (anything malformed is refused rather than drawn). */
export function parseHorseState(raw: unknown): HorseState | null {
  const s = raw as Record<string, unknown> | null;
  const r = (s?.race ?? null) as Record<string, unknown> | null;
  const now = time(s?.now);
  const id = num(r?.id);
  const startsAt = time(r?.startsAt);
  if (!s || !r || now === null || id === null || startsAt === null || typeof r.hash !== 'string' || !Array.isArray(r.runners)) return null;
  const runners: Runner[] = [];
  for (const x of r.runners as Record<string, unknown>[]) {
    const horse = horseNo(x?.horse);
    const odds = num(x?.odds);
    if (horse === null || odds === null) return null;
    runners.push({ horse, odds });
  }
  if (runners.length < 2) return null;
  let paths: RacePath[] | null = null;
  if (Array.isArray(r.paths)) {
    paths = [];
    for (const p of r.paths as Record<string, unknown>[]) {
      const horse = horseNo(p?.horse);
      const cp = Array.isArray(p?.cp) ? (p.cp as unknown[]).map(num) : [];
      if (horse === null || cp.length !== 8 || cp.some((v) => v === null)) return null;
      paths.push({ horse, cp: cp as number[] });
    }
  }
  const order = Array.isArray(r.order) ? (r.order as unknown[]).map(horseNo).filter((h): h is number => h !== null) : null;
  const mine = s.mine as Record<string, unknown> | null;
  const mineHorse = mine ? horseNo(mine.horse) : null;
  return {
    now,
    enabled: s.enabled !== false,
    race: {
      id,
      hash: r.hash,
      rtp: num(r.rtp) ?? 9600,
      minBet: num(r.minBet) ?? 10,
      maxBet: num(r.maxBet) ?? 100000,
      startsAt,
      runners,
      started: r.started === true,
      finished: r.finished === true,
      paths,
      finishAt: time(r.finishAt),
      order,
      seed: typeof r.seed === 'string' ? r.seed : null,
    },
    bets: (Array.isArray(s.bets) ? s.bets : []).map((b: Record<string, unknown>) => ({
      name: typeof b.name === 'string' ? b.name : '***',
      horse: horseNo(b.horse) ?? 1,
      amount: num(b.amount) ?? 0,
      odds: num(b.odds) ?? 100,
      status: status(b.status),
      payout: num(b.payout),
      me: b.me === true,
    })),
    players: num(s.players) ?? 0,
    mine: mine && mineHorse !== null ? { horse: mineHorse, amount: num(mine.amount) ?? 0, odds: num(mine.odds) ?? 100, status: status(mine.status), payout: num(mine.payout) } : null,
    balance: num(s.balance),
    history: (Array.isArray(s.history) ? s.history : [])
      .map((h: Record<string, unknown>) => ({ id: num(h.id) ?? 0, horse: horseNo(h.horse) ?? 0, odds: num(h.odds) ?? 0 }))
      .filter((h) => h.horse > 0),
  };
}

/** The state, as the signed-in player (their own bet included) or, without an account, as a viewer. */
export async function fetchHorseState(signedIn: boolean, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<RpcResult<HorseState>> {
  let res: RpcResult<unknown>;
  if (signedIn) {
    res = await rpc<unknown>('horse_state', {}, onlineConfig(), fetchImpl);
  } else {
    const cfg = onlineConfig();
    if (!cfg) return { ok: false, code: 'server', detail: 'no server' };
    try {
      const r = await fetchImpl(`${cfg.base}/rest/v1/rpc/horse_state`, {
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
  const state = parseHorseState(res.data);
  return state ? { ok: true, data: state } : { ok: false, code: 'server', detail: 'bad state' };
}

export async function placeHorseBet(requestId: string, horse: number, amount: number): Promise<RpcResult<{ race: number; balance: number | null }>> {
  const res = await rpc<Record<string, unknown>>('horse_bet', { p_request: requestId, p_horse: horse, p_amount: amount });
  return res.ok ? { ok: true, data: { race: num(res.data?.race) ?? 0, balance: num(res.data?.balance) } } : res;
}

export async function myHorseBets(): Promise<MyHorseBet[]> {
  const res = await rpc<unknown>('horse_my_bets');
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data.map((b: Record<string, unknown>) => ({
    race: num(b.race) ?? 0,
    horse: horseNo(b.horse) ?? 1,
    amount: num(b.amount) ?? 0,
    odds: num(b.odds) ?? 100,
    status: status(b.status),
    payout: num(b.payout),
    winner: horseNo(b.winner),
    at: typeof b.at === 'string' ? b.at : '',
  }));
}

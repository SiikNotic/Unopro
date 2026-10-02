// The two live cards of the home screen: the weekly Discord giveaway (giveaway_home / giveaway_enter /
// giveaway_ack_win) and the daily streak (daily_reward_status / daily_reward_claim). Every rule — who may
// enter, who won, how much a day pays, once a day — is decided by the database; this file only reads and
// carries requests, and turns the answers into typed values.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';

export interface GiveawayHome {
  active: { prizeCoins: number; endsAt: string; entries: number } | null;
  last: { prizeCoins: number; endedAt: string; winner: string | null } | null;
  me: { registered: boolean; linked: boolean; entered: boolean } | null;
  win: { id: string; prizeCoins: number; awardedAt: string } | null;
  inviteUrl: string | null;
}

export interface DailyStatus {
  registered: boolean;
  claimedToday: boolean;
  streak: number;
  nextDay: number;
  todayAmount: number | null;
  nextAmount: number;
  nextClaimAt: string | null;
  amounts: number[];
}

export interface DailyClaim {
  amount: number;
  streak: number;
  balance: number;
  nextAmount: number;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const bool = (v: unknown) => v === true;
/** Only a Discord invite link is ever opened from the app. */
const INVITE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}$/;

export function parseGiveawayHome(raw: unknown): GiveawayHome {
  const r = obj(raw) ?? {};
  const a = obj(r.active);
  const l = obj(r.last);
  const m = obj(r.me);
  const w = obj(r.win);
  const invite = str(r.inviteUrl);
  return {
    active: a && str(a.endsAt) ? { prizeCoins: num(a.prizeCoins), endsAt: str(a.endsAt)!, entries: num(a.entries) } : null,
    last: l ? { prizeCoins: num(l.prizeCoins), endedAt: str(l.endedAt) ?? '', winner: str(l.winner) } : null,
    me: m ? { registered: bool(m.registered), linked: bool(m.linked), entered: bool(m.entered) } : null,
    win: w && str(w.id) ? { id: str(w.id)!, prizeCoins: num(w.prizeCoins), awardedAt: str(w.awardedAt) ?? '' } : null,
    inviteUrl: invite && INVITE.test(invite) ? invite : null,
  };
}

export function parseDailyStatus(raw: unknown): DailyStatus {
  const r = obj(raw) ?? {};
  const amounts = Array.isArray(r.amounts) ? r.amounts.map((x) => num(x)).filter((x) => x > 0) : [];
  return {
    registered: bool(r.registered),
    claimedToday: bool(r.claimedToday),
    streak: num(r.streak),
    nextDay: Math.max(1, num(r.nextDay, 1)),
    todayAmount: r.todayAmount === null || r.todayAmount === undefined ? null : num(r.todayAmount),
    nextAmount: num(r.nextAmount),
    nextClaimAt: str(r.nextClaimAt),
    amounts,
  };
}

export function parseDailyClaim(raw: unknown): DailyClaim {
  const r = obj(raw) ?? {};
  return { amount: num(r.amount), streak: num(r.streak), balance: num(r.balance), nextAmount: num(r.nextAmount) };
}

const map = <T,>(res: RpcResult<unknown>, parse: (v: unknown) => T): RpcResult<T> => (res.ok ? { ok: true, data: parse(res.data) } : res);

export const giveawayHome = async (): Promise<RpcResult<GiveawayHome>> => map(await rpc<unknown>('giveaway_home'), parseGiveawayHome);
export const giveawayEnter = async (): Promise<RpcResult<{ ok: boolean; reason: string | null; entries: number }>> =>
  map(await rpc<unknown>('giveaway_enter'), (v) => {
    const r = obj(v) ?? {};
    return { ok: bool(r.ok), reason: str(r.reason), entries: num(r.entries) };
  });
export const giveawayAckWin = async (id: string) => rpc<boolean>('giveaway_ack_win', { p_giveaway_id: id });
export const dailyStatus = async (): Promise<RpcResult<DailyStatus>> => map(await rpc<unknown>('daily_reward_status'), parseDailyStatus);
export const dailyClaim = async (requestId: string): Promise<RpcResult<DailyClaim>> => map(await rpc<unknown>('daily_reward_claim', { p_request: requestId }), parseDailyClaim);

/** "3 d 4 h", "5 h 12 min", "8 min" until a moment (never negative). */
export function remaining(untilIso: string, now = Date.now()): { d: number; h: number; m: number } {
  const ms = Math.max(0, Date.parse(untilIso) - now) || 0;
  const totalMin = Math.floor(ms / 60000);
  return { d: Math.floor(totalMin / 1440), h: Math.floor((totalMin % 1440) / 60), m: totalMin % 60 };
}

// The staff tools, as calls to the database functions. Each function checks the caller's role on the
// server and refuses with "access denied" otherwise; nothing here grants anything.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';
import { newId } from '@/casino/random';
import type { Role } from '@/account/accountContext';
import { onlineConfig } from '@/games/online/client';
import { fetchAvailability } from '@/games/availability';
import type { Availability, ControlledGame } from '@/games/availability';

export interface Overview {
  registered: number;
  guests: number;
  online: number;
  active24h: number;
  coins: number;
  banned: number;
  rounds24h: number;
  staked24h: number;
  paid24h: number;
  adminNet24h: number;
  loans24h?: number;
  adRewards24h?: number;
  bankPaid24h?: number;
  /** Per coin game, last 24 h: bets, coins staked (refunds subtracted) and paid. */
  byGame24h?: Record<string, { rounds: number; staked: number; paid: number }>;
  at: string;
}

/** A Bank grant (loan or ad reward) or a rejected ad event. Read-only: corrections are coin adjustments. */
export interface BankActivityRow {
  kind: 'loan' | 'ad_reward';
  id: number;
  user_id: string;
  username: string | null;
  amount: number;
  status: 'granted' | 'rejected';
  reason: string | null;
  at: string;
  reference: string;
}

export interface StaffUser {
  user_id: string;
  username: string | null;
  email: string | null;
  role: Role;
  balance: number;
  created_at: string;
  last_seen_at: string | null;
  last_sign_in_at: string | null;
  provider: string;
  banned: boolean;
  ban_expires_at: string | null;
}

export interface LedgerRow {
  id: number;
  game: string;
  stake: number;
  payout: number;
  balance_after: number;
  created_at: string;
  reason: string | null;
}

export interface BanRow {
  id: number;
  user_id: string;
  username?: string | null;
  reason: string;
  kind: 'temporary' | 'permanent';
  expires_at: string | null;
  created_at: string;
  banned_by: string;
  banned_by_username?: string | null;
  lifted_at: string | null;
  lifted_by?: string | null;
  lifted_by_username?: string | null;
  lift_reason: string | null;
  active?: boolean;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string;
  actor_role: string;
  actor_username?: string | null;
  target_id: string | null;
  target_username?: string | null;
  action: 'ADD_COINS' | 'REMOVE_COINS' | 'BAN' | 'UNBAN' | 'USERNAME_CHANGE' | 'ROLE_CHANGE' | 'GUEST_MIGRATION' | 'GAME_AVAILABILITY' | 'HORSE_CONFIG';
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface UserDetail {
  userId: string;
  email: string | null;
  provider: string;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  username: string | null;
  role: Role;
  lastSeenAt: string | null;
  balance: number;
  bonusAt: string | null;
  migration: { guest_id: string | null; reported: number; credited: number; created_at: string } | null;
  ban: BanRow | null;
  rounds: number;
  ledger: LedgerRow[];
  bans: BanRow[];
  audit: AuditRow[];
}

/** Horse Racing: configuration (RTP in basis points, bet limits) and reports. */
export interface HorseConfig {
  rtp: number;
  minBet: number;
  maxBet: number;
  updatedAt: string;
  updatedBy: string | null;
  enabled: boolean;
}
export interface HorseStats {
  days: number;
  races: number;
  bets: number;
  players: number;
  staked: number;
  paid: number;
  net: number;
  rtpRealized: number | null;
  byHorse: { horse: number; wins: number; runs: number; bets: number; staked: number; paid: number }[];
  config: HorseConfig;
}
export interface HorseRaceRow {
  id: number;
  createdAt: string;
  startsAt: string;
  finishAt: string;
  finished: boolean;
  settled: boolean;
  rtp: number;
  runners: number;
  winner: number | null;
  bets: number;
  staked: number;
  paid: number;
}
export interface HorseStaffBet {
  id: string;
  race: number;
  userId: string;
  username: string | null;
  horse: number;
  amount: number;
  odds: number;
  status: 'placed' | 'won' | 'lost';
  payout: number | null;
  at: string;
}
export interface HorseRaceDetail {
  id: number;
  hash: string;
  rtp: number;
  minBet: number;
  maxBet: number;
  runners: { horse: number; odds: number }[];
  createdAt: string;
  startsAt: string;
  finishAt: string;
  settledAt: string | null;
  order: number[] | null;
  seed: string | null;
  bets: Omit<HorseStaffBet, 'race'>[];
}

const num = (x: unknown) => Number(x ?? 0);

export const staffApi = {
  overview: () => rpc<Overview>('staff_overview'),
  users: (query: string, order: 'recent' | 'balance' = 'recent', limit = 100, offset = 0) =>
    rpc<StaffUser[]>('staff_users', { p_query: query, p_limit: limit, p_offset: offset, p_order: order }).then((r) =>
      r.ok ? { ...r, data: r.data.map((u) => ({ ...u, balance: num(u.balance) })) } : r
    ),
  detail: (userId: string) => rpc<UserDetail>('staff_user_detail', { p_user: userId }),
  audit: (limit = 100, before: number | null = null) => rpc<AuditRow[]>('staff_audit', { p_limit: limit, p_before: before }),
  bank: (limit = 100) => rpc<BankActivityRow[]>('staff_bank_activity', { p_limit: limit }).then((r) => (r.ok ? { ...r, data: r.data.map((b) => ({ ...b, amount: num(b.amount) })) } : r)),
  bans: (activeOnly: boolean) => rpc<BanRow[]>('staff_bans', { p_active_only: activeOnly }),
  /** `requestId` makes a retried submit a replay instead of a second adjustment. */
  adjustCoins: (target: string, amount: number, reason: string, requestId: string = newId()) =>
    rpc<{ balance_before: number; balance_after: number; replayed: boolean }[]>('staff_adjust_coins', { p_target: target, p_amount: amount, p_reason: reason, p_request: requestId }),
  ban: (target: string, reason: string, hours: number | null) => rpc<number>('staff_ban', { p_target: target, p_reason: reason, p_hours: hours }),
  unban: (target: string, reason: string) => rpc<null>('staff_unban', { p_target: target, p_reason: reason }),
  setRole: (target: string, role: Exclude<Role, 'owner'>, reason: string) => rpc<null>('owner_set_role', { p_target: target, p_role: role, p_reason: reason }),
  /** Which games are in service (public table). */
  games: async (): Promise<RpcResult<Availability>> => {
    const cfg = onlineConfig();
    const a = cfg ? await fetchAvailability(cfg) : null;
    return a ? { ok: true, data: a } : { ok: false, code: 'network', detail: '' };
  },
  /** Owner only: the database checks the caller's role and records the change in the audit log. */
  setGame: (game: ControlledGame, enabled: boolean, reason: string) => rpc<null>('owner_set_game_enabled', { p_game: game, p_enabled: enabled, p_reason: reason }),
  horseStats: (days: number) => rpc<HorseStats>('staff_horse_stats', { p_days: days }),
  horseRaces: (limit = 50, before: number | null = null) => rpc<HorseRaceRow[]>('staff_horse_races', { p_limit: limit, p_before: before }),
  horseRace: (id: number) => rpc<HorseRaceDetail>('staff_horse_race', { p_id: id }),
  horseBets: (limit = 100) => rpc<HorseStaffBet[]>('staff_horse_bets', { p_limit: limit }),
  /** Admin or owner: the database checks the role and records the change in the audit log. */
  setHorseConfig: (rtpBp: number, minBet: number, maxBet: number, reason: string) =>
    rpc<HorseConfig>('admin_set_horse_config', { p_rtp_bp: rtpBp, p_min_bet: minBet, p_max_bet: maxBet, p_reason: reason }),
};

export type { RpcResult };

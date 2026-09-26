// CasinoStore over Supabase's REST gateway: the security-definer functions of the accounts migration,
// called with the service role key (server side only; never shipped to the browser).
import { CasinoStoreError } from '../../../src/casino/server/handler.ts';
import type { Booking, CasinoStore, InstantGame } from '../../../src/casino/server/handler.ts';
import type { BlackjackState } from '../../../src/casino/blackjack.ts';

interface LedgerRow {
  request_id: string;
  game: Booking['game'];
  stake: number | string;
  payout: number | string;
  balance: number | string;
  detail: Record<string, unknown>;
  created_at: string;
  replayed?: boolean;
}

const toBooking = (r: LedgerRow): Booking => ({
  requestId: r.request_id,
  game: r.game,
  stake: Number(r.stake),
  payout: Number(r.payout),
  balance: Number(r.balance),
  detail: r.detail ?? {},
  at: Date.parse(r.created_at),
});

export function postgrestCasinoStore(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): CasinoStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body as { code?: string } | null)?.code;
      if (code === 'P0402') throw new CasinoStoreError('insufficient_funds');
      if (code === 'P0409') throw new CasinoStoreError('conflict');
      if (code === 'P0400') throw new CasinoStoreError('invalid_bet');
      if (code === 'P0403') throw new CasinoStoreError('not_registered');
      if (code === 'P0423') throw new CasinoStoreError('game_disabled');
      throw new Error(`rpc ${fn} failed: ${res.status}`);
    }
    return body as T;
  }
  return {
    async account(userId) {
      const rows = await rpc<{ balance: number | string; bonus_claimed: boolean; registered: boolean }[]>('account_wallet', { p_user: userId });
      const r = rows[0];
      return { balance: Number(r?.balance ?? 0), bonusClaimed: !!r?.bonus_claimed, registered: !!r?.registered };
    },
    async claimBonus(userId, requestId) {
      const rows = await rpc<{ balance: number | string; granted: boolean }[]>('account_claim_bonus', { p_user: userId, p_request: requestId });
      return { balance: Number(rows[0].balance), granted: rows[0].granted };
    },
    async play(c: { userId: string; requestId: string; game: InstantGame; stake: number; payout: number; detail: Record<string, unknown> }) {
      const rows = await rpc<LedgerRow[]>('account_play', { p_user: c.userId, p_request: c.requestId, p_game: c.game, p_stake: c.stake, p_payout: c.payout, p_detail: c.detail });
      if (!rows?.length) throw new Error('empty booking');
      return { ...toBooking(rows[0]), replayed: !!rows[0].replayed };
    },
    async find(userId, requestId) {
      const rows = await rpc<LedgerRow[]>('account_find', { p_user: userId, p_request: requestId });
      return rows?.length ? toBooking(rows[0]) : null;
    },
    async bjLoad(userId) {
      const row = await rpc<{ request_id: string; stake: number | string; state: BlackjackState; version: number } | null>('bj_load', { p_user: userId });
      return row ? { requestId: row.request_id, stake: Number(row.stake), state: row.state, version: row.version } : null;
    },
    async bjOpen(userId, requestId, stake, state) {
      return Number(await rpc<number | string>('bj_open', { p_user: userId, p_request: requestId, p_stake: stake, p_state: state }));
    },
    async bjStep(userId, requestId, version, extra, state, payout, detail) {
      return Number(
        await rpc<number | string>('bj_step', { p_user: userId, p_request: requestId, p_version: version, p_extra: extra, p_state: state, p_payout: payout, p_detail: detail })
      );
    },
  };
}

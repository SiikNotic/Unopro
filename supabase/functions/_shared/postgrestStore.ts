// SlotStore over Supabase's REST gateway, calling the security-definer functions of the migration with
// the service role key (server side only; never shipped to the browser).
import { StoreError } from './slotHandler.ts';
import type { Receipt, SlotStore } from './slotHandler.ts';
import type { MachineId, RoundDraws } from '../../../src/casino/premium/engine.ts';

interface Row {
  request_id: string;
  machine: MachineId;
  bet: number;
  draws: RoundDraws;
  payout: number | string;
  balance: number | string;
  created_at: string;
}

const toReceipt = (r: Row): Receipt => ({
  requestId: r.request_id,
  machine: r.machine,
  bet: r.bet,
  draws: r.draws,
  payout: Number(r.payout),
  balance: Number(r.balance),
  at: Date.parse(r.created_at),
});

export function postgrestStore(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): SlotStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body as { code?: string } | null)?.code;
      if (code === 'P0402') throw new StoreError('insufficient_funds');
      if (code === 'P0409') throw new StoreError('conflict');
      if (code === 'P0400') throw new StoreError('invalid_bet');
      throw new Error(`rpc ${fn} failed: ${res.status}`);
    }
    return body as T;
  }
  return {
    async commit(c) {
      const rows = await rpc<Row[]>('slot_commit', { p_user: c.userId, p_request: c.requestId, p_machine: c.machine, p_bet: c.bet, p_draws: c.draws, p_payout: c.payout });
      if (!rows?.length) throw new Error('empty commit');
      return toReceipt(rows[0]);
    },
    async find(userId, requestId) {
      const rows = await rpc<Row[]>('slot_find', { p_user: userId, p_request: requestId });
      return rows?.length ? toReceipt(rows[0]) : null;
    },
    async balance(userId) {
      return Number(await rpc<number | string>('slot_balance', { p_user: userId }));
    },
  };
}

// The Bank's calls to the database. Each function checks, in the database, who is calling and whether
// they may claim; the browser only carries the request.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';
import type { BankStatus } from './bankLogic';

export interface LoanGrant {
  balance: number;
  amount: number;
  availableAt: string;
  replayed: boolean;
}

export async function fetchBankStatus(call: typeof rpc = rpc): Promise<RpcResult<BankStatus>> {
  const res = await call<BankStatus>('bank_status');
  if (!res.ok) return res;
  const s = res.data;
  return {
    ok: true,
    data: {
      ...s,
      loanAmount: Number(s.loanAmount),
      loanCooldownHours: Number(s.loanCooldownHours),
      adAmount: Number(s.adAmount),
      adDailyCap: Number(s.adDailyCap),
      adToday: Number(s.adToday),
      history: (s.history ?? []).map((h) => ({ ...h, id: Number(h.id), amount: Number(h.amount) })),
    },
  };
}

/** Claims the loan. Reusing `requestId` after a lost answer returns the same loan instead of a second one. */
export async function claimLoan(requestId: string, call: typeof rpc = rpc): Promise<RpcResult<LoanGrant>> {
  const res = await call<{ balance: number; amount: number; available_at: string; replayed: boolean }[]>('bank_claim_loan', { p_request: requestId });
  if (!res.ok) return res;
  const row = res.data?.[0];
  if (!row) return { ok: false, code: 'server', detail: 'empty' };
  return { ok: true, data: { balance: Number(row.balance), amount: Number(row.amount), availableAt: row.available_at, replayed: !!row.replayed } };
}

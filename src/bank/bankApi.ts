// The Bank's calls to the database. Each function checks, in the database, who is calling and whether
// they may claim; the browser only carries the request.
import { rpc } from '@/account/rpc';
import type { RpcResult } from '@/account/rpc';
import type { BankHistoryItem, BankStatus } from './bankLogic';

export interface LoanGrant {
  balance: number;
  amount: number;
  availableAt: string;
  replayed: boolean;
}

export interface RepayResult {
  balance: number;
  amount: number;
  replayed: boolean;
}

const HISTORY_KINDS = ['loan', 'loan_repay', 'ad_reward', 'ad_rejected'];

/** Reads the Bank as the server sees it. Numbers arrive as JSON numbers or strings (bigint); both are accepted. */
export async function fetchBankStatus(call: typeof rpc = rpc): Promise<RpcResult<BankStatus>> {
  const res = await call<Partial<BankStatus> & Record<string, unknown>>('bank_status');
  if (!res.ok) return res;
  const s = res.data ?? {};
  const loan = s.loan
    ? { ...s.loan, id: Number(s.loan.id ?? 0), amount: Number(s.loan.amount ?? s.loanAmount ?? 0), status: s.loan.status ?? 'settled', repaidAt: s.loan.repaidAt ?? null }
    : null;
  const history: BankHistoryItem[] = (Array.isArray(s.history) ? s.history : [])
    .filter((h) => HISTORY_KINDS.includes(h.kind))
    .map((h) => ({ ...h, id: Number(h.id), amount: Number(h.amount), status: h.status ?? 'done', availableAt: h.availableAt ?? null }));
  const ads = history.filter((h) => h.kind === 'ad_reward').map((h) => h.id);
  return {
    ok: true,
    data: {
      serverNow: String(s.serverNow ?? new Date(0).toISOString()),
      registered: !!s.registered,
      banned: !!s.banned,
      balance: Number(s.balance ?? 0),
      loanAmount: Number(s.loanAmount ?? 0),
      loanCooldownHours: Number(s.loanCooldownHours ?? 24),
      loanMaxBalance: Number(s.loanMaxBalance ?? Number.MAX_SAFE_INTEGER),
      loanRequiresRepayment: !!s.loanRequiresRepayment,
      loanEligibility: s.loanEligibility ?? 'ok',
      adAmount: Number(s.adAmount ?? 0),
      adDailyCap: Number(s.adDailyCap ?? 0),
      adToday: Number(s.adToday ?? 0),
      lastAdRewardId: s.lastAdRewardId !== undefined && s.lastAdRewardId !== null ? Number(s.lastAdRewardId) : ads.length ? Math.max(...ads) : null,
      loan,
      history,
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

/** Pays the open loan back from the balance. Reusing `requestId` after a lost answer never charges twice. */
export async function repayLoan(requestId: string, call: typeof rpc = rpc): Promise<RpcResult<RepayResult>> {
  const res = await call<{ balance: number; amount: number; replayed: boolean }[]>('bank_repay_loan', { p_request: requestId });
  if (!res.ok) return res;
  const row = res.data?.[0];
  if (!row) return { ok: false, code: 'server', detail: 'empty' };
  return { ok: true, data: { balance: Number(row.balance), amount: Number(row.amount), replayed: !!row.replayed } };
}

// The Bank, second version, on the client: the loan card never offers what the server would refuse, the
// repayment carries an idempotency key, a reward shows only when the SERVER's reward id grows (also after a
// refresh), and errors (network, not signed in, refused) never change the balance on their own.
import { describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import { rpc } from '@/account/rpc';
import { runAdFlow } from '../adFlow';
import type { RewardedAdOutcome, RewardedAdsProvider } from '../ads';
import { claimLoan, fetchBankStatus, repayLoan } from '../bankApi';
import { adRewardArrived, clearPendingAd, loanView, openLoan, readPendingAd, savePendingAd } from '../bankLogic';
import type { BankStatus } from '../bankLogic';

vi.mock('@/games/online/client', () => ({ onlineConfig: () => ({ base: 'https://db.test', apiKey: 'pk' }), tokenFor: vi.fn(async () => 'tok') }));

const base: BankStatus = {
  serverNow: '2026-10-01T12:00:00Z',
  registered: true,
  banned: false,
  balance: 0,
  loanAmount: 1000,
  loanCooldownHours: 24,
  loanMaxBalance: 500,
  loanRequiresRepayment: true,
  loanEligibility: 'ok',
  adAmount: 500,
  adDailyCap: 20,
  adToday: 0,
  lastAdRewardId: null,
  loan: null,
  history: [],
};
const loan = (status: 'outstanding' | 'repaid' | 'settled') => ({ id: 1, amount: 1000, claimedAt: '2026-10-01T10:00:00Z', availableAt: '2026-10-02T10:00:00Z', status, repaidAt: status === 'repaid' ? '2026-10-01T11:00:00Z' : null });

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('loan card state (what the button offers)', () => {
  it('offers the loan only when the server would grant it', () => {
    expect(loanView(base, 0)).toBe('available');
    expect(loanView({ ...base, loanEligibility: 'balance' }, 0)).toBe('balance');
    expect(loanView(null, 0)).toBe('locked');
    expect(loanView({ ...base, registered: false }, 0)).toBe('locked');
    expect(loanView({ ...base, banned: true }, 0)).toBe('locked');
  });

  it('an open loan must be paid back first; a running cooldown shows the countdown', () => {
    const owing = { ...base, loan: loan('outstanding'), loanEligibility: 'outstanding' as const };
    expect(loanView(owing, 5000)).toBe('outstanding');
    expect(openLoan(owing)?.amount).toBe(1000);
    const repaid = { ...base, loan: loan('repaid'), loanEligibility: 'cooldown' as const };
    expect(loanView(repaid, 5000)).toBe('cooldown');
    expect(openLoan(repaid)).toBeNull();
    // the cooldown ended on screen: offered again (the server re-checks on the request)
    expect(loanView(repaid, 0)).toBe('available');
  });

  it('loans that are not paid back only follow the cooldown', () => {
    const gift = { ...base, loanRequiresRepayment: false, loan: loan('settled') };
    expect(loanView(gift, 1000)).toBe('cooldown');
    expect(loanView(gift, 0)).toBe('available');
  });
});

describe('loan and repayment requests', () => {
  it('a valid repayment passes its key and returns the server balance', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: [{ balance: '200', amount: '1000', replayed: false }] }));
    expect(await repayLoan('rep-1', call as never)).toEqual({ ok: true, data: { balance: 200, amount: 1000, replayed: false } });
    expect(call).toHaveBeenCalledWith('bank_repay_loan', { p_request: 'rep-1' });
  });

  it('a double click or refresh replays the same request and is not charged twice', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: [{ balance: 200, amount: 1000, replayed: true }] }));
    const r = await repayLoan('rep-1', call as never);
    expect(r.ok && r.data.replayed).toBe(true);
  });

  it('refusals come back as errors and carry no balance', async () => {
    for (const code of ['insufficient_funds', 'not_found', 'not_registered', 'network'] as const) {
      const call = vi.fn(async () => ({ ok: false as const, code, detail: '' }));
      const r = await repayLoan('x', call as never);
      expect(r).toEqual({ ok: false, code, detail: '' });
    }
    const outstanding = vi.fn(async () => ({ ok: false as const, code: 'conflict' as const, detail: 'loan_outstanding' }));
    expect(await claimLoan('x', outstanding as never)).toMatchObject({ ok: false, code: 'conflict', detail: 'loan_outstanding' });
    const rich = vi.fn(async () => ({ ok: false as const, code: 'conflict' as const, detail: 'balance_too_high' }));
    expect(await claimLoan('x', rich as never)).toMatchObject({ ok: false, detail: 'balance_too_high' });
  });

  it('an empty answer is an error, never a grant', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: [] }));
    expect(await repayLoan('x', call as never)).toMatchObject({ ok: false, code: 'server' });
  });
});

describe('database calls (rpc)', () => {
  it('maps the database error codes the Bank uses', async () => {
    const answer = (code: string, message: string, details = '') => vi.fn(async () => new Response(JSON.stringify({ code, message, details }), { status: 400 }));
    expect(await rpc('bank_claim_loan', {}, undefined, answer('P0409', 'loan_outstanding'))).toEqual({ ok: false, code: 'conflict', detail: 'loan_outstanding' });
    expect(await rpc('bank_claim_loan', {}, undefined, answer('P0429', 'cooldown', '2026-10-02T10:00:00+00'))).toEqual({ ok: false, code: 'cooldown', detail: '2026-10-02T10:00:00+00' });
    expect(await rpc('bank_repay_loan', {}, undefined, answer('P0402', 'insufficient_funds'))).toMatchObject({ ok: false, code: 'insufficient_funds' });
    expect(await rpc('bank_repay_loan', {}, undefined, answer('P0404', 'no_open_loan'))).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('a network failure is reported as such (the retry reuses the key)', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await rpc('bank_claim_loan', { p_request: 'k' }, undefined, down)).toEqual({ ok: false, code: 'network', detail: '' });
  });

  it('without a session nothing is sent', async () => {
    const { tokenFor } = await import('@/games/online/client');
    vi.mocked(tokenFor).mockResolvedValueOnce(null);
    const f = vi.fn();
    expect(await rpc('bank_claim_loan', {}, undefined, f as never)).toEqual({ ok: false, code: 'not_registered', detail: 'no session' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('bank status (second version)', () => {
  it('reads the new fields and the history with states', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      data: {
        ...base,
        loanAmount: '1000',
        loanMaxBalance: '500',
        lastAdRewardId: '7',
        loan: { ...loan('outstanding'), id: '3', amount: '1000' },
        history: [
          { kind: 'loan_repay', id: '5', amount: '1000', at: 'a', status: 'done', availableAt: null },
          { kind: 'ad_rejected', id: '6', amount: 0, at: 'b', status: 'daily_cap', availableAt: null },
          { kind: 'mystery', id: '9', amount: 1, at: 'c' },
        ],
      },
    }));
    const r = await fetchBankStatus(call as never);
    if (!r.ok) throw new Error('status');
    expect(r.data.loanAmount).toBe(1000);
    expect(r.data.loanMaxBalance).toBe(500);
    expect(r.data.lastAdRewardId).toBe(7);
    expect(r.data.loan).toMatchObject({ id: 3, amount: 1000, status: 'outstanding' });
    expect(r.data.history.map((h) => h.kind)).toEqual(['loan_repay', 'ad_rejected']); // unknown kinds dropped
  });

  it('works with a server of the first version (no lastAdRewardId: newest ad reward in the history)', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { serverNow: 'n', registered: true, banned: false, loanAmount: 500, loanCooldownHours: 24, adAmount: 100, adDailyCap: 20, adToday: 1, loan: null, history: [{ kind: 'ad_reward', id: 4, amount: 100, at: 'a', availableAt: null }] } }));
    const r = await fetchBankStatus(call as never);
    expect(r.ok && r.data.lastAdRewardId).toBe(4);
    expect(r.ok && r.data.history[0].status).toBe('done');
  });
});

describe('ad rewards', () => {
  const provider = (status: 'completed' | 'cancelled'): RewardedAdsProvider => ({ id: 'test', isAvailable: async () => true, showRewardedAd: async (): Promise<RewardedAdOutcome> => (status === 'completed' ? { status, rewardId: null } : { status }), onReward: () => () => {} });

  it('a valid reward: shown when the server grants a new reward id', async () => {
    const ids = [3, 3, 4];
    const r = await runAdFlow({ provider: provider('completed'), userId: 'u', checkServer: async () => ids.shift() ?? 4, dispatch: () => {}, sleep: async () => {}, verifyForMs: 10_000, now: (() => { let t = 0; return () => (t += 100); })() });
    expect(r).toBe('rewarded');
  });

  it('a duplicate or invalid reward (the id never grows) pays nothing', async () => {
    let t = 0;
    const r = await runAdFlow({ provider: provider('completed'), userId: 'u', checkServer: async () => 3, dispatch: () => {}, sleep: async () => {}, verifyForMs: 1000, now: () => (t += 100) });
    expect(r).toBe('unconfirmed');
    expect(adRewardArrived(3, 3)).toBe(false);
    expect(adRewardArrived(3, 2)).toBe(false);
    expect(adRewardArrived(null, null)).toBe(false);
    expect(adRewardArrived(null, 1)).toBe(true);
  });

  it('a network error while confirming ends in an error, not a reward', async () => {
    let calls = 0;
    const r = await runAdFlow({ provider: provider('completed'), userId: 'u', checkServer: async () => (++calls > 1 ? Promise.reject(new Error('offline')) : 3), dispatch: () => {}, sleep: async () => {} });
    expect(r).toBe('failed');
  });

  it('a refresh while confirming: remembered for a few minutes in this tab, then forgotten', () => {
    const store = memoryStorage();
    savePendingAd(3, 1_000_000, store);
    expect(readPendingAd(1_000_000 + 60_000, store)).toEqual({ before: 3, at: 1_000_000 });
    expect(readPendingAd(1_000_000 + 4 * 60_000, store)).toBeNull(); // expired
    expect(store.length).toBe(0);
    savePendingAd(null, 5, store);
    expect(readPendingAd(10, store)).toEqual({ before: null, at: 5 });
    clearPendingAd(store);
    expect(readPendingAd(10, store)).toBeNull();
    store.setItem('carta.bank.adPending', '{broken');
    expect(readPendingAd(10, store)).toBeNull();
  });
});

describe('bank v2 translations', () => {
  it('has every new text in Spanish and English', () => {
    for (const d of [es, en]) {
      expect(d.bank.loan.title && d.bank.loan.repay && d.bank.loan.balanceRule && d.bank.loan.confirmTitle).toBeTruthy();
      expect(Object.keys(d.bank.kind).sort()).toEqual(['ad_rejected', 'ad_reward', 'loan', 'loan_repay']);
      expect(d.bank.errors.loan_outstanding && d.bank.errors.balance_too_high && d.bank.errors.insufficient_funds && d.bank.errors.not_found).toBeTruthy();
      expect(d.staff.ledger.loan_repay && d.staff.bank.config.title && d.staff.actions.BANK_CONFIG).toBeTruthy();
    }
    expect(es.bank.loan.title).toBe('Préstamo de emergencia');
  });
});

import { describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import { getRewardedAdsProvider, hasAdsProvider, noAdsProvider, setRewardedAdsProvider } from '../ads';
import type { RewardedAdOutcome, RewardedAdsProvider } from '../ads';
import { runAdFlow } from '../adFlow';
import { adCanStart, adReducer, cooldownProgress, formatCountdown, loanRemainingMs, serverClock } from '../bankLogic';
import type { AdEvent, AdState } from '../bankLogic';
import { claimLoan, fetchBankStatus } from '../bankApi';

vi.mock('@/games/online/client', () => ({ onlineConfig: () => null, tokenFor: async () => 'tok' }));

const H = 3600 * 1000;

describe('loan countdown (server clock)', () => {
  const clock = serverClock('2026-09-25T12:00:00.000Z', 1000);
  const availableAt = '2026-09-26T12:00:00.000Z';

  it('counts 24 h down from the server time, not the phone', () => {
    expect(loanRemainingMs(availableAt, clock, 1000)).toBe(24 * H);
    expect(loanRemainingMs(availableAt, clock, 1000 + H)).toBe(23 * H);
    expect(formatCountdown(24 * H)).toBe('24:00:00');
    expect(formatCountdown(23 * H + 59 * 60 * 1000 + 7000)).toBe('23:59:07');
    expect(formatCountdown(1)).toBe('00:00:01'); // never shows zero while still locked
  });

  it('ignores changes to the device date or time', () => {
    const realNow = Date.now;
    Date.now = () => Date.parse('2030-01-01T00:00:00Z'); // player moves the clock forward years
    try {
      expect(loanRemainingMs(availableAt, clock, 1000 + 1000)).toBe(24 * H - 1000);
    } finally {
      Date.now = realNow;
    }
  });

  it('is available once the time has passed, or with no loan', () => {
    expect(loanRemainingMs(availableAt, clock, 1000 + 25 * H)).toBe(0);
    expect(loanRemainingMs(null, clock, 1000)).toBe(0);
    expect(loanRemainingMs(availableAt, null, 1000)).toBe(0);
    // a monotonic clock never goes backwards
    expect(loanRemainingMs(availableAt, clock, 0)).toBe(24 * H);
  });

  it('draws the progress ring', () => {
    expect(cooldownProgress(24 * H, 24)).toBe(0);
    expect(cooldownProgress(12 * H, 24)).toBe(0.5);
    expect(cooldownProgress(0, 24)).toBe(1);
  });
});

describe('ad button state machine', () => {
  const run = (events: AdEvent[], from: AdState = 'CHECKING') => events.reduce(adReducer, from);

  it('reaches REWARDED only after the server confirms', () => {
    expect(run([{ type: 'availability', available: true }, { type: 'start' }, { type: 'shown' }, { type: 'completed' }])).toBe('VERIFYING');
    expect(run([{ type: 'availability', available: true }, { type: 'start' }, { type: 'shown' }, { type: 'completed' }, { type: 'confirmed' }])).toBe('REWARDED');
    expect(run([{ type: 'confirmed' }], 'AVAILABLE')).toBe('AVAILABLE');
    expect(run([{ type: 'confirmed' }], 'SHOWING_AD')).toBe('SHOWING_AD');
  });

  it('handles unavailable, cancelled, failed and unconfirmed ads', () => {
    expect(run([{ type: 'availability', available: false }])).toBe('UNAVAILABLE');
    expect(run([{ type: 'start' }], 'UNAVAILABLE')).toBe('UNAVAILABLE');
    expect(run([{ type: 'start' }, { type: 'shown' }, { type: 'cancelled' }], 'AVAILABLE')).toBe('AVAILABLE');
    expect(run([{ type: 'start' }, { type: 'failed' }], 'AVAILABLE')).toBe('ERROR');
    expect(run([{ type: 'start' }, { type: 'shown' }, { type: 'completed' }, { type: 'unconfirmed' }], 'AVAILABLE')).toBe('ERROR');
    expect(run([{ type: 'reset' }], 'ERROR')).toBe('CHECKING');
  });

  it('ignores a second press and availability changes while an ad runs', () => {
    expect(run([{ type: 'start' }, { type: 'start' }], 'AVAILABLE')).toBe('LOADING');
    expect(run([{ type: 'availability', available: false }], 'SHOWING_AD')).toBe('SHOWING_AD');
    expect(adCanStart('AVAILABLE')).toBe(true);
    for (const s of ['LOADING', 'SHOWING_AD', 'VERIFYING', 'REWARDED', 'UNAVAILABLE', 'ERROR'] as AdState[]) expect(adCanStart(s)).toBe(false);
  });
});

describe('rewarded ads adapter', () => {
  it('has no provider by default: never available, never rewards', async () => {
    expect(getRewardedAdsProvider()).toBe(noAdsProvider);
    expect(hasAdsProvider()).toBe(false);
    expect(await noAdsProvider.isAvailable()).toBe(false);
    expect(await noAdsProvider.showRewardedAd({ userId: 'u' })).toEqual({ status: 'failed', reason: 'no_provider' });
  });

  it('can register and remove a provider', () => {
    const p: RewardedAdsProvider = { id: 'test', isAvailable: async () => true, showRewardedAd: async () => ({ status: 'cancelled' }), onReward: () => () => {} };
    setRewardedAdsProvider(p);
    expect(hasAdsProvider()).toBe(true);
    setRewardedAdsProvider(null);
    expect(getRewardedAdsProvider()).toBe(noAdsProvider);
  });
});

describe('ad flow', () => {
  const provider = (outcome: RewardedAdOutcome, available = true): RewardedAdsProvider => ({
    id: 'test',
    isAvailable: async () => available,
    showRewardedAd: async () => outcome,
    onReward: () => () => {},
  });
  const fakeTime = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  };

  it('rewards only when the server shows a new reward', async () => {
    const events: AdEvent[] = [];
    const ids = [3, 3, 4];
    const time = fakeTime();
    const r = await runAdFlow({ provider: provider({ status: 'completed', rewardId: 'x' }), userId: 'u', checkServer: async () => ids.shift() ?? 4, dispatch: (e) => events.push(e), ...time });
    expect(r).toBe('rewarded');
    expect(events.map((e) => e.type)).toEqual(['start', 'shown', 'completed', 'confirmed']);
  });

  it('a "completed" ad the server never confirms pays nothing', async () => {
    const events: AdEvent[] = [];
    const r = await runAdFlow({ provider: provider({ status: 'completed', rewardId: null }), userId: 'u', checkServer: async () => 7, dispatch: (e) => events.push(e), ...fakeTime(), verifyForMs: 10000 });
    expect(r).toBe('unconfirmed');
    expect(events.at(-1)).toEqual({ type: 'unconfirmed' });
  });

  it('first reward ever (no previous id) counts', async () => {
    const ids: (number | null)[] = [null, null, 1];
    const r = await runAdFlow({ provider: provider({ status: 'completed', rewardId: null }), userId: 'u', checkServer: async () => (ids.length ? ids.shift()! : 1), dispatch: () => {}, ...fakeTime() });
    expect(r).toBe('rewarded');
  });

  it('cancelled, failed and unavailable ads give nothing', async () => {
    const check = vi.fn(async () => null);
    expect(await runAdFlow({ provider: provider({ status: 'cancelled' }), userId: 'u', checkServer: check, dispatch: () => {}, ...fakeTime() })).toBe('cancelled');
    expect(await runAdFlow({ provider: provider({ status: 'failed' }), userId: 'u', checkServer: check, dispatch: () => {}, ...fakeTime() })).toBe('failed');
    expect(await runAdFlow({ provider: provider({ status: 'completed', rewardId: null }, false), userId: 'u', checkServer: check, dispatch: () => {}, ...fakeTime() })).toBe('failed');
    expect(await runAdFlow({ provider: noAdsProvider, userId: 'u', checkServer: check, dispatch: () => {}, ...fakeTime() })).toBe('failed');
  });

  it('a throwing SDK ends in an error, not a reward', async () => {
    const p = provider({ status: 'completed', rewardId: null });
    p.showRewardedAd = async () => {
      throw new Error('sdk');
    };
    expect(await runAdFlow({ provider: p, userId: 'u', checkServer: async () => null, dispatch: () => {}, ...fakeTime() })).toBe('failed');
  });
});

describe('bank API', () => {
  it('parses the loan grant and passes the idempotency key', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: [{ balance: '1500', amount: 500, available_at: '2026-09-26T12:00:00Z', replayed: false }] }));
    const r = await claimLoan('req-1', call as never);
    expect(call).toHaveBeenCalledWith('bank_claim_loan', { p_request: 'req-1' });
    expect(r).toEqual({ ok: true, data: { balance: 1500, amount: 500, availableAt: '2026-09-26T12:00:00Z', replayed: false } });
  });

  it('passes cooldown and ban errors through', async () => {
    const cooldown = vi.fn(async () => ({ ok: false as const, code: 'cooldown' as const, detail: '2026-09-26T12:00:00Z' }));
    expect(await claimLoan('x', cooldown as never)).toMatchObject({ ok: false, code: 'cooldown' });
    const banned = vi.fn(async () => ({ ok: false as const, code: 'banned' as const, detail: '' }));
    expect(await claimLoan('x', banned as never)).toMatchObject({ ok: false, code: 'banned' });
  });

  it('normalises the status numbers', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      data: { serverNow: 'n', registered: true, banned: false, loanAmount: '500', loanCooldownHours: '24', adAmount: 100, adDailyCap: 20, adToday: '2', loan: null, history: [{ kind: 'loan', id: '9', amount: '500', at: 'a', availableAt: 'b' }] },
    }));
    const r = await fetchBankStatus(call as never);
    expect(r.ok && r.data.loanAmount).toBe(500);
    expect(r.ok && r.data.adToday).toBe(2);
    expect(r.ok && r.data.history[0].id).toBe(9);
  });
});

describe('bank translations', () => {
  const keys = (o: unknown, p = ''): string[] =>
    o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];
  it('Spanish and English have the same Bank keys', () => {
    expect(keys(es.bank).sort()).toEqual(keys(en.bank).sort());
    expect(keys(es.staff.bank).sort()).toEqual(keys(en.staff.bank).sort());
    expect(es.bank.ad.unavailable).toBe('Publicidad no disponible');
    expect(es.bank.guestTitle).toBe('Crea una cuenta para recibir monedas');
    expect(es.staff.ledger.loan && en.staff.ledger.ad_reward).toBeTruthy();
  });
});

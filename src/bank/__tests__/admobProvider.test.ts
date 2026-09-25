import { describe, expect, it, vi } from 'vitest';
import { ADMOB_TEST_REWARDED_ID, createAdMobProvider } from '../admobProvider';

type Listener = (arg?: unknown) => void;
function fakeAdMob(opts: { loadFails?: boolean; consentFails?: boolean; consent?: 'REQUIRED' | 'OBTAINED'; canRequestAds?: boolean; behaviour?: 'reward' | 'close' | 'showFails' } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (e: string, a?: unknown) => listeners.get(e)?.forEach((l) => l(a));
  const AdMob = {
    initialize: vi.fn(async () => {}),
    requestConsentInfo: vi.fn(async () => {
      if (opts.consentFails) throw new Error('Publisher misconfiguration');
      return { status: opts.consent ?? 'OBTAINED', isConsentFormAvailable: true, canRequestAds: opts.canRequestAds ?? true };
    }),
    showConsentForm: vi.fn(async () => ({ status: 'OBTAINED', isConsentFormAvailable: true, canRequestAds: true })),
    prepareRewardVideoAd: vi.fn(async () => {
      if (opts.loadFails) throw new Error('No fill');
      return { adUnitId: 'x' };
    }),
    showRewardVideoAd: vi.fn(async () => {
      setTimeout(() => {
        if (opts.behaviour === 'showFails') return emit('onRewardedVideoAdFailedToShow', { code: 1 });
        if (opts.behaviour !== 'close') emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });
        emit('onRewardedVideoAdDismissed');
      }, 5);
      // Like the native plugin: resolves only when the reward is earned, otherwise stays pending.
      if (opts.behaviour === 'close' || opts.behaviour === 'showFails') return new Promise(() => {});
      return { type: 'coins', amount: 1 };
    }),
    addListener: vi.fn(async (e: string, l: Listener) => {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e)!.add(l);
      return { remove: async () => void listeners.get(e)!.delete(l) };
    }),
  };
  const module = {
    AdMob,
    RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward', Dismissed: 'onRewardedVideoAdDismissed', FailedToShow: 'onRewardedVideoAdFailedToShow' },
    AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  };
  return { module: module as never, AdMob, listeners };
}

describe('AdMob adapter', () => {
  it('passes the player id for server-side verification and reports a completed ad', async () => {
    const f = fakeAdMob();
    const p = createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: f.module });
    expect(await p.isAvailable()).toBe(true);
    const out = await p.showRewardedAd({ userId: 'u-1' });
    expect(out).toEqual({ status: 'completed', rewardId: null });
    expect(f.AdMob.prepareRewardVideoAd).toHaveBeenCalledWith({ adId: 'ca-app-pub-1/2', isTesting: false, ssv: { userId: 'u-1', customData: 'u-1' } });
    expect(f.AdMob.initialize).toHaveBeenCalledWith({ initializeForTesting: false });
    // listeners are cleaned up
    expect([...f.listeners.values()].every((s) => s.size === 0)).toBe(true);
  });

  it('closing early is a cancel; a failed show is a failure', async () => {
    expect(await createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: fakeAdMob({ behaviour: 'close' }).module }).showRewardedAd({ userId: 'u' })).toEqual({ status: 'cancelled' });
    expect(await createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: fakeAdMob({ behaviour: 'showFails' }).module }).showRewardedAd({ userId: 'u' })).toMatchObject({ status: 'failed' });
  });

  it('no fill: fails and reports unavailable for a minute', async () => {
    let t = 0;
    const p = createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: fakeAdMob({ loadFails: true }).module, now: () => t });
    expect(await p.showRewardedAd({ userId: 'u' })).toEqual({ status: 'failed', reason: 'no_fill' });
    expect(await p.isAvailable()).toBe(false);
    t = 61_000;
    expect(await p.isAvailable()).toBe(true);
  });

  it('asks for consent where required and requests no ads without it', async () => {
    const f = fakeAdMob({ consent: 'REQUIRED' });
    expect(await createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: f.module }).isAvailable()).toBe(true);
    expect(f.AdMob.showConsentForm).toHaveBeenCalled();
    const denied = fakeAdMob({ canRequestAds: false });
    const p = createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: denied.module });
    expect(await p.isAvailable()).toBe(false);
    expect(await p.showRewardedAd({ userId: 'u' })).toMatchObject({ status: 'failed' });
    expect(denied.AdMob.prepareRewardVideoAd).not.toHaveBeenCalled();
  });

  it('a failing consent check (no privacy message yet) does not block ads, and the reason is kept', async () => {
    const { getAdsIssue } = await import('../ads');
    const p = createAdMobProvider({ adUnitId: 'ca-app-pub-1/2', admob: fakeAdMob({ consentFails: true }).module });
    expect(await p.isAvailable()).toBe(true);
    expect(getAdsIssue()).toBe('consent: Publisher misconfiguration');
    expect(await p.showRewardedAd({ userId: 'u' })).toEqual({ status: 'completed', rewardId: null });
    expect(getAdsIssue()).toBeNull();
  });

  it("Google's test unit runs in test mode", async () => {
    const f = fakeAdMob();
    await createAdMobProvider({ adUnitId: ADMOB_TEST_REWARDED_ID, admob: f.module }).showRewardedAd({ userId: 'u' });
    expect(f.AdMob.initialize).toHaveBeenCalledWith({ initializeForTesting: true });
    expect(f.AdMob.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({ isTesting: true }));
  });
});

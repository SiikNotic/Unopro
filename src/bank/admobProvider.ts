// AdMob rewarded ads, only inside the Android app (Capacitor). On the web this file is never loaded and
// the Bank keeps "Publicidad no disponible".
//
// The coins do NOT come from here. When the viewer earns the reward, Google calls our server-side
// verification URL (the `admob-ssv` function) with a signed message naming this player's user id; that
// function checks Google's signature and pays through bank_grant_ad_reward. This adapter only shows the ad
// and reports what the SDK said; the Bank then waits for the server to confirm.
import type { AdMobPlugin, AdMobRewardItem } from '@capacitor-community/admob';
import { setAdsIssue } from './ads';
import type { RewardedAdOutcome, RewardedAdsProvider } from './ads';

const reason = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) ?? 'unknown');

/** Google's public sample IDs: always serve test ads and never pay (no SSV callback reaches us). */
export const ADMOB_TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';

/** After "no ad to show", don't offer the button again for a while. */
const NO_FILL_BACKOFF_MS = 60_000;
/** Longest an ad may stay open before we give up waiting for it to close. */
const SHOW_TIMEOUT_MS = 5 * 60_000;

type AdMobModule = Pick<typeof import('@capacitor-community/admob'), 'RewardAdPluginEvents' | 'AdmobConsentStatus'> & { AdMob: AdMobPlugin };

export interface AdMobProviderOptions {
  /** The rewarded ad unit id ("ca-app-pub-…/…"). The test id serves test ads only. */
  adUnitId: string;
  admob: AdMobModule;
  now?: () => number;
}

export function createAdMobProvider({ adUnitId, admob, now = () => Date.now() }: AdMobProviderOptions): RewardedAdsProvider {
  const { AdMob, RewardAdPluginEvents, AdmobConsentStatus } = admob;
  const testing = adUnitId === ADMOB_TEST_REWARDED_ID;
  let ready: Promise<boolean> | null = null;
  let unavailableUntil = 0;
  let showing = false;
  const rewardListeners = new Set<(e: { rewardId: string | null }) => void>();

  // Once: start the SDK and ask for consent where the law requires it (Google's UMP message, set up in
  // AdMob → Privacy & messaging). If the player declines where consent is required, no ads are requested.
  // A failing consent check (e.g. no privacy message configured yet) doesn't block ads by itself: outside the
  // regions that require consent Google serves them anyway.
  const init = () =>
    (ready ??= (async () => {
      try {
        await AdMob.initialize({ initializeForTesting: testing });
      } catch (e) {
        setAdsIssue(`init: ${reason(e)}`);
        ready = null; // try again next time
        return false;
      }
      try {
        let info = await AdMob.requestConsentInfo();
        if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
        if (info.canRequestAds === false) {
          setAdsIssue('consent: not granted');
          return false;
        }
      } catch (e) {
        setAdsIssue(`consent: ${reason(e)}`);
      }
      return true;
    })());

  return {
    id: 'admob',
    async isAvailable() {
      if (showing) return true;
      if (now() < unavailableUntil) return false;
      return init();
    },
    async showRewardedAd({ userId }): Promise<RewardedAdOutcome> {
      if (showing) return { status: 'failed', reason: 'busy' };
      if (!(await init())) return { status: 'failed', reason: 'not_ready' };
      showing = true;
      const handles: { remove: () => Promise<void> }[] = [];
      try {
        try {
          // The user id travels to Google and comes back in the signed SSV callback.
          await AdMob.prepareRewardVideoAd({ adId: adUnitId, isTesting: testing, ssv: { userId, customData: userId } });
        } catch (e) {
          unavailableUntil = now() + NO_FILL_BACKOFF_MS;
          setAdsIssue(`load: ${reason(e)}`);
          return { status: 'failed', reason: 'no_fill' };
        }
        setAdsIssue(null);
        let earned: AdMobRewardItem | null = null;
        const closed = new Promise<RewardedAdOutcome>((resolve) => {
          const timer = setTimeout(() => resolve({ status: 'failed', reason: 'timeout' }), SHOW_TIMEOUT_MS);
          const done = (o: RewardedAdOutcome) => {
            clearTimeout(timer);
            resolve(o);
          };
          void AdMob.addListener(RewardAdPluginEvents.Rewarded, (item) => {
            earned = item;
            for (const l of rewardListeners) l({ rewardId: null });
          }).then((h) => handles.push(h));
          void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done(earned ? { status: 'completed', rewardId: null } : { status: 'cancelled' })).then((h) => handles.push(h));
          void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done({ status: 'failed', reason: 'show_failed' })).then((h) => handles.push(h));
        });
        // Resolves when the reward is earned; it may also reject if the ad can't be shown.
        AdMob.showRewardVideoAd().then(
          (item) => (earned ??= item),
          () => undefined
        );
        return await closed;
      } finally {
        showing = false;
        for (const h of handles) void h.remove();
      }
    },
    onReward(listener) {
      rewardListeners.add(listener);
      return () => rewardListeners.delete(listener);
    },
  };
}

/**
 * Registers AdMob as the Bank's ad provider when running inside the Android app. The ad unit id comes
 * from the build (VITE_ADMOB_REWARDED_ID); without it, Google's test unit is used (test ads, no coins).
 */
export async function registerAdMobIfNative(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return false;
  const [admob, { setRewardedAdsProvider }] = await Promise.all([import('@capacitor-community/admob'), import('./ads')]).catch((e: unknown) => {
    setAdsIssue(`plugin: ${reason(e)}`);
    throw e;
  });
  const configured = import.meta.env.VITE_ADMOB_REWARDED_ID;
  const adUnitId = typeof configured === 'string' && /^ca-app-pub-\d+\/\d+$/.test(configured) ? configured : ADMOB_TEST_REWARDED_ID;
  setRewardedAdsProvider(createAdMobProvider({ adUnitId, admob }));
  return true;
}

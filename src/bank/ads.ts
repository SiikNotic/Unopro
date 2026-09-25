// Rewarded ads: the contract a real ad network must fulfil, and the default "no provider" adapter.
//
// NO AD NETWORK IS CONNECTED IN THIS BUILD. `noAdsProvider` always answers "unavailable", so the Bank
// shows "Publicidad no disponible" and never pretends an ad played. To connect one (AdMob / Google Ad
// Manager for web, AppLovin, Unity Ads, ...):
//   1. Write an adapter implementing RewardedAdsProvider with the network's SDK and register it with
//      setRewardedAdsProvider() at start-up (only in production builds with the network configured).
//   2. Turn on the network's SERVER-SIDE VERIFICATION (SSV) callback, pointing to a server function
//      that checks the callback's signature and then calls the database function
//      bank_grant_ad_reward(user_id, provider, reward_id) with the service role. That call is the only
//      way an ad pays: the browser never grants coins, it only waits for the server to confirm.
//   3. Pass the player's user id to the network as the SSV "user id" so the callback names them.
// The adapter must report 'completed' only when the SDK says the reward was earned (not on close).

export type RewardedAdOutcome =
  /** The network says the viewer earned the reward. The coins still come only from the server. */
  | { status: 'completed'; rewardId: string | null }
  /** Closed before the end: no reward. */
  | { status: 'cancelled' }
  /** No fill, blocked, or the SDK failed. We don't know why, so we don't guess (e.g. no "ad blocker" claims). */
  | { status: 'failed'; reason?: string };

export interface RewardedAdsProvider {
  /** Short id stored with each reward, e.g. 'admob'. Must match what the server callback uses. */
  readonly id: string;
  /** Whether an ad can be shown right now (SDK loaded, an ad filled). */
  isAvailable(): Promise<boolean>;
  /** Shows the ad full screen and resolves when it closes. `userId` goes to the SSV callback. */
  showRewardedAd(options: { userId: string }): Promise<RewardedAdOutcome>;
  /** Called by the SDK when a reward is earned; returns an unsubscribe function. */
  onReward(listener: (event: { rewardId: string | null }) => void): () => void;
}

/** The default: no ad network. Never available, never shows anything, never rewards. */
export const noAdsProvider: RewardedAdsProvider = {
  id: 'none',
  isAvailable: async () => false,
  showRewardedAd: async () => ({ status: 'failed', reason: 'no_provider' }),
  onReward: () => () => {},
};

let current: RewardedAdsProvider = noAdsProvider;

export function setRewardedAdsProvider(provider: RewardedAdsProvider | null): void {
  current = provider ?? noAdsProvider;
}

export function getRewardedAdsProvider(): RewardedAdsProvider {
  return current;
}

/** True when a real ad network adapter was registered. */
export function hasAdsProvider(): boolean {
  return current !== noAdsProvider;
}

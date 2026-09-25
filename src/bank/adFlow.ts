import type { RewardedAdsProvider } from './ads';
import type { AdEvent } from './bankLogic';

export interface AdFlowOptions {
  provider: RewardedAdsProvider;
  userId: string;
  /** Latest server-side ad reward id (null = none yet). */
  checkServer: () => Promise<number | null>;
  dispatch: (e: AdEvent) => void;
  isAlive?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  verifyEveryMs?: number;
  verifyForMs?: number;
}

export type AdFlowResult = 'rewarded' | 'cancelled' | 'failed' | 'unconfirmed' | 'aborted';

/**
 * One "watch an ad" attempt. The network's "completed" is NOT a reward: the flow then waits for the
 * server to record a new reward (granted only by the network's verified server callback). If none
 * appears in time the attempt ends 'unconfirmed' and nothing is paid.
 */
export async function runAdFlow(o: AdFlowOptions): Promise<AdFlowResult> {
  const alive = o.isAlive ?? (() => true);
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => performance.now());
  const every = o.verifyEveryMs ?? 2000;
  const span = o.verifyForMs ?? 45000;
  o.dispatch({ type: 'start' });
  try {
    const before = await o.checkServer();
    if (!(await o.provider.isAvailable())) {
      o.dispatch({ type: 'failed' });
      return 'failed';
    }
    o.dispatch({ type: 'shown' });
    const outcome = await o.provider.showRewardedAd({ userId: o.userId });
    if (!alive()) return 'aborted';
    if (outcome.status === 'cancelled') {
      o.dispatch({ type: 'cancelled' });
      return 'cancelled';
    }
    if (outcome.status !== 'completed') {
      o.dispatch({ type: 'failed' });
      return 'failed';
    }
    o.dispatch({ type: 'completed' });
    const until = now() + span;
    while (alive() && now() < until) {
      await sleep(every);
      const latest = await o.checkServer();
      if (latest !== null && (before === null || latest > before)) {
        if (!alive()) return 'aborted';
        o.dispatch({ type: 'confirmed' });
        return 'rewarded';
      }
    }
    if (!alive()) return 'aborted';
    o.dispatch({ type: 'unconfirmed' });
    return 'unconfirmed';
  } catch {
    if (alive()) o.dispatch({ type: 'failed' });
    return 'failed';
  }
}

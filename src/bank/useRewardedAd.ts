import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getRewardedAdsProvider } from './ads';
import type { RewardedAdsProvider } from './ads';
import { adReducer } from './bankLogic';
import { runAdFlow } from './adFlow';
import type { AdState } from './bankLogic';

const RECHECK_MS = 60000;

/**
 * Drives the "watch an ad" button. The ad network's "completed" only moves the button to VERIFYING:
 * it becomes REWARDED when `checkServer` sees the reward the server granted (from the network's
 * verified callback). If the server never confirms, the button shows an error and no coins appear.
 */
export function useRewardedAd(options: {
  enabled: boolean;
  userId: string | null;
  /** Latest server-side ad reward id (null = none yet): refetches the Bank status and reads it. */
  checkServer: () => Promise<number | null>;
  onConfirmed: () => void;
  provider?: RewardedAdsProvider;
}): { state: AdState; start: () => void } {
  const { enabled, userId, checkServer, onConfirmed } = options;
  const provider = options.provider ?? getRewardedAdsProvider();
  const [state, dispatch] = useReducer(adReducer, 'CHECKING');
  const alive = useRef(true);
  const busy = useRef(false);
  const latest = useRef({ checkServer, onConfirmed });
  latest.current = { checkServer, onConfirmed };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Availability: asked of the provider (the default one always says no), again after each attempt.
  const checking = state === 'CHECKING';
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      provider
        .isAvailable()
        .then((available) => !cancelled && dispatch({ type: 'availability', available: enabled && available }))
        .catch(() => !cancelled && dispatch({ type: 'availability', available: false }));
    };
    check();
    const id = window.setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [provider, enabled, checking]);

  // REWARDED and ERROR are shown for a moment, then the button asks the provider again.
  useEffect(() => {
    if (state !== 'REWARDED' && state !== 'ERROR') return;
    const id = window.setTimeout(() => dispatch({ type: 'reset' }), state === 'REWARDED' ? 2600 : 4000);
    return () => window.clearTimeout(id);
  }, [state]);

  const start = useCallback(() => {
    if (busy.current || !enabled || !userId) return;
    busy.current = true;
    void runAdFlow({ provider, userId, checkServer: () => latest.current.checkServer(), dispatch, isAlive: () => alive.current }).then((result) => {
      busy.current = false;
      if (result === 'rewarded') latest.current.onConfirmed();
    });
  }, [enabled, userId, provider]);

  return { state, start };
}

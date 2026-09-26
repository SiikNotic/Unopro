// Calls to the `casino` edge function for a registered player's account coins.
import { onlineConfig, tokenFor } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';
import type { CasinoErrorCode, CasinoRequest } from '@/casino/server/protocol';

export const casinoUrl = (cfg: OnlineConfig) => `${cfg.base}/functions/v1/casino`;

export type CasinoResult<T> = { ok: true; data: T } | { ok: false; code: CasinoErrorCode };

const CODES: CasinoErrorCode[] = ['unauthorized', 'account_required', 'insufficient_funds', 'invalid_bet', 'conflict', 'rate_limited', 'bad_request', 'game_disabled', 'server'];

/** One call. Network trouble and timeouts come back as 'server' (the caller may retry with the same id). */
export async function casinoCall<T>(req: CasinoRequest, cfg: OnlineConfig | null = onlineConfig(), fetchImpl: typeof fetch = (...a) => fetch(...a), timeoutMs = 10000): Promise<CasinoResult<T>> {
  if (!cfg) return { ok: false, code: 'unauthorized' };
  const token = await tokenFor(cfg);
  if (!token) return { ok: false, code: 'unauthorized' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(casinoUrl(cfg), {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', apikey: cfg.apiKey, authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && body) return { ok: true, data: body as T };
    const code = body?.code as CasinoErrorCode;
    return { ok: false, code: CODES.includes(code) ? code : 'server' };
  } catch {
    return { ok: false, code: 'server' };
  } finally {
    clearTimeout(timer);
  }
}

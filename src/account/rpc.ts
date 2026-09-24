// Calls to the database functions (PostgREST /rpc) as the signed-in player. Every one of them checks
// who the caller is (the verified JWT) and what they may do; this file only carries the request.
import { onlineConfig, tokenFor } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';

export type RpcErrorCode = 'forbidden' | 'invalid' | 'conflict' | 'insufficient_funds' | 'not_found' | 'not_registered' | 'banned' | 'network' | 'server';
export type RpcResult<T> = { ok: true; data: T } | { ok: false; code: RpcErrorCode; detail: string };

const CODES: Record<string, RpcErrorCode> = {
  '42501': 'forbidden',
  P0400: 'invalid',
  P0409: 'conflict',
  P0402: 'insufficient_funds',
  P0404: 'not_found',
  P0403: 'not_registered',
  P0451: 'banned',
};

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, cfg: OnlineConfig | null = onlineConfig(), fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<RpcResult<T>> {
  if (!cfg) return { ok: false, code: 'server', detail: 'no server' };
  const token = await tokenFor(cfg);
  if (!token) return { ok: false, code: 'not_registered', detail: 'no session' };
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.apiKey, authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
  } catch {
    return { ok: false, code: 'network', detail: '' };
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, data: body as T };
  const b = (body ?? {}) as { code?: string; message?: string };
  return { ok: false, code: CODES[b.code ?? ''] ?? 'server', detail: typeof b.message === 'string' ? b.message : '' };
}

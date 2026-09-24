// The house on a server (see supabase/functions/slot-spin). The browser sends only
// { requestId, machine, bet }; the server checks the balance, books the bet, draws the reels, pays and
// answers with the receipt. Every answer is validated before it is drawn.
import type { SlotService, SpinErrorCode, SpinRequest } from './service';
import { parseReceipt, SpinError } from './service';

export interface RemoteHouseOptions {
  /** Base URL of the slot endpoint, e.g. https://<project>.supabase.co/functions/v1/slot-spin */
  url: string;
  /** Bearer token for the signed-in player (the server identifies the player from it, never from the body). */
  getToken: () => Promise<string | null>;
  /** Extra headers (e.g. a public API key the gateway requires). */
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const STATUS_CODES: Record<number, SpinErrorCode> = {
  400: 'invalid_bet',
  401: 'unauthorized',
  403: 'unauthorized',
  402: 'insufficient_funds',
  409: 'conflict',
  422: 'invalid_bet',
  429: 'rate_limited',
};

export function createRemoteSlotService(opts: RemoteHouseOptions): SlotService {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 8000;

  async function call(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new SpinError('offline');
    const token = await opts.getToken();
    if (!token) throw new SpinError('unauthorized');
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await doFetch(`${opts.url}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...opts.headers },
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        if (res.ok) throw new SpinError('bad_response', 'invalid JSON');
      }
      if (!res.ok) {
        const code = (body as { code?: unknown } | null)?.code;
        if (typeof code === 'string' && code in { insufficient_funds: 1, invalid_bet: 1, invalid_machine: 1, conflict: 1, unauthorized: 1, rate_limited: 1 }) throw new SpinError(code as SpinErrorCode);
        if (res.status === 404) return null;
        throw new SpinError(STATUS_CODES[res.status] ?? 'server', `HTTP ${res.status}`);
      }
      return body;
    } catch (e) {
      if (e instanceof SpinError) throw e;
      if (timedOut) throw new SpinError('timeout');
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      throw new SpinError('network', String(e));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    mode: 'remote',
    async spin(req: SpinRequest, signal?: AbortSignal) {
      const body = await call('', { method: 'POST', body: JSON.stringify({ requestId: req.requestId, machine: req.machine, bet: req.bet }) }, signal);
      return parseReceipt(body, req);
    },
    async lookup(requestId: string, signal?: AbortSignal) {
      const body = await call(`?requestId=${encodeURIComponent(requestId)}`, { method: 'GET' }, signal);
      if (body === null || (body as { found?: unknown }).found === false) return null;
      return parseReceipt(body);
    },
    async balance(signal?: AbortSignal) {
      const body = (await call('?balance=1', { method: 'GET' }, signal)) as { balance?: unknown } | null;
      const b = body?.balance;
      if (typeof b !== 'number' || !Number.isInteger(b) || b < 0) throw new SpinError('bad_response', 'bad balance');
      return b;
    },
  };
}

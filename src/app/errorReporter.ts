// Crash reports: uncaught errors and unhandled promise rejections are sent to report_client_error (the database
// trims them, drops query strings and limits how many it keeps). Reports go with the public key only — no
// session, no account id — and the page sends at most a few, each kind of error once.
import { onlineConfig } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';

const MAX_PER_PAGE = 5;

export interface ErrorReport {
  kind: 'error' | 'rejection';
  message: string;
  stack: string | null;
}

/** The page address without query string or fragment (they can carry tokens). */
export const safeUrl = (href: string): string => href.split(/[?#]/, 1)[0].slice(0, 300);

export function describe(kind: ErrorReport['kind'], reason: unknown): ErrorReport | null {
  const err = reason instanceof Error ? reason : null;
  const message = (err ? `${err.name}: ${err.message}` : typeof reason === 'string' ? reason : '').trim();
  if (!message) return null;
  return { kind, message: message.slice(0, 500), stack: err?.stack ? err.stack.slice(0, 4000) : null };
}

export function createReporter(cfg: OnlineConfig | null, send: typeof fetch, platform: string) {
  const seen = new Set<string>();
  return (report: ErrorReport | null): void => {
    if (!cfg || !report || seen.size >= MAX_PER_PAGE) return;
    const key = `${report.kind}:${report.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    void send(`${cfg.base}/rest/v1/rpc/report_client_error`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.apiKey },
      body: JSON.stringify({
        p_kind: report.kind,
        p_message: report.message,
        p_stack: report.stack,
        p_url: typeof location === 'undefined' ? null : safeUrl(location.href),
        p_version: null,
        p_platform: platform,
        p_agent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 300),
      }),
      keepalive: true,
    }).catch(() => undefined);
  };
}

/** Starts listening for uncaught errors (once). */
export function installErrorReporter(): void {
  if (typeof window === 'undefined') return;
  const native = !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  const report = createReporter(onlineConfig(), (...a) => fetch(...a), native ? 'android' : 'web');
  window.addEventListener('error', (e) => report(describe('error', e.error ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => report(describe('rejection', e.reason)));
}

import { describe as group, expect, it, vi } from 'vitest';
import { createReporter, describe, safeUrl } from '../errorReporter';

const cfg = { base: 'https://p.supabase.co', apiKey: 'k', apiUrl: '' };

group('errorReporter', () => {
  it('drops query strings and fragments', () => {
    expect(safeUrl('https://a.b/c?access_token=x#y')).toBe('https://a.b/c');
    expect(safeUrl('https://a.b/c#token')).toBe('https://a.b/c');
  });

  it('describes errors and strings, ignores empty reasons', () => {
    expect(describe('error', new TypeError('boom'))?.message).toBe('TypeError: boom');
    expect(describe('rejection', 'nope')).toEqual({ kind: 'rejection', message: 'nope', stack: null });
    expect(describe('rejection', undefined)).toBeNull();
    expect(describe('error', '   ')).toBeNull();
  });

  it('sends each error once, at most five, with the public key only', () => {
    const send = vi.fn(async () => new Response('true'));
    const report = createReporter(cfg, send as unknown as typeof fetch, 'web');
    report(describe('error', 'a'));
    report(describe('error', 'a'));
    for (const m of ['b', 'c', 'd', 'e', 'f', 'g']) report(describe('error', m));
    expect(send).toHaveBeenCalledTimes(5);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/report_client_error');
    expect(init.headers).toEqual({ 'content-type': 'application/json', apikey: 'k' });
    expect(JSON.parse(init.body as string)).toMatchObject({ p_kind: 'error', p_message: 'a', p_platform: 'web' });
  });

  it('does nothing without a server', () => {
    const send = vi.fn();
    createReporter(null, send as unknown as typeof fetch, 'web')(describe('error', 'a'));
    expect(send).not.toHaveBeenCalled();
  });
});

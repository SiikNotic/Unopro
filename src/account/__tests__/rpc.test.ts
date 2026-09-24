import { describe, expect, it, vi } from 'vitest';

vi.mock('@/games/online/client', () => ({ onlineConfig: () => null, tokenFor: async () => 'tok' }));
const { rpc } = await import('../rpc');
const cfg = { base: 'https://p.supabase.co', apiKey: 'k', apiUrl: '' };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('rpc error mapping', () => {
  it('passes data through and maps database error codes', async () => {
    expect(await rpc('f', {}, cfg, reply(200, { a: 1 }))).toEqual({ ok: true, data: { a: 1 } });
    expect(await rpc('f', {}, cfg, reply(403, { code: '42501', message: 'access_denied' }))).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await rpc('f', {}, cfg, reply(400, { code: 'P0409', message: 'taken' }))).toMatchObject({ ok: false, code: 'conflict', detail: 'taken' });
    expect(await rpc('f', {}, cfg, reply(400, { code: 'P0400', message: 'reserved' }))).toMatchObject({ code: 'invalid', detail: 'reserved' });
    expect(await rpc('f', {}, cfg, reply(400, { code: 'P0451' }))).toMatchObject({ code: 'banned' });
    expect(await rpc('f', {}, cfg, reply(500, null))).toMatchObject({ code: 'server' });
  });
  it('sends the player token, never a role or id', async () => {
    const f = vi.fn(async () => new Response('null', { status: 200 }));
    await rpc('staff_overview', {}, cfg, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/staff_overview');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(init.body).toBe('{}');
  });
});

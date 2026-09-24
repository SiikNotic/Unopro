import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnonAuth } from '../anonAuth';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('anonymous auth', () => {
  it('signs up once and reuses the token; concurrent calls share one request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }));
    const get = createAnonAuth({ authUrl: 'https://p/auth/v1', apiKey: 'pub', fetchImpl, now: () => 1_000_000 });
    const [t1, t2] = await Promise.all([get(), get()]);
    expect([t1, t2]).toEqual(['a1', 'a1']);
    expect(await get()).toBe('a1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://p/auth/v1/signup');
  });

  it('refreshes an expired session and never silently replaces the player', async () => {
    store.set('carta.slots.session', JSON.stringify({ access_token: 'old', refresh_token: 'r', expires_at: 10 }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    const get = createAnonAuth({ authUrl: 'https://p/auth/v1', apiKey: 'pub', fetchImpl, now: () => 1_000_000 });
    expect(await get()).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('grant_type=refresh_token');
  });
});

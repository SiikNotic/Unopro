import { describe, expect, it, vi } from 'vitest';
import { remoteConfig } from '../config';
import { postgrestStore } from '../../../../supabase/functions/_shared/postgrestStore';
import { StoreError } from '../../../../supabase/functions/_shared/slotHandler';

describe('remote config', () => {
  const full = { VITE_SLOTS_API_URL: 'https://p.supabase.co/functions/v1/slot-spin', VITE_SUPABASE_URL: 'https://p.supabase.co', VITE_SUPABASE_ANON_KEY: 'pub' };
  it('is off unless everything is configured (local mode by default)', () => {
    expect(remoteConfig({})).toBeNull();
    expect(remoteConfig({ ...full, VITE_SUPABASE_ANON_KEY: '' })).toBeNull();
  });
  it('requires https, except localhost in development', () => {
    expect(remoteConfig(full)?.authUrl).toBe('https://p.supabase.co/auth/v1');
    const local = { VITE_SLOTS_API_URL: 'http://127.0.0.1:5288/functions/v1/slot-spin', VITE_SUPABASE_URL: 'http://127.0.0.1:5288', VITE_SUPABASE_ANON_KEY: 'k' };
    expect(remoteConfig(local)).toBeNull();
    expect(remoteConfig({ ...local, DEV: true })).not.toBeNull();
    expect(remoteConfig({ ...full, VITE_SLOTS_API_URL: 'http://evil.example/spin', DEV: true })).toBeNull();
  });
});

describe('postgrest store', () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  it('maps database refusals to store errors', async () => {
    for (const [code, expected] of [['P0402', 'insufficient_funds'], ['P0409', 'conflict'], ['P0400', 'invalid_bet']]) {
      const s = postgrestStore('https://p', 'k', vi.fn().mockResolvedValue(res(400, { code })));
      await expect(s.commit({ userId: 'u', requestId: 'r', machine: 'royal', bet: 10, stops: [1, 2, 3, 4, 5], payout: 0 })).rejects.toEqual(new StoreError(expected as never));
    }
  });
  it('converts rows to receipts', async () => {
    const row = { request_id: 'r', machine: 'royal', bet: 10, stops: [1, 2, 3, 4, 5], payout: '40', balance: '1030', created_at: '2026-01-01T00:00:00Z' };
    const s = postgrestStore('https://p', 'k', vi.fn().mockResolvedValue(res(200, [row])));
    await expect(s.find('u', 'r')).resolves.toMatchObject({ requestId: 'r', payout: 40, balance: 1030 });
  });
});

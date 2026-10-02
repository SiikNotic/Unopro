import { describe, expect, it, vi } from 'vitest';

vi.mock('@/games/online/client', () => ({ onlineConfig: () => null, tokenFor: async () => 'tok' }));
const { parseDailyClaim, parseDailyStatus, parseGiveawayHome, remaining } = await import('../homeExtras');

describe('parseGiveawayHome', () => {
  it('reads a full answer', () => {
    const g = parseGiveawayHome({
      active: { prizeCoins: 10000, endsAt: '2026-10-09T18:48:00Z', entries: '3' },
      last: { prizeCoins: 5000, endedAt: '2026-10-02T18:48:00Z', winner: 'ana' },
      me: { registered: true, linked: true, entered: false },
      win: { id: 'g1', prizeCoins: 5000, awardedAt: '2026-10-02T18:48:00Z' },
      inviteUrl: 'https://discord.gg/abc123',
    });
    expect(g.active).toEqual({ prizeCoins: 10000, endsAt: '2026-10-09T18:48:00Z', entries: 3 });
    expect(g.last?.winner).toBe('ana');
    expect(g.me).toEqual({ registered: true, linked: true, entered: false });
    expect(g.win?.id).toBe('g1');
    expect(g.inviteUrl).toBe('https://discord.gg/abc123');
  });

  it('is empty for junk and never keeps a non-Discord link', () => {
    expect(parseGiveawayHome(null)).toEqual({ active: null, last: null, me: null, win: null, inviteUrl: null });
    expect(parseGiveawayHome({ inviteUrl: 'https://evil.example/discord.gg/x' }).inviteUrl).toBeNull();
    expect(parseGiveawayHome({ inviteUrl: 'javascript:alert(1)' }).inviteUrl).toBeNull();
    expect(parseGiveawayHome({ active: { prizeCoins: 1 } }).active).toBeNull();
    expect(parseGiveawayHome({ me: { registered: 'yes' } }).me?.registered).toBe(false);
  });
});

describe('parseDailyStatus', () => {
  it('reads the status and drops bad amounts', () => {
    const d = parseDailyStatus({ registered: true, claimedToday: false, streak: 2, nextDay: 3, todayAmount: null, nextAmount: 200, nextClaimAt: null, amounts: [100, '150', -1, 'x'] });
    expect(d).toMatchObject({ registered: true, streak: 2, nextDay: 3, todayAmount: null, nextAmount: 200, amounts: [100, 150] });
  });
  it('defaults to day 1 for a guest', () => {
    expect(parseDailyStatus({}).nextDay).toBe(1);
    expect(parseDailyStatus({}).registered).toBe(false);
  });
});

it('parseDailyClaim reads numbers', () => {
  expect(parseDailyClaim({ amount: '150', streak: 2, balance: 1150, nextAmount: 200 })).toEqual({ amount: 150, streak: 2, balance: 1150, nextAmount: 200 });
});

describe('remaining', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  it('splits days, hours and minutes', () => {
    expect(remaining('2026-10-03T05:07:30Z', now)).toEqual({ d: 1, h: 5, m: 7 });
  });
  it('never goes negative or NaN', () => {
    expect(remaining('2026-10-01T00:00:00Z', now)).toEqual({ d: 0, h: 0, m: 0 });
    expect(remaining('not a date', now)).toEqual({ d: 0, h: 0, m: 0 });
  });
});

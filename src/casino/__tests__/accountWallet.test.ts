import { describe, expect, it } from 'vitest';
import { accountWallet } from '../walletContext';

const stats = { rounds: 0, wagered: 0, won: 0, best: 0, refills: 0 };

describe('wallet while playing for account coins', () => {
  it('keeps the same functions when the balance changes (a new identity would cancel a spin mid-way)', () => {
    const a = accountWallet(1000, stats);
    const b = accountWallet(990, stats);
    expect(b.balance).toBe(990);
    for (const k of ['refill', 'startRound', 'raiseStake', 'settleRound', 'isOpen', 'openStake', 'bookInstantRound', 'wasSettled', 'playHere'] as const) {
      expect(b[k]).toBe(a[k]);
    }
    expect(b.history).toBe(a.history);
  });

  it('refuses every local money operation (the server moves account coins)', () => {
    const w = accountWallet(500, stats);
    expect(w.mode).toBe('account');
    expect(w.canRefill).toBe(false);
    expect(w.startRound('roulette', 10, 20)).toBeNull();
    expect(w.raiseStake('x', 10)).toBe(false);
    expect(w.settleRound('x', 50)).toBe(0);
    expect(w.bookInstantRound('x', 'slots', 10, 0)).toEqual({ ok: false, reason: 'elsewhere' });
  });
});

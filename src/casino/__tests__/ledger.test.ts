import { describe, expect, it } from 'vitest';
import { emptyWallet, MAX_BALANCE, normalizeWallet, openRound, playRound, raiseStake, RECOVER_AFTER_MS, recoverRounds, refillWallet, settleRound, STALE_ROUND_MS } from '../ledger';

const now = 1_700_000_000_000;

describe('wallet ledger', () => {
  it('takes the stake when a round opens and pays it exactly once', () => {
    let w = emptyWallet(1000);
    const o = openRound(w, { id: 'r1', game: 'roulette', stake: 100, payout: 200, now });
    expect(o.ok).toBe(true);
    w = o.wallet;
    expect(w.balance).toBe(900);
    const s1 = settleRound(w, 'r1', null, now);
    expect(s1.credited).toBe(200);
    expect(s1.wallet.balance).toBe(1100);
    // replaying the settle (double tap, second tab, reload) pays nothing
    const s2 = settleRound(s1.wallet, 'r1', null, now);
    expect(s2.settled).toBe(false);
    expect(s2.wallet.balance).toBe(1100);
    expect(s1.wallet.history[0]).toMatchObject({ id: 'r1', stake: 100, payout: 200 });
  });

  it('refuses bad bets: unaffordable, zero, negative, fractional, duplicate id, reused paid id', () => {
    const w = emptyWallet(100);
    for (const stake of [101, 0, -5, 1.5, NaN, Infinity]) expect(openRound(w, { id: 'x', game: 'slots', stake, payout: 0, now }).ok).toBe(false);
    const a = openRound(w, { id: 'x', game: 'slots', stake: 10, payout: 0, now }).wallet;
    expect(openRound(a, { id: 'x', game: 'slots', stake: 10, payout: 0, now }).ok).toBe(false);
    const paid = settleRound(a, 'x', null, now).wallet;
    expect(openRound(paid, { id: 'x', game: 'slots', stake: 10, payout: 0, now }).ok).toBe(false);
  });

  it('never pays more than the game could ever return, even if asked to', () => {
    const w = openRound(emptyWallet(1000), { id: 'b', game: 'blackjack', stake: 10, payout: null, now }).wallet;
    expect(settleRound(w, 'b', 10 ** 12, now).credited).toBe(25);
    expect(openRound(emptyWallet(1000), { id: 'c', game: 'roulette', stake: 10, payout: 361, now }).ok).toBe(false);
    expect(openRound(emptyWallet(1000), { id: 'd', game: 'roulette', stake: 10, payout: 360, now }).ok).toBe(true);
    expect(openRound(emptyWallet(1000), { id: 'e', game: 'slots', stake: 10, payout: 25_000, now }).ok).toBe(true);
    expect(openRound(emptyWallet(1000), { id: 'f', game: 'slots', stake: 10, payout: 25_001, now }).ok).toBe(false);
  });

  it('raises the stake of an open blackjack round only', () => {
    let w = openRound(emptyWallet(300), { id: 'b', game: 'blackjack', stake: 100, payout: null, now }).wallet;
    const r = raiseStake(w, 'b', 100);
    expect(r.ok).toBe(true);
    w = r.wallet;
    expect(w.balance).toBe(100);
    expect(raiseStake(w, 'b', 200).ok).toBe(false);
    expect(raiseStake(w, 'nope', 10).ok).toBe(false);
    expect(settleRound(w, 'b', 400, now).wallet.history[0].stake).toBe(200);
  });

  it('recovers after a reload: pays old decided spins, closes stale hands, leaves live rounds alone', () => {
    let w = emptyWallet(1000);
    w = openRound(w, { id: 'spin', game: 'roulette', stake: 100, payout: 200, now: now - RECOVER_AFTER_MS - 1 }).wallet;
    w = openRound(w, { id: 'animating', game: 'slots', stake: 10, payout: 50, now: now - 1000 }).wallet;
    w = openRound(w, { id: 'old', game: 'blackjack', stake: 50, payout: null, now: now - STALE_ROUND_MS - 1 }).wallet;
    w = openRound(w, { id: 'live', game: 'blackjack', stake: 50, payout: null, now }).wallet;
    const r = recoverRounds(w, now);
    expect(r.open.map((o) => o.id)).toEqual(['animating', 'live']);
    expect(r.balance).toBe(790 + 200);
  });

  it('cleans up tampered or corrupted storage', () => {
    expect(normalizeWallet(null).balance).toBe(1000);
    expect(normalizeWallet(null, 250).balance).toBe(250);
    expect(normalizeWallet({ balance: 1e30 }).balance).toBe(MAX_BALANCE);
    expect(normalizeWallet({ balance: -40 }).balance).toBe(0);
    expect(normalizeWallet({ balance: 'lots' }).balance).toBe(1000);
    const w = normalizeWallet({ balance: 10, open: [{ id: 'a', game: 'poker', stake: 5, payout: 0, at: 1 }, { id: 'b', game: 'slots', stake: 5, payout: 1e12, at: 1 }, { id: 'c', game: 'slots', stake: 5, payout: 10, at: 1 }, { id: 'c', game: 'slots', stake: 5, payout: 10, at: 1 }] });
    expect(w.open.map((o) => o.id)).toEqual(['b', 'c']);
    expect(w.open[0].payout).toBe(5 * 2500);
  });

  it('offers a refill only when broke', () => {
    expect(refillWallet(emptyWallet(9)).wallet.balance).toBe(1009);
    expect(refillWallet(emptyWallet(10)).ok).toBe(false);
  });

  it('playRound books stake and payout at once, exactly once per id', () => {
    const a = playRound(emptyWallet(100), { id: 'p1', game: 'slots', stake: 50, payout: 120, now });
    expect(a.ok).toBe(true);
    expect(a.wallet.balance).toBe(170);
    expect(a.wallet.open).toHaveLength(0);
    expect(a.wallet.history[0]).toMatchObject({ id: 'p1', stake: 50, payout: 120 });
    const again = playRound(a.wallet, { id: 'p1', game: 'slots', stake: 50, payout: 120, now });
    expect(again).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(again.wallet.balance).toBe(170);
  });

  it('playRound refuses unaffordable, invalid and impossible rounds', () => {
    const w = emptyWallet(40);
    expect(playRound(w, { id: 'a', game: 'slots', stake: 50, payout: 0, now })).toMatchObject({ ok: false, reason: 'funds' });
    expect(playRound(w, { id: 'b', game: 'slots', stake: 0, payout: 0, now })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(playRound(w, { id: 'c', game: 'slots', stake: 10, payout: 25_001, now })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(playRound(w, { id: 'd', game: 'slots', stake: 10, payout: -1, now })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

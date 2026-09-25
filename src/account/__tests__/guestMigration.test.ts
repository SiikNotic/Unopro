import { beforeEach, describe, expect, it } from 'vitest';
import { finishGuestMigration, guestBalance, guestId, registerWithGuest } from '../guest';
import type { RegisterResult } from '../guest';
import { emptyWallet } from '@/casino/ledger';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { window?: unknown }).window = { dispatchEvent: () => true };
});

const setGuest = (balance: number) => store.set('carta.wallet', JSON.stringify(emptyWallet(balance)));
const wallet = () => JSON.parse(store.get('carta.wallet')!).balance as number;

/** The database's rule, for the client-side flow: guest chips + 1,000, once. */
function fakeServer() {
  let done = false;
  const seenGuests = new Set<string>();
  let balance = 0;
  return async (args: { p_guest_id: string; p_guest_balance: number }): Promise<{ ok: true; data: RegisterResult[] }> => {
    if (done) return { ok: true, data: [{ balance, bonus_granted: false, migrated: 0, guest_status: 'already' }] };
    done = true;
    if (seenGuests.has(args.p_guest_id)) return { ok: true, data: [{ balance: (balance += 1000), bonus_granted: true, migrated: 0, guest_status: 'used_elsewhere' }] };
    seenGuests.add(args.p_guest_id);
    const moved = Math.min(args.p_guest_balance, 5000);
    balance += moved + 1000;
    return { ok: true, data: [{ balance, bonus_granted: true, migrated: moved, guest_status: moved < args.p_guest_balance ? 'capped' : 'migrated' }] };
  };
}

describe('guest → account (client side)', () => {
  it.each([
    [0, 1000],
    [500, 1500],
    [1275, 2275],
    [5000, 6000],
  ])('guest with %i → account with %i, and the chips leave the guest wallet', async (guest, final) => {
    setGuest(guest);
    const r = await registerWithGuest(fakeServer());
    expect(r?.balance).toBe(final);
    expect(wallet()).toBe(0);
  });

  it('sends the real guest id and balance, and starts a new guest id afterwards', async () => {
    setGuest(750);
    const before = guestId();
    let sent: { p_guest_id: string; p_guest_balance: number } | null = null;
    await registerWithGuest(async (args) => {
      sent = args;
      return { ok: true, data: [{ balance: 1750, bonus_granted: true, migrated: 750, guest_status: 'migrated' }] };
    });
    expect(sent).toMatchObject({ p_guest_id: before, p_guest_balance: 750 });
    expect(guestId()).not.toBe(before);
  });

  it('a failed call changes nothing: the guest keeps every chip and can retry', async () => {
    setGuest(1275);
    const id = guestId();
    expect(await registerWithGuest(async () => ({ ok: false }))).toBeNull();
    expect(wallet()).toBe(1275);
    expect(guestId()).toBe(id);
    const r = await registerWithGuest(fakeServer());
    expect(r?.balance).toBe(2275);
  });

  it('a retry after success moves nothing more', async () => {
    setGuest(500);
    const server = fakeServer();
    await registerWithGuest(server);
    setGuest(400); // played on as a guest meanwhile
    const again = await registerWithGuest(server);
    expect(again?.guest_status).toBe('already');
    expect(again?.balance).toBe(1500);
    expect(wallet()).toBe(400);
  });

  it('chips won after the snapshot stay in the guest wallet; above the cap the rest stays too', () => {
    setGuest(3000);
    finishGuestMigration('capped', 2500);
    expect(wallet()).toBe(500);
    expect(guestBalance()).toBe(500);
  });
});

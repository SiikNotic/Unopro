// The guest's economic state lives in this browser (the local wallet). When a guest registers, that
// balance moves into the account on the server (see account_register in the database). Until the
// server confirms, nothing here changes: a failed or lost request never costs the guest a chip.
import { storage } from '@/storage';
import { newId } from '@/casino/random';
import { normalizeWallet } from '@/casino/ledger';
import { WALLET_RESET_EVENT } from '@/casino/walletContext';

const GUEST_ID_KEY = 'carta.guest.id';
const WALLET_KEY = 'carta.wallet';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** This browser's guest id (a random UUID, created the first time it's needed). */
export function guestId(): string {
  const saved = storage.get<string>(GUEST_ID_KEY);
  if (typeof saved === 'string' && UUID_RE.test(saved)) return saved;
  const id = newId();
  storage.set(GUEST_ID_KEY, id);
  return id;
}

/** The guest chips in this browser right now (0 when there is no wallet yet or nothing readable). */
export function guestBalance(): number {
  const raw = storage.get<unknown>(WALLET_KEY);
  return raw === null ? 0 : normalizeWallet(raw).balance;
}

export type GuestStatus = 'migrated' | 'capped' | 'already' | 'used_elsewhere';

/**
 * After the server confirmed: the moved chips leave the guest wallet (anything won since stays) and
 * this browser starts a new guest id, so the same guest wallet can never be moved twice.
 */
export function finishGuestMigration(status: GuestStatus, migrated: number): void {
  if (status === 'migrated' || status === 'capped') {
    const raw = storage.get<unknown>(WALLET_KEY);
    if (raw !== null && migrated > 0) {
      const w = normalizeWallet(raw);
      storage.set(WALLET_KEY, { ...w, balance: Math.max(0, w.balance - migrated) });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(WALLET_RESET_EVENT));
    }
  }
  if (status !== 'already') storage.set(GUEST_ID_KEY, newId());
}

export interface RegisterResult {
  balance: number;
  bonus_granted: boolean;
  migrated: number;
  guest_status: GuestStatus;
}

/**
 * The whole client side of "guest → account": sends this browser's guest id and chips to the database
 * (one transaction there), and only after it answered takes the moved chips out of the guest wallet.
 * If the call fails, nothing local changes and a later sign-in simply tries again.
 */
export async function registerWithGuest(
  call: (args: { p_request: string; p_guest_id: string; p_guest_balance: number }) => Promise<{ ok: true; data: RegisterResult[] } | { ok: false }>
): Promise<RegisterResult | null> {
  const res = await call({ p_request: newId(), p_guest_id: guestId(), p_guest_balance: guestBalance() });
  if (!res.ok || !res.data?.length) return null;
  const r = { ...res.data[0], balance: Number(res.data[0].balance), migrated: Number(res.data[0].migrated) };
  finishGuestMigration(r.guest_status, r.migrated);
  return r;
}

// What the slot screen remembers between visits: the spin it sent but hasn't shown yet (to recover its
// real result after a reload, a closed tab or a lost connection) and a short display-only history.
// Neither decides anything: balances and results always come from the house.
import { storage } from '@/storage';
import { isMachineId, isRequestId, isValidBetFor } from './engine';
import { MACHINES } from './machines';
import type { MachineId } from './engine';
import type { SpinReceipt } from './service';

const PENDING_KEY = 'carta.slots.pending';
const HISTORY_KEY = 'carta.slots.history';
export const HISTORY_KEPT = 30;

export interface PendingSpin {
  requestId: string;
  machine: MachineId;
  bet: number;
  at: number;
}

export function loadPending(): PendingSpin | null {
  const raw = storage.get<Partial<PendingSpin>>(PENDING_KEY);
  if (!raw || !isRequestId(raw.requestId) || !isMachineId(raw.machine) || !isValidBetFor(MACHINES[raw.machine], raw.bet) || typeof raw.at !== 'number') return null;
  return { requestId: raw.requestId, machine: raw.machine, bet: raw.bet, at: raw.at };
}

export const savePending = (p: PendingSpin) => storage.set(PENDING_KEY, p);

/** Clears the pending spin only if it is still this one (another tab may have sent a newer one). */
export function clearPending(requestId: string): void {
  if (loadPending()?.requestId === requestId) storage.remove(PENDING_KEY);
}

export interface HistoryItem {
  requestId: string;
  machine: MachineId;
  bet: number;
  payout: number;
  at: number;
}

export function loadHistory(): HistoryItem[] {
  const raw = storage.get<unknown>(HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h: Partial<HistoryItem> | null): h is HistoryItem => {
      if (!h || !isRequestId(h.requestId) || !isMachineId(h.machine)) return false;
      return isValidBetFor(MACHINES[h.machine], h.bet) && Number.isInteger(h.payout) && (h.payout as number) >= 0 && typeof h.at === 'number';
    })
    .slice(0, HISTORY_KEPT);
}

export function addHistory(r: SpinReceipt): HistoryItem[] {
  const item: HistoryItem = { requestId: r.requestId, machine: r.machine, bet: r.bet, payout: r.payout, at: r.at };
  const next = [item, ...loadHistory().filter((h) => h.requestId !== r.requestId)].slice(0, HISTORY_KEPT);
  storage.set(HISTORY_KEY, next);
  return next;
}

// The house when there is no server: decides and books spins in this browser, with the same contract
// and the same guarantees as the server (validated bet, idempotent request id, stake and payout booked
// atomically in the wallet ledger). It is NOT authoritative: anyone controlling this device controls it.
// See supabase/ for the server version, which the screen uses instead when it is configured.
import { cryptoUint32, drawStops, isMachineId, isRequestId, isValidBet, resolveSpin } from './engine';
import type { SlotService, SpinReceipt, SpinRequest } from './service';
import { parseReceipt, SpinError } from './service';
import type { WalletContextValue } from '../walletContext';

export const RECEIPTS_KEY = 'carta.slots.receipts';
export const RECEIPTS_KEPT = 50;

export interface ReceiptStore {
  get(): unknown;
  set(value: SpinReceipt[]): boolean;
}

export interface LocalHouseDeps {
  book: WalletContextValue['bookInstantRound'];
  wasSettled: WalletContextValue['wasSettled'];
  getBalance: () => number;
  store: ReceiptStore;
  random?: () => number;
  now?: () => number;
}

export function readReceipts(store: ReceiptStore): SpinReceipt[] {
  const raw = store.get();
  if (!Array.isArray(raw)) return [];
  const out: SpinReceipt[] = [];
  for (const r of raw.slice(0, RECEIPTS_KEPT)) {
    try {
      out.push(parseReceipt(r));
    } catch {
      // drop anything malformed or edited into an inconsistent state
    }
  }
  return out;
}

export function createLocalSlotService(deps: LocalHouseDeps): SlotService {
  const random = deps.random ?? cryptoUint32;
  const now = deps.now ?? Date.now;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const booked = (requestId: string): SpinReceipt | null => {
    const receipt = readReceipts(deps.store).find((r) => same(r.requestId, requestId));
    // A receipt only counts when the wallet really booked that round.
    return receipt && deps.wasSettled(receipt.requestId) ? receipt : null;
  };

  return {
    mode: 'local',
    async spin(req: SpinRequest) {
      if (!isRequestId(req.requestId)) throw new SpinError('invalid_bet', 'bad request id');
      if (!isMachineId(req.machine)) throw new SpinError('invalid_machine');
      if (!isValidBet(req.bet)) throw new SpinError('invalid_bet');

      // Replay of a request already booked: same answer, nothing charged or paid again.
      const existing = booked(req.requestId);
      if (existing) {
        if (existing.machine !== req.machine || existing.bet !== req.bet) throw new SpinError('conflict');
        return existing;
      }
      if (deps.wasSettled(req.requestId)) throw new SpinError('conflict', 'request id already used');

      const result = resolveSpin(drawStops(random), req.bet);
      let receipt: SpinReceipt | null = null;
      const r = deps.book(req.requestId, 'slots', req.bet, result.payout, (balance) => {
        receipt = { requestId: req.requestId, machine: req.machine, bet: req.bet, stops: result.stops, payout: result.payout, balance, at: now() };
        const kept = readReceipts(deps.store).filter((x) => !same(x.requestId, req.requestId));
        deps.store.set([receipt, ...kept].slice(0, RECEIPTS_KEPT));
      });
      if (!r.ok) throw new SpinError(r.reason === 'funds' ? 'insufficient_funds' : r.reason === 'duplicate' ? 'conflict' : 'invalid_bet');
      return receipt!;
    },
    async lookup(requestId: string) {
      return booked(requestId);
    },
    async balance() {
      return deps.getBalance();
    },
  };
}

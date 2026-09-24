// The house when there is no server: decides and books spins in this browser, with the same contract
// and the same guarantees as the server (validated bet, idempotent request id, stake and payout booked
// atomically in the wallet ledger). It is NOT authoritative: anyone controlling this device controls it.
// See supabase/ for the server version, which the screen uses instead when it is configured.
import { cryptoUint32, isMachineId, isRequestId, isValidBetFor, playRound } from './engine';
import type { RoundDraws } from './engine';
import { MACHINES } from './machines';
import type { SlotService, SpinReceipt, SpinRequest } from './service';
import { parseReceipt, SpinError } from './service';
import type { WalletContextValue } from '../walletContext';

/** Each receipt lives under its own key, so two tabs booking at once never overwrite each other. */
export const RECEIPT_PREFIX = 'carta.slots.r.';
export const RECEIPTS_KEPT = 50;

export interface ReceiptStore {
  /** Every stored receipt (any order, unvalidated). */
  all(): unknown[];
  put(requestId: string, value: SpinReceipt): boolean;
  remove(requestId: string): void;
}

export interface LocalHouseDeps {
  book: WalletContextValue['bookInstantRound'];
  wasSettled: WalletContextValue['wasSettled'];
  getBalance: () => number;
  store: ReceiptStore;
  random?: () => number;
  now?: () => number;
}

/** Valid receipts, newest first. Malformed or edited ones are ignored. */
export function readReceipts(store: ReceiptStore): SpinReceipt[] {
  const out: SpinReceipt[] = [];
  for (const r of store.all()) {
    try {
      out.push(parseReceipt(r));
    } catch {
      // drop anything malformed or edited into an inconsistent state
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Keeps the newest RECEIPTS_KEPT receipts. */
function prune(store: ReceiptStore) {
  const all = readReceipts(store);
  for (const old of all.slice(RECEIPTS_KEPT)) store.remove(old.requestId.toLowerCase());
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
      const m = MACHINES[req.machine];
      if (!isValidBetFor(m, req.bet)) throw new SpinError('invalid_bet');

      // Replay of a request already booked: same answer, nothing charged or paid again.
      const existing = booked(req.requestId);
      if (existing) {
        if (existing.machine !== req.machine || existing.bet !== req.bet) throw new SpinError('conflict');
        return existing;
      }
      if (deps.wasSettled(req.requestId)) throw new SpinError('conflict', 'request id already used');

      const round = playRound(m, req.bet, random);
      const draws: RoundDraws = round.draws;
      let receipt: SpinReceipt | null = null;
      const r = deps.book(req.requestId, 'slots', req.bet, round.payout, (balance) => {
        receipt = { requestId: req.requestId, machine: req.machine, bet: req.bet, draws, payout: round.payout, balance, at: now() };
        deps.store.put(req.requestId.toLowerCase(), receipt);
      });
      if (!r.ok) throw new SpinError(r.reason === 'funds' ? 'insufficient_funds' : r.reason === 'duplicate' ? 'conflict' : r.reason === 'elsewhere' ? 'other_tab' : 'invalid_bet');
      prune(deps.store);
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

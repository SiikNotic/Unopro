// The slot server's request logic, free of any platform API so it runs (and is tested) anywhere.
// Flow for a spin: authenticated player -> validate input -> replay check -> draw reels (crypto RNG) ->
// compute payout (shared engine) -> commit atomically in the database (balance check, debit, credit,
// record, idempotent on request id) -> answer with the receipt. The client never sends a result, a
// payout or a balance, and there is no parameter, header or account that changes any of this.
import { cryptoUint32, drawStops, isMachineId, isRequestId, isValidBet, resolveSpin } from '../../../src/casino/premium/engine.ts';
import type { MachineId } from '../../../src/casino/premium/engine.ts';

export interface Receipt {
  requestId: string;
  machine: MachineId;
  bet: number;
  stops: number[];
  payout: number;
  balance: number;
  at: number;
}

export type StoreErrorCode = 'insufficient_funds' | 'conflict' | 'invalid_bet';

export class StoreError extends Error {
  constructor(readonly code: StoreErrorCode) {
    super(code);
  }
}

/** Database operations; `commit` must be atomic and idempotent on (userId, requestId). */
export interface SlotStore {
  commit(c: { userId: string; requestId: string; machine: MachineId; bet: number; stops: number[]; payout: number }): Promise<Receipt>;
  find(userId: string, requestId: string): Promise<Receipt | null>;
  balance(userId: string): Promise<number>;
}

export interface HandlerDeps {
  store: SlotStore;
  random?: () => number;
  /** Returns false when the player is over the rate limit. */
  allow?: (userId: string) => boolean;
}

export interface SlotRequest {
  method: string;
  url: string;
  /** Verified player id (JWT subject), or null when the token is missing or invalid. */
  userId: string | null;
  body: unknown;
}

export interface SlotResponse {
  status: number;
  body: unknown;
}

const err = (status: number, code: string): SlotResponse => ({ status, body: { code } });

export async function handleSlotRequest(req: SlotRequest, deps: HandlerDeps): Promise<SlotResponse> {
  if (!req.userId) return err(401, 'unauthorized');
  const userId = req.userId;
  if (deps.allow && !deps.allow(userId)) return err(429, 'rate_limited');
  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      if (url.searchParams.has('balance')) return { status: 200, body: { balance: await deps.store.balance(userId) } };
      const requestId = url.searchParams.get('requestId');
      if (!isRequestId(requestId)) return err(400, 'invalid_bet');
      const found = await deps.store.find(userId, requestId.toLowerCase());
      return found ? { status: 200, body: found } : { status: 404, body: { found: false } };
    }

    if (req.method !== 'POST') return err(405, 'method_not_allowed');
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    // Only these three fields are read; anything else in the body is ignored.
    const { requestId, machine, bet } = b;
    if (!isRequestId(requestId)) return err(400, 'invalid_bet');
    if (!isMachineId(machine)) return err(400, 'invalid_machine');
    if (!isValidBet(bet)) return err(400, 'invalid_bet');
    const id = requestId.toLowerCase();

    // A replay gets the original booking back without a new draw.
    const existing = await deps.store.find(userId, id);
    if (existing) return existing.machine === machine && existing.bet === bet ? { status: 200, body: existing } : err(409, 'conflict');

    const result = resolveSpin(drawStops(deps.random ?? cryptoUint32), bet);
    // If a concurrent duplicate won the race, commit returns ITS booking (same request id, one result).
    const receipt = await deps.store.commit({ userId, requestId: id, machine, bet, stops: result.stops, payout: result.payout });
    return { status: 200, body: receipt };
  } catch (e) {
    if (e instanceof StoreError) return err(e.code === 'insufficient_funds' ? 402 : e.code === 'conflict' ? 409 : 400, e.code);
    return err(500, 'server');
  }
}

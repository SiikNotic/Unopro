// Contract between the slot machine screen and whoever decides spins (the "house"). The screen only
// sends what the player wants to bet and draws the receipt it gets back: it never picks symbols, never
// computes a payout it trusts and never changes a balance.
import { isMachineId, isRequestId, isValidBetFor, isValidDraws, settleRound } from './engine';
import type { MachineId, RoundDraws } from './engine';
import { MACHINES } from './machines';

export interface SpinRequest {
  /** Idempotency key: retrying with the same id never charges or pays twice. */
  requestId: string;
  machine: MachineId;
  /** Total bet (one of the machine's bet levels). */
  bet: number;
}

/** What the house decided and already booked: the stake is taken and the payout credited. */
export interface SpinReceipt {
  requestId: string;
  machine: MachineId;
  bet: number;
  /** Every random draw of the round (reel stops, multipliers, free spins, bonus picks). */
  draws: RoundDraws;
  payout: number;
  /** Balance after this spin (stake taken, payout credited). */
  balance: number;
  at: number;
}

export type SpinErrorCode =
  | 'insufficient_funds'
  | 'invalid_bet'
  | 'invalid_machine'
  /** The request id was already used for a different bet. */
  | 'conflict'
  /** Another tab of this browser is the one playing (local mode). */
  | 'other_tab'
  | 'unauthorized'
  | 'rate_limited'
  | 'offline'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad_response';

/** Errors after which the spin may or may not have been booked: ask the house again with the same id. */
const UNCERTAIN: SpinErrorCode[] = ['offline', 'network', 'timeout', 'server', 'bad_response', 'rate_limited'];

export class SpinError extends Error {
  readonly code: SpinErrorCode;
  constructor(code: SpinErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SpinError';
    this.code = code;
  }
  /** True when the house may have booked the spin, so it must be recovered, never assumed lost. */
  get uncertain(): boolean {
    return UNCERTAIN.includes(this.code);
  }
}

export const asSpinError = (e: unknown): SpinError =>
  e instanceof SpinError ? e : e instanceof DOMException && e.name === 'AbortError' ? new SpinError('timeout') : new SpinError('network', String(e));

export interface SlotService {
  /** 'local' decides spins in this browser; 'remote' asks a server. Shown to the player honestly. */
  readonly mode: 'local' | 'remote';
  spin(req: SpinRequest, signal?: AbortSignal): Promise<SpinReceipt>;
  /** The booked receipt for a request id, or null when the house never booked it. */
  lookup(requestId: string, signal?: AbortSignal): Promise<SpinReceipt | null>;
  /** Current balance as the house sees it. */
  balance(signal?: AbortSignal): Promise<number>;
}

/**
 * Checks a receipt from the house before anything is drawn: well formed, for the request we sent, and
 * internally consistent (the payout is what those stops pay for that bet). An incomplete or garbled
 * response is rejected instead of animated.
 */
export function parseReceipt(raw: unknown, expect?: SpinRequest): SpinReceipt {
  if (!raw || typeof raw !== 'object') throw new SpinError('bad_response', 'not an object');
  const r = raw as Record<string, unknown>;
  const { requestId, machine, bet, draws, payout, balance, at } = r;
  if (!isRequestId(requestId) || !isMachineId(machine)) throw new SpinError('bad_response', 'bad fields');
  const m = MACHINES[machine];
  if (!isValidBetFor(m, bet) || !isValidDraws(m, draws)) throw new SpinError('bad_response', 'bad round');
  if (typeof payout !== 'number' || !Number.isInteger(payout) || payout < 0 || payout > bet * m.maxWin) throw new SpinError('bad_response', 'bad payout');
  if (typeof balance !== 'number' || !Number.isInteger(balance) || balance < 0) throw new SpinError('bad_response', 'bad balance');
  let settled: number;
  try {
    settled = settleRound(m, bet, draws).payout;
  } catch {
    throw new SpinError('bad_response', 'inconsistent round');
  }
  if (settled !== payout) throw new SpinError('bad_response', 'payout does not match the round');
  if (expect && (expect.requestId.toLowerCase() !== requestId.toLowerCase() || expect.machine !== machine || expect.bet !== bet)) throw new SpinError('bad_response', 'receipt for another request');
  const copy: RoundDraws = JSON.parse(JSON.stringify(draws));
  return { requestId, machine, bet, draws: copy, payout, balance, at: typeof at === 'number' && Number.isFinite(at) ? at : Date.now() };
}

/** RFC 4122 v4 id from the crypto generator (randomUUID is missing on older browsers and insecure origins). */
export function newRequestId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });

export interface SpinAttemptOptions {
  /** Total tries (first request + retries). */
  attempts?: number;
  /** Delay before retry n (0-based). */
  backoffMs?: (n: number) => number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: SpinError) => void;
}

/**
 * Sends a spin and, when the answer is lost (timeout, dropped connection, 5xx, garbled response), asks
 * the house whether it booked that request id before trying again with the SAME id. Because the house is
 * idempotent on the id, this can never charge twice or pay twice. Definite refusals (no funds, bad bet,
 * conflict) are thrown at once. After the last try the uncertain error is thrown: the caller keeps the
 * id and recovers the real result later instead of guessing.
 */
export async function spinWithRecovery(service: SlotService, req: SpinRequest, opts: SpinAttemptOptions = {}): Promise<SpinReceipt> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs ?? ((n) => 600 * 2 ** n);
  let last: SpinError = new SpinError('network');
  for (let n = 0; n < attempts; n++) {
    if (n > 0) {
      await sleep(backoff(n - 1), opts.signal);
      try {
        const booked = await service.lookup(req.requestId, opts.signal);
        if (booked) return parseReceipt(booked, req);
      } catch (e) {
        const err = asSpinError(e);
        if (opts.signal?.aborted) throw err;
        last = err;
        opts.onRetry?.(n, err);
        continue;
      }
    }
    try {
      return parseReceipt(await service.spin(req, opts.signal), req);
    } catch (e) {
      const err = asSpinError(e);
      if (!err.uncertain || opts.signal?.aborted) throw err;
      last = err;
      opts.onRetry?.(n + 1, err);
    }
  }
  throw last;
}

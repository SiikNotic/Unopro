// Pure pieces of the Bank: the server's status shape, the countdown clock and the ad button machine.

export type BankHistoryKind = 'loan' | 'loan_repay' | 'ad_reward' | 'ad_rejected';
/** A loan: 'outstanding' (to be paid back), 'repaid', 'settled' (nothing owed). Others: 'done' or why an ad was refused. */
export type BankHistoryStatus = 'outstanding' | 'repaid' | 'settled' | 'done' | 'daily_cap' | 'banned' | 'not_registered' | 'rejected';

export interface BankHistoryItem {
  kind: BankHistoryKind;
  id: number;
  amount: number;
  at: string;
  status: BankHistoryStatus;
  availableAt: string | null;
}

export type LoanStatus = 'outstanding' | 'repaid' | 'settled';
/** Why the server would (not) grant a loan right now. */
export type LoanEligibility = 'ok' | 'not_registered' | 'banned' | 'outstanding' | 'cooldown' | 'balance';

export interface BankLoan {
  id: number;
  amount: number;
  claimedAt: string;
  availableAt: string;
  status: LoanStatus;
  repaidAt: string | null;
}

export interface BankStatus {
  serverNow: string;
  registered: boolean;
  banned: boolean;
  /** The account balance as the server read it (the wallet shown on screen stays the source for the UI). */
  balance: number;
  loanAmount: number;
  loanCooldownHours: number;
  /** A loan is only granted while the balance is below this. */
  loanMaxBalance: number;
  loanRequiresRepayment: boolean;
  loanEligibility: LoanEligibility;
  adAmount: number;
  adDailyCap: number;
  adToday: number;
  /** Newest granted ad reward (null = none): a higher value after an ad means the server paid it. */
  lastAdRewardId: number | null;
  loan: BankLoan | null;
  history: BankHistoryItem[];
}

/** The open loan, if the player owes one. */
export const openLoan = (s: BankStatus | null): BankLoan | null => (s?.loan && s.loan.status === 'outstanding' ? s.loan : null);

/**
 * A clock anchored to the server: `serverNow` read at `perfAt` (performance.now()). Moving the phone's
 * date or time changes nothing here, because only the monotonic performance clock advances it. The
 * server re-checks the cooldown anyway; this only draws the countdown.
 */
export interface ServerClock {
  serverMs: number;
  perfAt: number;
}

export function serverClock(serverNow: string, perfAt: number): ServerClock {
  return { serverMs: Date.parse(serverNow), perfAt };
}

export function serverTimeAt(clock: ServerClock, perfNow: number): number {
  return clock.serverMs + Math.max(0, perfNow - clock.perfAt);
}

/** Milliseconds until the loan is available again (0 = available). */
export function loanRemainingMs(availableAt: string | null | undefined, clock: ServerClock | null, perfNow: number): number {
  if (!availableAt || !clock) return 0;
  const at = Date.parse(availableAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - serverTimeAt(clock, perfNow));
}

/** "23:59:07". Rounded up, so it never shows 00:00:00 while still locked. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Share of the cooldown already elapsed, 0–1 (for the progress ring). */
export function cooldownProgress(remainingMs: number, cooldownHours: number): number {
  const total = cooldownHours * 3600 * 1000;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs / total));
}

/**
 * What the loan card shows. The server re-checks everything on the request; this only keeps the button
 * honest (it doesn't offer a loan the server would refuse).
 */
export type LoanView = 'locked' | 'outstanding' | 'cooldown' | 'balance' | 'available';

export function loanView(s: BankStatus | null, remainingMs: number): LoanView {
  if (!s || !s.registered || s.banned) return 'locked';
  if (s.loanRequiresRepayment && openLoan(s)) return 'outstanding';
  if (remainingMs > 0) return 'cooldown';
  // A cooldown that ended on screen since the last read: available unless the balance says otherwise.
  if (s.loanEligibility === 'balance') return 'balance';
  if (s.loanEligibility === 'outstanding') return 'outstanding';
  if (s.loanEligibility === 'not_registered' || s.loanEligibility === 'banned') return 'locked';
  return 'available';
}

// ----- The rewarded-ad button -----

export type AdState = 'CHECKING' | 'AVAILABLE' | 'LOADING' | 'SHOWING_AD' | 'VERIFYING' | 'REWARDED' | 'UNAVAILABLE' | 'ERROR';

export type AdEvent =
  | { type: 'availability'; available: boolean }
  | { type: 'start' }
  | { type: 'shown' }
  | { type: 'completed' }
  | { type: 'cancelled' }
  | { type: 'failed' }
  | { type: 'confirmed' }
  | { type: 'unconfirmed' }
  | { type: 'reset' };

/** The ad button's state machine. The reward state is reached only after the SERVER confirmed it. */
export function adReducer(state: AdState, event: AdEvent): AdState {
  switch (event.type) {
    case 'availability':
      if (state === 'LOADING' || state === 'SHOWING_AD' || state === 'VERIFYING') return state;
      return event.available ? 'AVAILABLE' : 'UNAVAILABLE';
    case 'start':
      return state === 'AVAILABLE' ? 'LOADING' : state;
    case 'shown':
      return state === 'LOADING' ? 'SHOWING_AD' : state;
    case 'completed':
      return state === 'SHOWING_AD' || state === 'LOADING' ? 'VERIFYING' : state;
    case 'cancelled':
      return state === 'SHOWING_AD' || state === 'LOADING' ? 'AVAILABLE' : state;
    case 'failed':
      return state === 'SHOWING_AD' || state === 'LOADING' ? 'ERROR' : state;
    case 'confirmed':
      return state === 'VERIFYING' ? 'REWARDED' : state;
    case 'unconfirmed':
      return state === 'VERIFYING' ? 'ERROR' : state;
    case 'reset':
      return state === 'REWARDED' || state === 'ERROR' ? 'CHECKING' : state;
  }
}

/** Whether the ad button can be pressed in this state. */
export const adCanStart = (s: AdState) => s === 'AVAILABLE';

// ----- An ad whose reward was still being confirmed when the page closed -----

const PENDING_KEY = 'carta.bank.adPending';
const PENDING_MS = 3 * 60 * 1000;

export interface PendingAd {
  /** The newest granted reward id before the ad (null = none). */
  before: number | null;
  /** Wall-clock time it was saved (only used to forget it after a few minutes). */
  at: number;
}

/**
 * Remembered in this tab only (sessionStorage) so a refresh during "confirming" can still show the reward the
 * server grants. It never grants anything: the Bank shows a reward only when the server's reward id grows.
 */
export function savePendingAd(before: number | null, now = Date.now(), store: Storage | null = safeSession()): void {
  try {
    store?.setItem(PENDING_KEY, JSON.stringify({ before, at: now }));
  } catch {
    /* storage blocked: the balance still updates from the server */
  }
}

export function readPendingAd(now = Date.now(), store: Storage | null = safeSession()): PendingAd | null {
  try {
    const raw = store?.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingAd;
    if (typeof p?.at !== 'number' || now - p.at > PENDING_MS || now < p.at) {
      store?.removeItem(PENDING_KEY);
      return null;
    }
    return { before: typeof p.before === 'number' ? p.before : null, at: p.at };
  } catch {
    return null;
  }
}

export function clearPendingAd(store: Storage | null = safeSession()): void {
  try {
    store?.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the server has granted a reward newer than the one known before the ad. */
export const adRewardArrived = (before: number | null, latest: number | null) => latest !== null && (before === null || latest > before);

function safeSession(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

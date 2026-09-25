// Pure pieces of the Bank: the server's status shape, the countdown clock and the ad button machine.

export interface BankHistoryItem {
  kind: 'loan' | 'ad_reward';
  id: number;
  amount: number;
  at: string;
  availableAt: string | null;
}

export interface BankStatus {
  serverNow: string;
  registered: boolean;
  banned: boolean;
  loanAmount: number;
  loanCooldownHours: number;
  adAmount: number;
  adDailyCap: number;
  adToday: number;
  loan: { claimedAt: string; availableAt: string } | null;
  history: BankHistoryItem[];
}

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

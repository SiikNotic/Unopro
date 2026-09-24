// Virtual chips shared by every casino game. No real money: chips only live in this browser.

export const STARTING_CHIPS = 1000;
export const REFILL_CHIPS = 1000;
/** A free refill is offered once the balance can no longer cover the smallest bet. */
export const MIN_BET = 10;

export function normalizeBalance(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : STARTING_CHIPS;
}

export function canRefill(balance: number): boolean {
  return balance < MIN_BET;
}

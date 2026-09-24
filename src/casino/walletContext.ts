import { createContext } from 'react';
import type { CasinoGame, HistoryEntry, WalletStats } from './ledger';

export interface WalletContextValue {
  balance: number;
  canRefill: boolean;
  /** Free refill, only while the balance can't cover the smallest bet. */
  refill: () => void;
  history: HistoryEntry[];
  stats: WalletStats;
  /** Takes the stake and opens a round. Returns its id, or null when the bet is refused. */
  startRound: (game: CasinoGame, stake: number, payout: number | null) => string | null;
  /** Adds to an open round's stake (blackjack double/split). */
  raiseStake: (id: string, extra: number) => boolean;
  /** Pays a round once; later calls with the same id credit nothing. Returns what was credited. */
  settleRound: (id: string, payout?: number | null) => number;
  isOpen: (id: string) => boolean;
  /** Stake of an open round (what the wallet actually took), or null when it isn't open. */
  openStake: (id: string) => number | null;
}

/** Fired by Settings → reset so the wallet drops its in-memory copy along with storage. */
export const WALLET_RESET_EVENT = 'carta:wallet-reset';

export const WalletContext = createContext<WalletContextValue | null>(null);

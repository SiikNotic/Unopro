// What the browser and the `casino` edge function say to each other when a registered player plays for
// account coins. The browser only ever sends what the player wants to do (a bet, an action); the server
// draws, pays and books, and answers with what happened and the new balance.
import type { Bet } from '../roulette';
import type { Hand, HandResult, Phase } from '../blackjack';
import type { PlayingCard } from '../cards';

export type CasinoErrorCode =
  | 'unauthorized'
  /** A guest (anonymous session) or an account whose email isn't confirmed yet. */
  | 'account_required'
  | 'insufficient_funds'
  | 'invalid_bet'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  /** The owner took this game out of service (see the game_control_stakes migration). */
  | 'game_disabled'
  | 'server';

export interface AccountInfo {
  balance: number;
  bonusClaimed: boolean;
  registered: boolean;
  /** The guest wallet was already moved into this account (or the chance was used). */
  migrated?: boolean;
}

export interface RouletteResult {
  requestId: string;
  pocket: number;
  stake: number;
  payout: number;
  balance: number;
}

export interface SlotsResult {
  requestId: string;
  stops: number[];
  lines: number;
  betPerLine: number;
  payout: number;
  balance: number;
}

/** A blackjack table as the player may see it: no shoe, and the dealer's hole card hidden while playing. */
export interface BlackjackView {
  requestId: string;
  phase: Phase;
  hands: Hand[];
  active: number;
  /** The hole card is null until the round is settled. */
  dealer: (PlayingCard | null)[];
  results: HandResult[];
  /** Everything staked on this round so far (bet, doubles, split). */
  stake: number;
  balance: number;
}

export type CasinoRequest =
  | { op: 'account' }
  | { op: 'claim'; requestId: string }
  | { op: 'roulette'; requestId: string; bets: Bet[] }
  | { op: 'slots'; requestId: string; lines: number; betPerLine: number }
  | { op: 'bj' }
  | { op: 'bj_deal'; requestId: string; bet: number }
  | { op: 'bj_act'; requestId: string; action: 'hit' | 'stand' | 'double' | 'split' };

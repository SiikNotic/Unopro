// Helpers shared by the staff dashboard's sections (hooks, constants and formatting).
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AuditRow } from './api';
import type { ControlledGame } from '@/games/availability';
import { CONTROLLED_GAMES } from '@/games/availability';

/** Loads data and reloads when `deps` change; a stale answer never overwrites a newer one. */
export function useLoader<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; code: string }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    void fn().then((r) => {
      if (mine !== seq.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs explicitly
  }, deps);
  return { data, error };
}

export const PERIODS = [1, 7, 30] as const;
export type Period = (typeof PERIODS)[number];

/** A game or ledger code as words ("horse" → "Horse Racing", "admin_add" → "Staff adjustment (+)"). */
export function useGameName() {
  const { t } = useI18n();
  return (code: string) => t(`staff.ledger.${code}`);
}

/** Realised return to player (paid ÷ staked), as a percentage string. */
export const rtpText = (paid: number, staked: number) => (staked > 0 ? `${((paid / staked) * 100).toFixed(1)} %` : '—');

export const AUDIT_ACTIONS: AuditRow['action'][] = ['ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'ROLE_CHANGE', 'USERNAME_CHANGE', 'GAME_AVAILABILITY', 'HORSE_CONFIG', 'BANK_CONFIG', 'GUEST_MIGRATION'];

/** The ledger codes that belong to each game shown in Staff → Games (the slot machines count both kinds). */
export const GAME_LEDGER: Record<ControlledGame, string[]> = {
  slots: ['slots', 'premium'],
  domino: ['domino'],
  carta: ['carta'],
  bingo: ['bingo'],
  blackjack: ['blackjack'],
  roulette: ['roulette'],
  poker: [],
  crash: ['crash'],
  horse: ['horse'],
  airhockey: ['airhockey'],
};

/** The game a ledger code belongs to ("premium" → "slots"). */
export const gameOfLedger = (code: string): ControlledGame | null => CONTROLLED_GAMES.find((g) => GAME_LEDGER[g].includes(code)) ?? null;

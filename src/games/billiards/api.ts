// Statistics of 8-Ball (billiards_stats). Online games are counted by the database from the server's own
// result; games against the computer are reported here (they never pay coins). Signed-in players only, so
// no anonymous session is created just for statistics.
import { rpc } from '@/account/rpc';
import type { BotLevel } from './ai';

export interface BilliardsStats {
  played: number;
  wins: number;
  losses: number;
  botWins: number;
  onlineWins: number;
  potted: number;
  fouls: number;
  streak: number;
  bestStreak: number;
}

const KEYS: (keyof BilliardsStats)[] = ['played', 'wins', 'losses', 'botWins', 'onlineWins', 'potted', 'fouls', 'streak', 'bestStreak'];

export function parseStats(raw: unknown): BilliardsStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out = {} as BilliardsStats;
  for (const k of KEYS) {
    const v = Number(r[k]);
    out[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return out;
}

export async function myStats(): Promise<BilliardsStats | null> {
  const res = await rpc<unknown>('billiards_my_stats');
  return res.ok ? parseStats(res.data) : null;
}

export async function recordBotGame(level: BotLevel, won: boolean, potted: number, fouls: number, shots: number): Promise<BilliardsStats | null> {
  const res = await rpc<unknown>('billiards_record_bot', {
    p_level: level,
    p_won: won,
    p_potted: Math.max(0, Math.min(7, Math.round(potted))),
    p_fouls: Math.max(0, Math.min(200, Math.round(fouls))),
    p_shots: Math.max(1, Math.min(600, Math.round(shots))),
  });
  return res.ok ? parseStats(res.data) : null;
}

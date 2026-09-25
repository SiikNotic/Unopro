// The signed-in player's latest rounds, read straight from the account ledger (RLS lets a player read
// only their own rows; nobody can write them from a browser).
import { useEffect, useState } from 'react';
import { onlineConfig, tokenFor } from '@/games/online/client';

export interface LedgerEntry {
  id: string;
  game: 'bonus' | 'premium' | 'roulette' | 'slots' | 'blackjack' | 'guest_migration' | 'admin_add' | 'admin_remove' | 'loan' | 'ad_reward';
  stake: number;
  payout: number;
  at: number;
}

export function useAccountHistory(enabled: boolean, limit = 50): { entries: LedgerEntry[] | null; failed: boolean } {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const cfg = onlineConfig();
    if (!enabled || !cfg) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await tokenFor(cfg);
        if (!token) throw new Error('no token');
        const res = await fetch(`${cfg.base}/rest/v1/account_ledger?select=request_id,game,stake,payout,created_at&order=created_at.desc&limit=${limit}`, {
          headers: { apikey: cfg.apiKey, authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as { request_id: string; game: LedgerEntry['game']; stake: number; payout: number; created_at: string }[];
        if (!cancelled) setEntries(rows.map((r) => ({ id: r.request_id, game: r.game, stake: Number(r.stake), payout: Number(r.payout), at: Date.parse(r.created_at) })));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, limit]);
  return { entries, failed };
}

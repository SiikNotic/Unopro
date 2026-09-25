import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/account/useAccount';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import type { RoomView } from '@/games/online/protocol';

/**
 * A coin table's room: live view, a clock aligned to the server's (for the countdowns), and the account
 * balance kept in step with what the server reports after each bet or payout.
 */
export function useCoinTable(code: string) {
  const room = useOnlineRoom(code);
  const account = useAccount();
  const v: RoomView | null = room.view;
  const offset = useRef(0);
  useEffect(() => {
    if (v) offset.current = v.serverNow - Date.now();
  }, [v]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const { setBalance, refreshCoins } = account;
  useEffect(() => {
    if (v?.balance !== null && v?.balance !== undefined) setBalance(v.balance);
  }, [v?.balance, v?.version, setBalance]);
  // A new round: re-read the balance (payouts made by another player's request).
  const round = v?.blackjack?.round ?? v?.roulette?.round;
  useEffect(() => {
    if (round) void refreshCoins();
  }, [round, refreshCoins]);
  const serverNow = now + offset.current;
  const secondsTo = (deadline: number | null | undefined) => (deadline ? Math.max(0, Math.ceil((deadline - serverNow) / 1000)) : null);
  return { room, view: v, serverNow, secondsTo, balance: account.coins?.balance ?? 0 };
}

import { useProfileName } from '@/settings/profile';
import { useAccount } from './useAccount';
import { playerNameFor } from './username';

/** The name the games show: the account's username when signed in, else this device's guest name. */
export function usePlayerName(): string {
  const account = useAccount();
  const [local] = useProfileName();
  return playerNameFor(account.status, account.profile?.username ?? null, local);
}

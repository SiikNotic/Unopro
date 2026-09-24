import { useContext } from 'react';
import { AccountContext } from './accountContext';
import type { AccountContextValue } from './accountContext';

const OFF: AccountContextValue = {
  status: 'off',
  user: null,
  coins: null,
  coinsError: false,
  profile: null,
  ban: null,
  setUsername: async () => ({ ok: false, code: 'server', detail: '' }),
  notice: null,
  dismissNotice: () => {},
  recovering: false,
  signIn: async () => {},
  signUp: async () => 'check_email',
  signInWith: async () => {},
  signOut: async () => {},
  resendConfirmation: async () => {},
  sendPasswordReset: async () => {},
  updatePassword: async () => {},
  cancelRecovery: () => {},
  refreshCoins: async () => {},
  setBalance: () => {},
  claimBonus: async () => {},
};

/** The account (outside the provider, e.g. in tests: no server, guest-only). */
export function useAccount(): AccountContextValue {
  return useContext(AccountContext) ?? OFF;
}

/** True when the casino plays for the signed-in player's account coins. */
export function useAccountCoins(): boolean {
  return useAccount().status === 'user';
}

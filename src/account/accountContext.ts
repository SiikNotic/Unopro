import { createContext } from 'react';
import type { AccountUser, AuthErrorCode, OAuthProvider } from './authApi';
import type { AccountInfo } from '@/casino/server/protocol';

export type AccountStatus = 'off' | 'loading' | 'guest' | 'user';

export type AccountNotice =
  | { kind: 'bonus'; amount: number }
  | { kind: 'welcome'; name: string | null }
  | { kind: 'confirmed' }
  | { kind: 'signedOut' }
  | { kind: 'passwordChanged' }
  | { kind: 'error'; code: AuthErrorCode | 'link' };

export interface AccountContextValue {
  /** 'off' when the build has no server (everything stays local, as before). */
  status: AccountStatus;
  user: AccountUser | null;
  /** The signed-in player's account coins (null while loading or if the server can't be reached). */
  coins: AccountInfo | null;
  coinsError: boolean;
  notice: AccountNotice | null;
  dismissNotice: () => void;
  /** True after following a password-reset link: the app asks for the new password. */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** 'signed_in' when the project doesn't ask to confirm emails, else 'check_email'. */
  signUp: (email: string, password: string, name: string) => Promise<'signed_in' | 'check_email'>;
  signInWith: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  cancelRecovery: () => void;
  refreshCoins: () => Promise<void>;
  /** A game reports the balance the server answered with. */
  setBalance: (balance: number) => void;
  claimBonus: () => Promise<void>;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

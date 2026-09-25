import { createContext } from 'react';
import type { AccountUser, AuthErrorCode, OAuthProvider } from './authApi';
import type { AccountInfo } from '@/casino/server/protocol';
import type { RpcResult } from './rpc';

export type Role = 'user' | 'staff' | 'admin' | 'owner';
export const ROLE_RANK: Record<Role, number> = { user: 0, staff: 1, admin: 2, owner: 3 };

export interface AccountProfile {
  userId: string;
  username: string | null;
  /** As stored in the database. The screens use it only to decide what to show; the server checks it again. */
  role: Role;
}

export interface AccountBan {
  reason: string;
  kind: 'temporary' | 'permanent';
  expiresAt: string | null;
  since: string;
}

export type AccountStatus = 'off' | 'loading' | 'guest' | 'user';

export type AccountNotice =
  | { kind: 'bonus'; amount: number; migrated: number; capped: boolean }
  | { kind: 'migrated'; migrated: number; capped: boolean }
  | { kind: 'coinsAdjusted'; amount: number }
  | { kind: 'usernameChanged'; username: string }
  | { kind: 'welcome'; name: string | null }
  | { kind: 'confirmed' }
  | { kind: 'signedOut' }
  | { kind: 'accountDeleted' }
  | { kind: 'passwordChanged' }
  | { kind: 'error'; code: AuthErrorCode | 'link' };

export interface AccountContextValue {
  /** 'off' when the build has no server (everything stays local, as before). */
  status: AccountStatus;
  user: AccountUser | null;
  /** The signed-in player's account coins (null while loading or if the server can't be reached). */
  coins: AccountInfo | null;
  coinsError: boolean;
  profile: AccountProfile | null;
  /** Set while the account is suspended (read from the server). */
  ban: AccountBan | null;
  /** Changes the display name (unique, checked by the database). */
  setUsername: (name: string) => Promise<RpcResult<string>>;
  notice: AccountNotice | null;
  dismissNotice: () => void;
  /** True after following a password-reset link: the app asks for the new password. */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** 'signed_in' when the project doesn't ask to confirm emails, else 'check_email'. */
  signUp: (email: string, password: string, name: string) => Promise<'signed_in' | 'check_email'>;
  signInWith: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** Deletes the signed-in account and its data on the server (the owner can't). */
  deleteAccount: () => Promise<{ ok: boolean; code?: string }>;
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

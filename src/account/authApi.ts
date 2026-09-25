// Registration and sign-in against Supabase Auth (GoTrue) without the SDK: email + password, and Google /
// Discord through the PKCE flow (the browser keeps a one-time secret; the code that comes back in the
// URL is useless without it). The session is stored where the guest session lived, so online rooms and
// the casino server see the signed-in player from then on.
import { captchaField, captchaToken } from './captcha';
import { storage } from '@/storage';
import { SESSION_KEY } from '@/casino/premium/anonAuth';

export interface AuthConfig {
  /** https://<project>.supabase.co/auth/v1 */
  authUrl: string;
  apiKey: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
}

export type OAuthProvider = 'google' | 'discord';

export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string;
  anonymous: boolean;
  confirmed: boolean;
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_exists'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'provider_disabled'
  | 'signups_disabled'
  | 'captcha'
  | 'banned'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

/** Fired on this tab whenever the stored session changes (sign-in, sign-out). Other tabs get `storage`. */
export const SESSION_EVENT = 'carta:session';

const PKCE_KEY = 'carta.auth.pkce';
export const PASSWORD_MIN = 8;

export function readSession(): Session | null {
  const s = storage.get<Partial<Session>>(SESSION_KEY);
  return s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && typeof s.expires_at === 'number' ? (s as Session) : null;
}

export function saveSession(s: Session | null) {
  if (s) storage.set(SESSION_KEY, s);
  else storage.remove(SESSION_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EVENT));
}

function toSession(data: Record<string, unknown>, nowSec: number): Session | null {
  const s = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : nowSec + (typeof data.expires_in === 'number' ? data.expires_in : 3600),
  };
  return typeof s.access_token === 'string' && typeof s.refresh_token === 'string' ? (s as Session) : null;
}

/** GoTrue's error answers, reduced to what the screen can explain. */
export function authErrorOf(status: number, body: unknown): AuthError {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = String(b.error_code ?? b.code ?? b.error ?? '');
  const msg = String(b.msg ?? b.message ?? b.error_description ?? '').toLowerCase();
  if (code === 'user_banned' || msg.includes('banned')) return new AuthError('banned');
  if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return new AuthError('rate_limited');
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return new AuthError('email_not_confirmed');
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return new AuthError('user_exists');
  if (code === 'weak_password' || msg.includes('password should')) return new AuthError('weak_password');
  if (code === 'email_address_invalid' || code === 'validation_failed' || msg.includes('invalid format')) return new AuthError('invalid_email');
  if (code === 'invalid_credentials' || code === 'invalid_grant' || msg.includes('invalid login')) return new AuthError('invalid_credentials');
  if (code === 'captcha_failed' || msg.includes('captcha')) return new AuthError('captcha');
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return new AuthError('signups_disabled');
  if (code === 'provider_disabled' || code === 'validation_failed' || msg.includes('provider is not enabled')) return new AuthError('provider_disabled');
  return new AuthError('unknown');
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh PKCE verifier (kept in this browser until the redirect comes back) and its S256 challenge. */
export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  storage.set(PKCE_KEY, verifier);
  return { verifier, challenge: b64url(digest) };
}

export const takePkceVerifier = (): string | null => {
  const v = storage.get<string>(PKCE_KEY);
  storage.remove(PKCE_KEY);
  return typeof v === 'string' ? v : null;
};

/** The Android app's own link: Supabase sends the player back into the app (intent filter in AndroidManifest). */
export const NATIVE_RETURN_URL = 'io.github.siiknotic.carta://auth';

/** True inside the Android app (Capacitor), false in a browser. */
export const isNativeApp = (): boolean => !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/**
 * Where Supabase sends the player back: this page, without any query or hash; inside the app, the app's own
 * link (the app's pages are served from a local origin that doesn't exist on the web).
 */
export const appReturnUrl = () => (isNativeApp() ? NATIVE_RETURN_URL : `${window.location.origin}${window.location.pathname}`);

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function createAuthApi(
  cfg: AuthConfig,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  now: () => number = Date.now,
  captcha: () => Promise<string | undefined> = captchaToken
) {
  const nowSec = () => Math.floor(now() / 1000);

  async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.authUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', apikey: cfg.apiKey, ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      });
    } catch {
      throw new AuthError('network');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw authErrorOf(res.status, body);
    return body;
  }

  /** Bot protection (only when CAPTCHA is configured): a solve that fails reads as its own error. */
  async function human(): Promise<Awaited<ReturnType<typeof captchaField>>> {
    try {
      return await captchaField(captcha);
    } catch {
      throw new AuthError('captcha');
    }
  }

  const sessionFrom = (body: unknown) => (body && typeof body === 'object' ? toSession(body as Record<string, unknown>, nowSec()) : null);

  return {
    /** Creates an account. Returns a session only when the project doesn't ask to confirm the email. */
    async signUp(email: string, password: string, name: string): Promise<{ session: Session | null }> {
      const { challenge } = await newPkce();
      const body = await call(`/signup?redirect_to=${encodeURIComponent(appReturnUrl())}`, {
        method: 'POST',
        body: JSON.stringify({ email, password, data: { name }, code_challenge: challenge, code_challenge_method: 's256', ...(await human()) }),
      });
      const session = sessionFrom(body);
      // GoTrue answers an already-registered address with a fake user and no identities (so addresses
      // can't be probed); say it plainly instead of promising an email that won't come.
      const identities = (body as { identities?: unknown[]; user?: { identities?: unknown[] } } | null)?.identities ?? (body as { user?: { identities?: unknown[] } } | null)?.user?.identities;
      if (!session && Array.isArray(identities) && identities.length === 0) throw new AuthError('user_exists');
      return { session };
    },

    async signIn(email: string, password: string): Promise<Session> {
      const s = sessionFrom(await call('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password, ...(await human()) }) }));
      if (!s) throw new AuthError('unknown');
      return s;
    },

    /** The URL to send the browser to for Google / Discord. */
    async oauthUrl(provider: OAuthProvider): Promise<string> {
      const { challenge } = await newPkce();
      const q = new URLSearchParams({ provider, redirect_to: appReturnUrl(), code_challenge: challenge, code_challenge_method: 's256' });
      return `${cfg.authUrl}/authorize?${q}`;
    },

    /** Trades the code from the return URL (OAuth, email confirmation, password reset) for a session. */
    async exchangeCode(code: string, verifier: string): Promise<Session> {
      const s = sessionFrom(await call('/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }) }));
      if (!s) throw new AuthError('unknown');
      return s;
    },

    async refresh(refreshToken: string): Promise<Session> {
      const s = sessionFrom(await call('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }));
      if (!s) throw new AuthError('unknown');
      return s;
    },

    async user(token: string): Promise<AccountUser> {
      const u = (await call('/user', { method: 'GET', token })) as Record<string, unknown>;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const app = (u.app_metadata ?? {}) as Record<string, unknown>;
      const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
      return {
        id: String(u.id),
        email: str(u.email),
        name: str(meta.name) ?? str(meta.full_name) ?? str(meta.global_name) ?? str(meta.user_name) ?? str(meta.preferred_username),
        avatar: str(meta.avatar_url) ?? str(meta.picture),
        provider: str(app.provider) ?? 'email',
        anonymous: u.is_anonymous === true,
        confirmed: typeof u.email_confirmed_at === 'string',
      };
    },

    async resendConfirmation(email: string): Promise<void> {
      await call(`/resend?redirect_to=${encodeURIComponent(appReturnUrl())}`, { method: 'POST', body: JSON.stringify({ type: 'signup', email, ...(await human()) }) });
    },

    async sendPasswordReset(email: string): Promise<void> {
      const { challenge } = await newPkce();
      // The marker in the return URL tells the app to ask for the new password after the exchange.
      await call(`/recover?redirect_to=${encodeURIComponent(`${appReturnUrl()}?reset=1`)}`, { method: 'POST', body: JSON.stringify({ email, code_challenge: challenge, code_challenge_method: 's256', ...(await human()) }) });
    },

    async updatePassword(token: string, password: string): Promise<void> {
      await call('/user', { method: 'PUT', token, body: JSON.stringify({ password }) });
    },

    async signOut(token: string): Promise<void> {
      await call('/logout?scope=local', { method: 'POST', token }).catch(() => undefined);
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;

/**
 * What the return URL carries after a redirect from Supabase: a PKCE `code` (sign-in, confirmation,
 * password reset), tokens in the hash (older implicit links), or an error.
 */
export function readAuthReturn(loc: { search: string; hash: string }): { code?: string; tokens?: Record<string, string>; recovery: boolean; error?: string } | null {
  const q = new URLSearchParams(loc.search);
  const h = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const error = q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error') ?? undefined;
  const recovery = q.get('reset') === '1' || q.get('type') === 'recovery' || h.get('type') === 'recovery';
  const code = q.get('code') ?? undefined;
  if (h.get('access_token') && h.get('refresh_token')) {
    const tokens: Record<string, string> = {};
    h.forEach((v, k) => (tokens[k] = v));
    return { tokens, recovery, error };
  }
  if (code || error) return { code, recovery, error };
  return null;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onlineConfig, tokenFor } from '@/games/online/client';
import { newId } from '@/casino/random';
import { SESSION_KEY } from '@/casino/premium/anonAuth';
import { storage } from '@/storage';
import type { AccountInfo } from '@/casino/server/protocol';
import { appReturnUrl, AuthError, createAuthApi, decodeJwt, readAuthReturn, readSession, saveSession, SESSION_EVENT, takePkceVerifier } from './authApi';
import type { AccountUser, OAuthProvider } from './authApi';
import { AccountContext } from './accountContext';
import type { AccountContextValue, AccountNotice, AccountStatus } from './accountContext';
import { casinoCall } from './casinoApi';

const asAuthError = (e: unknown) => (e instanceof AuthError ? e : new AuthError('unknown'));

/**
 * The player's account. Guests (no session, or an anonymous one used by online rooms) play as before
 * with the chips in this browser. A signed-in player with a confirmed email has account coins on the
 * server, and the 1,000-coin welcome credit is claimed for them the first time.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const cfg = useMemo(() => onlineConfig(), []);
  const api = useMemo(() => (cfg ? createAuthApi({ authUrl: `${cfg.base}/auth/v1`, apiKey: cfg.apiKey }) : null), [cfg]);
  const [status, setStatus] = useState<AccountStatus>(cfg ? 'loading' : 'off');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [coins, setCoins] = useState<AccountInfo | null>(null);
  const [coinsError, setCoinsError] = useState(false);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const [recovering, setRecovering] = useState(false);
  const loadSeq = useRef(0);

  const refreshCoins = useCallback(async () => {
    const res = await casinoCall<AccountInfo>({ op: 'account' }, cfg);
    if (res.ok) {
      setCoins(res.data);
      setCoinsError(false);
    } else setCoinsError(true);
  }, [cfg]);

  const claimBonus = useCallback(async () => {
    const res = await casinoCall<{ balance: number; granted: boolean }>({ op: 'claim', requestId: newId() }, cfg);
    if (!res.ok) return;
    setCoins((c) => ({ balance: res.data.balance, bonusClaimed: true, registered: c?.registered ?? true }));
    if (res.data.granted) setNotice({ kind: 'bonus', amount: 1000 });
  }, [cfg]);

  // Stable, and a no-op when nothing changed (games call it from effects).
  const setBalance = useCallback((balance: number) => setCoins((c) => (c && c.balance !== balance ? { ...c, balance } : c)), []);

  /** Reads the stored session and works out who is playing. */
  const load = useCallback(async () => {
    if (!cfg || !api) return;
    const seq = ++loadSeq.current;
    const saved = readSession();
    const claims = saved ? decodeJwt(saved.access_token) : null;
    if (!saved || claims?.is_anonymous === true) {
      setUser(null);
      setCoins(null);
      setStatus('guest');
      return;
    }
    let token = await tokenFor(cfg);
    if (!token) {
      // The refresh failed: for good (revoked) or just no network right now? Only the first signs out.
      try {
        const fresh = await api.refresh(saved.refresh_token);
        storage.set(SESSION_KEY, fresh);
        token = fresh.access_token;
      } catch (e) {
        if (asAuthError(e).code === 'network') {
          if (seq === loadSeq.current) {
            setStatus('user');
            setCoinsError(true);
          }
          return;
        }
      }
    }
    let u: AccountUser | null = null;
    if (token) {
      try {
        u = await api.user(token);
      } catch (e) {
        if (asAuthError(e).code === 'network') {
          // Offline: keep the session, show the account without coins until the server answers.
          u = null;
          if (seq === loadSeq.current) {
            setStatus('user');
            setCoinsError(true);
          }
          return;
        }
      }
    }
    if (seq !== loadSeq.current) return;
    if (!u || u.anonymous) {
      // The session was revoked or expired for good: back to guest.
      if (!u) saveSession(null);
      setUser(null);
      setCoins(null);
      setStatus('guest');
      return;
    }
    setUser(u);
    setStatus('user');
    const res = await casinoCall<AccountInfo>({ op: 'account' }, cfg);
    if (seq !== loadSeq.current) return;
    if (!res.ok) {
      setCoinsError(true);
      return;
    }
    setCoins(res.data);
    setCoinsError(false);
    if (res.data.registered && !res.data.bonusClaimed) await claimBonus();
  }, [cfg, api, claimBonus]);

  // Coming back from Google / Discord, an email confirmation or a password-reset link.
  useEffect(() => {
    if (!cfg || !api) return;
    const ret = readAuthReturn(window.location);
    const clean = () => window.history.replaceState(window.history.state, '', appReturnUrl());
    void (async () => {
      if (ret) {
        clean();
        try {
          if (ret.tokens) {
            const t = ret.tokens;
            saveSession({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Number(t.expires_at) || Math.floor(Date.now() / 1000) + Number(t.expires_in || 3600) });
            if (ret.recovery) setRecovering(true);
          } else if (ret.code) {
            const verifier = takePkceVerifier();
            if (verifier) {
              saveSession(await api.exchangeCode(ret.code, verifier));
              if (ret.recovery) setRecovering(true);
              else setNotice({ kind: 'welcome', name: null });
            } else {
              // Opened in another browser: the email is confirmed, but this browser must sign in.
              setNotice({ kind: 'confirmed' });
            }
          } else if (ret.error) setNotice({ kind: 'error', code: 'link' });
        } catch (e) {
          setNotice({ kind: 'error', code: asAuthError(e).code === 'network' ? 'network' : 'link' });
        }
      }
      await load();
    })();
  }, [cfg, api, load]);

  // Sign-in or sign-out in this tab or another one.
  useEffect(() => {
    if (!cfg) return;
    const onChange = () => void load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === SESSION_KEY) void load();
    };
    window.addEventListener(SESSION_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [cfg, load]);

  const value = useMemo<AccountContextValue>(() => {
    const need = () => {
      if (!api) throw new AuthError('unknown');
      return api;
    };
    return {
      status,
      user,
      coins,
      coinsError,
      notice,
      recovering,
      dismissNotice: () => setNotice(null),
      async signIn(email, password) {
        saveSession(await need().signIn(email.trim(), password));
      },
      async signUp(email, password, name) {
        const { session } = await need().signUp(email.trim(), password, name.trim());
        if (!session) return 'check_email';
        saveSession(session);
        return 'signed_in';
      },
      async signInWith(provider: OAuthProvider) {
        window.location.assign(await need().oauthUrl(provider));
      },
      async signOut() {
        const s = readSession();
        if (s && api) await api.signOut(s.access_token);
        saveSession(null);
        setNotice({ kind: 'signedOut' });
      },
      resendConfirmation: (email) => need().resendConfirmation(email.trim()),
      sendPasswordReset: (email) => need().sendPasswordReset(email.trim()),
      async updatePassword(password) {
        const token = cfg ? await tokenFor(cfg) : null;
        if (!token) throw new AuthError('invalid_credentials');
        await need().updatePassword(token, password);
        setRecovering(false);
        setNotice({ kind: 'passwordChanged' });
      },
      cancelRecovery: () => setRecovering(false),
      refreshCoins,
      setBalance,
      claimBonus,
    };
  }, [api, cfg, status, user, coins, coinsError, notice, recovering, refreshCoins, claimBonus, setBalance]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

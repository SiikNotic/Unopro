import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onlineConfig, tokenFor } from '@/games/online/client';
import { SESSION_KEY } from '@/casino/premium/anonAuth';
import { storage } from '@/storage';
import type { AccountInfo } from '@/casino/server/protocol';
import { AuthError, createAuthApi, decodeJwt, isNativeApp, NATIVE_RETURN_URL, readAuthReturn, readSession, saveSession, SESSION_EVENT, takePkceVerifier } from './authApi';
import type { AccountUser, OAuthProvider } from './authApi';
import { AccountContext } from './accountContext';
import type { AccountContextValue, AccountNotice, AccountStatus } from './accountContext';
import { rpc } from './rpc';
import type { RpcResult } from './rpc';
import { registerWithGuest } from './guest';
import type { RegisterResult } from './guest';
import { subscribeLive } from './live';
import type { AccountBan, AccountProfile, Role } from './accountContext';

interface MyAccount {
  userId: string;
  registered: boolean;
  username: string | null;
  role: Role;
  balance: number;
  bonusClaimed: boolean;
  migrated: boolean;
  ban: AccountBan | null;
}

/** The name a new profile starts from: the guest's local name, else the Google / Discord name. */
function suggestedName(user: AccountUser | null): string | null {
  const local = storage.get<{ name?: unknown }>('carta.profile')?.name;
  return (typeof local === 'string' && local.trim()) || user?.name || null;
}

const HEARTBEAT_MS = 2 * 60 * 1000;

/** A stored session that belongs to a registered player rather than an anonymous guest. */
function registeredSessionStored(): boolean {
  const s = readSession();
  return !!s && decodeJwt(s.access_token)?.is_anonymous !== true;
}

const asAuthError = (e: unknown) => (e instanceof AuthError ? e : new AuthError('unknown'));

/**
 * The player's account. Guests (no session, or an anonymous one used by online rooms) play as before
 * with the chips in this browser. A signed-in player with a confirmed email has account coins on the
 * server, and the 1,000-coin welcome credit is claimed for them the first time.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const cfg = useMemo(() => onlineConfig(), []);
  const api = useMemo(() => (cfg ? createAuthApi({ authUrl: `${cfg.base}/auth/v1`, apiKey: cfg.apiKey }) : null), [cfg]);
  // Known at once without the network: a guest (no session, or an anonymous one) plays right away; a
  // stored registered session means "loading" until the server confirms who it is.
  const [status, setStatus] = useState<AccountStatus>(() => (!cfg ? 'off' : registeredSessionStored() ? 'loading' : 'guest'));
  const [user, setUser] = useState<AccountUser | null>(null);
  const [coins, setCoins] = useState<AccountInfo | null>(null);
  const [coinsError, setCoinsError] = useState(false);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [ban, setBan] = useState<AccountBan | null>(null);
  const loadSeq = useRef(0);

  /** Reads balance, username, role and ban from the database (the only source of truth for them). */
  const readAccount = useCallback(async (): Promise<MyAccount | null> => {
    const res = await rpc<MyAccount | null>('my_account', {}, cfg);
    if (!res.ok || !res.data) {
      setCoinsError(true);
      return null;
    }
    const me = res.data;
    setCoins({ balance: me.balance, bonusClaimed: me.bonusClaimed, registered: me.registered, migrated: me.migrated });
    setProfile({ userId: me.userId, username: me.username, role: me.role });
    setBan(me.ban);
    setCoinsError(false);
    return me;
  }, [cfg]);

  const refreshCoins = useCallback(async () => {
    await readAccount();
  }, [readAccount]);

  /**
   * First sign-in of an account: moves this browser's guest chips in and grants the welcome credit,
   * in one database transaction. Safe to repeat: the database does each part at most once.
   */
  const claimBonus = useCallback(async () => {
    const r = await registerWithGuest((args) => rpc<RegisterResult[]>('account_register', args, cfg));
    if (!r) {
      // Nothing moved: the guest chips are still here; the next sign-in tries again.
      await readAccount();
      return;
    }
    const migrated = r.guest_status === 'already' ? 0 : Number(r.migrated);
    const capped = r.guest_status === 'capped';
    if (r.bonus_granted) setNotice({ kind: 'bonus', amount: 1000, migrated, capped });
    else if (migrated > 0) setNotice({ kind: 'migrated', migrated, capped });
    await readAccount();
  }, [cfg, readAccount]);

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
      setProfile(null);
      setBan(null);
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
      setProfile(null);
      setBan(null);
      setStatus('guest');
      return;
    }
    setUser(u);
    setStatus('user');
    if (!u.confirmed) return;
    await rpc('ensure_profile', { p_suggested: suggestedName(u) }, cfg);
    if (seq !== loadSeq.current) return;
    const me = await readAccount();
    if (seq !== loadSeq.current || !me) return;
    if (me.registered && !me.ban && (!me.bonusClaimed || !me.migrated)) await claimBonus();
  }, [cfg, api, claimBonus, readAccount]);

  /** Applies what a redirect from Supabase brought back (OAuth, email confirmation, password reset). */
  const applyReturn = useCallback(
    async (ret: NonNullable<ReturnType<typeof readAuthReturn>>) => {
      if (!api) return;
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
    },
    [api]
  );

  // Coming back from Google / Discord, an email confirmation or a password-reset link.
  useEffect(() => {
    if (!cfg || !api) return;
    const ret = readAuthReturn(window.location);
    void (async () => {
      if (ret) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
        await applyReturn(ret);
      }
      await load();
    })();
  }, [cfg, api, load, applyReturn]);

  // Inside the Android app the same links arrive as io.github.siiknotic.carta://auth?... (app already open,
  // or started by the link). The browser tab used for Google / Discord is closed.
  useEffect(() => {
    if (!cfg || !api || !isNativeApp()) return;
    let cancelled = false;
    let remove: (() => void) | null = null;
    const handle = async (url: string | undefined) => {
      if (!url || !url.startsWith(NATIVE_RETURN_URL)) return;
      const u = new URL(url);
      const ret = readAuthReturn({ search: u.search, hash: u.hash });
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
      if (!ret) return;
      await applyReturn(ret);
      await load();
    };
    void import('@capacitor/app').then(async ({ App }) => {
      const h = await App.addListener('appUrlOpen', (e) => void handle(e.url));
      if (cancelled) return void h.remove();
      remove = () => void h.remove();
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (!cancelled) void handle(launch?.url);
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [cfg, api, load, applyReturn]);

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

  // Presence: "seen recently" for the staff overview, while the app is open and visible.
  const userId = profile?.userId ?? null;
  useEffect(() => {
    if (!cfg || status !== 'user' || !userId) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void rpc('touch_presence', {}, cfg);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [cfg, status, userId]);

  // Live: coins staff add / remove, and a ban or unban, reach the player without a reload.
  useEffect(() => {
    if (!cfg || status !== 'user' || !userId) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const seen = new Set<string>();
    subscribeLive(
      cfg,
      `me-${userId}`,
      [
        { table: 'account_ledger', event: 'INSERT', filter: `user_id=eq.${userId}` },
        { table: 'account_bans', filter: `user_id=eq.${userId}` },
      ],
      (c) => {
        if (c.table === 'account_ledger' && c.row) {
          const id = String(c.row.id);
          if (seen.has(id)) return;
          seen.add(id);
          const game = c.row.game;
          // Game rounds are shown by the game itself when its animation ends.
          // Bank grants (a loan, or an ad reward confirmed by the provider's server callback).
          if (game === 'loan' || game === 'ad_reward') setBalance(Number(c.row.balance_after));
          // Multiplayer tables book bets and wins as they happen (from any player's request).
          if ((game === 'blackjack' || game === 'roulette') && (c.row.detail as { table?: boolean } | null)?.table) setBalance(Number(c.row.balance_after));
          if (game === 'admin_add' || game === 'admin_remove') {
            setBalance(Number(c.row.balance_after));
            setNotice({ kind: 'coinsAdjusted', amount: Number(c.row.payout) - Number(c.row.stake) });
          }
        } else if (c.table === 'account_bans') void readAccount();
      }
    )
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [cfg, status, userId, setBalance, readAccount]);

  const setUsername = useCallback(
    async (name: string): Promise<RpcResult<string>> => {
      const res = await rpc<string>('set_username', { p_name: name.trim() }, cfg);
      if (res.ok) {
        setProfile((p) => (p ? { ...p, username: res.data } : p));
        setNotice({ kind: 'usernameChanged', username: res.data });
      }
      return res;
    },
    [cfg]
  );

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
      profile,
      ban,
      setUsername,
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
        const url = await need().oauthUrl(provider);
        // Inside the app: Google and Discord open in the system browser (Google refuses sign-in inside an
        // embedded view) and come back through the app's link.
        if (isNativeApp()) await (await import('@capacitor/browser')).Browser.open({ url });
        else window.location.assign(url);
      },
      async signOut() {
        const s = readSession();
        if (s && api) await api.signOut(s.access_token);
        saveSession(null);
        setProfile(null);
        setBan(null);
        setNotice({ kind: 'signedOut' });
      },
      async deleteAccount() {
        const token = cfg ? await tokenFor(cfg) : null;
        if (!cfg || !token) return { ok: false, code: 'unauthorized' };
        try {
          const res = await fetch(`${cfg.base}/functions/v1/account`, {
            method: 'POST',
            headers: { apikey: cfg.apiKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ op: 'delete', confirm: true }),
          });
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
          if (!res.ok || !body.ok) return { ok: false, code: body.code ?? 'server' };
        } catch {
          return { ok: false, code: 'network' };
        }
        // The server removed the account: forget the session and this device's copy of its data.
        saveSession(null);
        setProfile(null);
        setBan(null);
        setNotice({ kind: 'accountDeleted' });
        return { ok: true };
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
  }, [api, cfg, status, user, coins, coinsError, profile, ban, setUsername, notice, recovering, refreshCoins, claimBonus, setBalance]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

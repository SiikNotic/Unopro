import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, ChevronRight, Cloud, Coins, Crown, Eye, EyeOff, Gamepad2, Gift, Link2, LogOut, Mail, MessageCircle, MonitorSmartphone, Play, UserRound, Users } from 'lucide-react';
import { LuxPage } from '@/screens/lux/LuxPage';
import { LUX_ART } from '@/screens/lux/art';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { DeleteAccount } from './DeleteAccount';
import { formatChips } from '@/casino/chipValues';
import { useAccount } from './useAccount';
import { AuthError, PASSWORD_MIN } from './authApi';
import type { AuthErrorCode, OAuthProvider } from './authApi';
import { UsernameEditor } from './UsernameEditor';
import { BanNotice } from './BanNotice';
import { ROLE_RANK } from './accountContext';
import { ConsentBox } from '@/legal/ConsentBox';
import { consentGiven, rememberConsent } from '@/legal/consent';
import type { Consent } from '@/legal/consent';
import './account.css';
import './signup.css';

/** The sign-up hero art (the file is optional: without it the screen keeps its lit backdrop). */
const HERO_ART = Object.values(import.meta.glob('./art/signup-hero.webp', { eager: true, import: 'default' }) as Record<string, string>)[0];
const DISCORD_BANNER = Object.values(import.meta.glob('./art/discord-banner.svg', { eager: true, import: 'default' }) as Record<string, string>)[0];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function DiscordLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 127.14 96.36" aria-hidden fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="ac-pass">
      <input id={id} className="ac-input" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={invalid || undefined} required minLength={PASSWORD_MIN} maxLength={72} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={t(shown ? 'account.hidePassword' : 'account.showPassword')} aria-pressed={shown}>
        {shown ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

/** "Únete y recibe 1,000 monedas" with the amount and what follows it in gold. */
const goldAmount = (text: string) => {
  const m = /(\d[\d.,]*.*)$/.exec(text);
  return m ? (
    <>
      {text.slice(0, m.index)}
      <b>{m[1]}</b>
    </>
  ) : (
    text
  );
};

const codeOf = (e: unknown): AuthErrorCode => (e instanceof AuthError ? e.code : 'unknown');

/**
 * Sign in or create an account (email, Google, Discord). Creating one (by email, or with Google / Discord,
 * which can create one) needs the 18+ confirmation and the acceptance of the legal texts.
 * `page` is the full-screen welcome (hero art beside the form on wide screens); `embedded` sits in a screen.
 */
export function SignInPanel({ variant = 'embedded' }: { variant?: 'page' | 'embedded' }) {
  const { t } = useI18n();
  const account = useAccount();
  const [tab, setTab] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'form' | OAuthProvider>(null);
  const [error, setError] = useState<AuthErrorCode | 'short_password' | 'bad_email' | null>(null);
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  const [resent, setResent] = useState(false);
  const [consent, setConsent] = useState<Consent>({ adult: false, terms: false });
  const [consentMissing, setConsentMissing] = useState(false);
  /** Creating an account needs both boxes; remembered so the server records it after the redirect. */
  const consented = () => {
    if (!consentGiven(consent)) {
      setConsentMissing(true);
      document.querySelector('.ac-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setConsentMissing(false);
    rememberConsent();
    return true;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email.trim())) return setError('bad_email');
    if (password.length < PASSWORD_MIN) return setError('short_password');
    if (tab === 'signup' && !consented()) return;
    setBusy('form');
    setError(null);
    try {
      if (tab === 'signin') await account.signIn(email, password);
      else if ((await account.signUp(email, password, name)) === 'check_email') setSent('confirm');
    } catch (err) {
      setError(codeOf(err));
    } finally {
      setBusy(null);
    }
  };

  const provider = async (p: OAuthProvider) => {
    if (!consented()) return;
    setBusy(p);
    setError(null);
    try {
      await account.signInWith(p);
    } catch (err) {
      setError(codeOf(err));
      setBusy(null);
    }
  };

  const forgot = async () => {
    if (!EMAIL_RE.test(email.trim())) return setError('bad_email');
    setBusy('form');
    setError(null);
    try {
      await account.sendPasswordReset(email);
      setSent('reset');
    } catch (err) {
      setError(codeOf(err));
    } finally {
      setBusy(null);
    }
  };

  if (sent) {
    return (
      <section className="cz-panel p-5 flex flex-col items-center text-center gap-3" aria-live="polite">
        <span className="w-14 h-14 rounded-2xl bg-[rgba(216,178,106,0.14)] border border-[rgba(216,178,106,0.4)] flex items-center justify-center">
          <Mail className="w-7 h-7 text-[var(--cz-gold)]" aria-hidden />
        </span>
        <h2 className="font-display font-extrabold text-xl text-white">{t(sent === 'confirm' ? 'account.checkEmail' : 'account.resetSent')}</h2>
        <p className="text-sm text-white/75 max-w-[36ch]">{t(sent === 'confirm' ? 'account.checkEmailText' : 'account.resetSentText', { email: email.trim() })}</p>
        <p className="text-xs text-[var(--cz-muted)] max-w-[40ch]">{t('account.sameBrowser')}</p>
        {sent === 'confirm' && (
          <button
            type="button"
            className="cz-btn cz-btn-secondary"
            disabled={resent}
            onClick={async () => {
              try {
                await account.resendConfirmation(email);
                setResent(true);
              } catch (err) {
                setError(codeOf(err));
              }
            }}
          >
            {t(resent ? 'account.resent' : 'account.resend')}
          </button>
        )}
        <button type="button" className="cz-btn cz-btn-quiet" onClick={() => { setSent(null); setTab('signin'); }}>
          {t('account.backToSignIn')}
        </button>
        {error && <p className="ac-error" role="alert">{t(`account.errors.${error}`)}</p>}
      </section>
    );
  }

  const signup = tab === 'signup';
  const switchTab = (k: 'signin' | 'signup') => {
    setTab(k);
    setError(null);
  };

  return (
    <section className={`su su-${variant}`}>
      <div className="su-hero">
        {HERO_ART && <img className="su-hero-art" src={HERO_ART} alt="" decoding="async" />}
        <div className="su-hero-shade" aria-hidden />
        <span className="su-logo" aria-label="Carta Casino">
          <Crown className="su-logo-crown" aria-hidden />
          <span className="su-logo-word">Carta</span>
          <span className="su-logo-sub">CASINO</span>
        </span>
        <div className="su-hero-copy">
          {signup && (
            <span className="su-chip">
              <Gift className="w-3.5 h-3.5" aria-hidden /> {t('account.bonusTag')}
            </span>
          )}
          <h2 className="su-title">{signup ? goldAmount(t('signup.title')) : t('signup.welcomeBack')}</h2>
        </div>
      </div>

      <div className="su-body">
        <ul className="su-perks">
          {([
            [Gamepad2, 'signup.perkPlay'],
            [Cloud, 'signup.perkCloud'],
            [MonitorSmartphone, 'signup.perkDevices'],
          ] as const).map(([Icon, key]) => (
            <li key={key}>
              <span className="su-perk-icon" aria-hidden>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <div className="su-providers">
          <button type="button" className="ac-provider ac-google su-provider-main" onClick={() => void provider('google')} disabled={!!busy} aria-busy={busy === 'google'}>
            <GoogleLogo /> {t('account.withGoogle')}
          </button>
          <button type="button" className="ac-provider ac-discord" onClick={() => void provider('discord')} disabled={!!busy} aria-busy={busy === 'discord'}>
            <DiscordLogo /> {t('account.withDiscord')}
          </button>
        </div>

        <div className="su-divider">{t(signup ? 'signup.orEmail' : 'signup.orEmailSignIn')}</div>

        <form className="su-form" onSubmit={submit} noValidate>
          {signup && (
            <div className="ac-field">
              <label htmlFor="ac-name">{t('account.name')}</label>
              <input id="ac-name" className="ac-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" placeholder={t('account.namePlaceholder')} />
            </div>
          )}
          <div className="ac-field">
            <label htmlFor="ac-email">{t('account.email')}</label>
            <input id="ac-email" className="ac-input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} aria-invalid={error === 'bad_email' || undefined} placeholder={t('signup.emailPlaceholder')} />
          </div>
          <div className="ac-field">
            <label htmlFor="ac-password">{t('account.password')}</label>
            <PasswordInput id="ac-password" value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} invalid={error === 'short_password' || error === 'weak_password'} />
            {signup && <p className="su-hint">{t('account.passwordHint', { n: PASSWORD_MIN })}</p>}
          </div>
          {error && (
            <p className="ac-error" role="alert">
              {t(`account.errors.${error}`)}
            </p>
          )}
          <button type="submit" className="su-submit" disabled={!!busy} aria-busy={busy === 'form'}>
            {!signup || busy === 'form' ? null : <Coins className="w-5 h-5" aria-hidden />}
            {busy === 'form' ? t('account.working') : t(signup ? 'account.createAccount' : 'account.signIn')}
          </button>
          {!signup && (
            <button type="button" className="su-text-btn self-center" onClick={() => void forgot()} disabled={!!busy}>
              {t('account.forgot')}
            </button>
          )}
        </form>

        <ConsentBox
          value={consent}
          onChange={(c) => {
            setConsent(c);
            if (consentGiven(c)) setConsentMissing(false);
          }}
          invalid={consentMissing}
        />

        <p className="su-switch">
          {t(signup ? 'signup.haveAccount' : 'signup.noAccount')}{' '}
          <button type="button" onClick={() => switchTab(signup ? 'signin' : 'signup')}>
            {t(signup ? 'account.signIn' : 'account.signUp')}
          </button>
        </p>
      </div>
    </section>
  );
}

/** The signed-in player, as a VIP profile: who, their coins, their name, the team panel, play, sign out. */
function AccountPanel() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const u = account.user;
  const [busy, setBusy] = useState(false);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordError, setDiscordError] = useState(false);
  const [avatarOk, setAvatarOk] = useState(true);
  const username = account.profile?.username ?? '';
  const shown = username || u?.name || u?.email || t('profile.guest');
  const role = account.profile?.role ?? 'user';
  const providerLabel = u?.provider === 'google' ? 'Google' : u?.provider === 'discord' ? 'Discord' : t('account.email');
  const discordLinked = u?.identities.some((identity) => identity.provider === 'discord') ?? false;
  // The profile card opens the name editor (the only editable part of the profile).
  const editName = () => {
    const input = document.getElementById('ac-username') as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  return (
    <div className="lx-stack">
      <button type="button" className="lx-card lx-profile" onClick={editName} disabled={!account.profile} aria-label={t('account.editProfile')}>
        <span className="lx-avatar">
          {u?.avatar && avatarOk ? <img src={u.avatar} alt="" referrerPolicy="no-referrer" onError={() => setAvatarOk(false)} /> : <b aria-hidden>{shown.slice(0, 1).toUpperCase()}</b>}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="lx-profile-name">{shown}</span>
          {username && <span className="lx-profile-handle">@{username}</span>}
          {u?.email && u.email !== shown && <span className="lx-profile-mail">{u.email}</span>}
          <span className="lx-badges">
            <span className="lx-badge">{providerLabel}</span>
            {role !== 'user' && <span className="lx-badge is-gold">{t(`account.roleLabel.${role}`)}</span>}
          </span>
        </span>
        {account.profile && <ChevronRight className="w-5 h-5 text-white/40 shrink-0" aria-hidden />}
      </button>

      <BanNotice />

      <section className="lx-coins" aria-labelledby="lx-coins-title">
        <span className={`lx-coins-art ${LUX_ART.coins ? '' : 'is-css'}`} aria-hidden>
          {LUX_ART.coins ? <img src={LUX_ART.coins} alt="" /> : <CoinPile />}
        </span>
        <h2 id="lx-coins-title" className="lx-coins-label">
          {t('account.coins')}
        </h2>
        <p className="lx-coins-amount">
          <Coins className="w-8 h-8" aria-hidden />
          <span className="cz-num" aria-live="polite">
            {account.coins ? formatChips(account.coins.balance) : '—'}
          </span>
        </p>
        {account.coins?.bonusClaimed ? (
          <p className="lx-coins-bonus">
            {LUX_ART.gift ? <img src={LUX_ART.gift} alt="" /> : <Gift className="w-4 h-4" aria-hidden />} {t('account.welcomeBonus')}
          </p>
        ) : (
          <p className="lx-coins-note">{account.coinsError ? t('account.coinsError') : t('account.bonusPending')}</p>
        )}
        {account.coinsError && (
          <button type="button" className="lx-btn lx-btn-ghost lx-btn-sm" onClick={() => void account.refreshCoins()}>
            {t('account.retry')}
          </button>
        )}
        {account.coins && !account.coins.bonusClaimed && account.coins.registered && (
          <button type="button" className="lx-btn lx-btn-gold lx-btn-sm" onClick={() => void account.claimBonus()}>
            <Gift className="w-4 h-4" aria-hidden /> {t('account.claim')}
          </button>
        )}
        <p className="lx-coins-note">{t('account.coinsCloud')}</p>
        <p className="lx-coins-fine">{t('account.coinsVirtual')}</p>
      </section>

      {account.profile && <UsernameEditor />}

      {discordLinked ? (
        <section className="overflow-hidden rounded-[28px] border border-[rgba(216,178,106,0.55)] bg-[#080a16] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <img src={DISCORD_BANNER} alt={t('profile.discordLinked')} className="block w-full h-auto" />
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-[28px] border border-[rgba(216,178,106,0.55)] bg-[radial-gradient(circle_at_15%_50%,rgba(88,101,242,.24),transparent_35%),linear-gradient(135deg,#080a16,#12152b_55%,#090914)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-[#5865F2]/15 blur-2xl" aria-hidden />
          <div className="relative flex items-center gap-4">
            <span className="w-14 h-14 shrink-0 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/40 flex items-center justify-center text-[#8ea1ff] shadow-[0_0_24px_rgba(88,101,242,.18)]">
              <DiscordLogo />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2">
                <span className="lx-row-title">Discord</span>
                <span className="text-[var(--cz-gold)]">✦</span>
              </span>
              <span className="lx-row-text">{t('profile.discordHint')}</span>
            </span>
            <button
              type="button"
              className="lx-btn lx-btn-gold lx-btn-sm shrink-0 inline-flex items-center gap-1.5"
              disabled={discordBusy}
              aria-busy={discordBusy}
              onClick={async () => {
                setDiscordBusy(true);
                setDiscordError(false);
                try {
                  await account.linkIdentity('discord');
                } catch {
                  setDiscordError(true);
                  setDiscordBusy(false);
                }
              }}
            >
              <Link2 className="w-4 h-4" aria-hidden />
              {t(discordBusy ? 'profile.discordConnecting' : 'profile.discordLink')}
            </button>
          </div>
          {discordError && <p className="relative mt-3 text-xs text-[#f3c4c8]" role="alert">{t('profile.discordError')}</p>}
        </section>
      )}

      {ROLE_RANK[role] >= 1 && (
        <button type="button" className="lx-card lx-nav-row" onClick={() => navigate('staff')}>
          <span className="lx-icon" aria-hidden>
            <Users className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="lx-row-title">{t('account.staffDashboard')}</span>
            <span className="lx-row-text">{t('account.staffHint')}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-white/40 shrink-0" aria-hidden />
        </button>
      )}

      <div className="lx-actions">
        <button type="button" className="lx-btn lx-btn-gold lx-btn-lg" onClick={() => navigate('home')}>
          <Play className="w-5 h-5" fill="currentColor" aria-hidden /> {t('account.play')}
        </button>
        <button
          type="button"
          className="lx-btn lx-btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await account.signOut();
            setBusy(false);
          }}
        >
          <LogOut className="w-4 h-4" aria-hidden /> {t('account.signOut')}
        </button>
        <p className="lx-fine">{t('account.signOutNote')}</p>
      </div>
      <DeleteAccount />
    </div>
  );
}

/** Gold coins drawn in CSS, until the painted coins art is added. */
function CoinPile() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties} />
      ))}
    </>
  );
}

export function AccountScreen() {
  const { t } = useI18n();
  const { status } = useAccount();
  return (
    <LuxPage title={t('account.title')} subtitle={t(status === 'user' ? 'account.subtitleUser' : 'account.subtitle')} art={LUX_ART.accountBg}>
      {status === 'off' ? (
        <section className="cz-panel p-5 flex gap-3 items-start" role="note">
          <UserRound className="w-5 h-5 shrink-0 text-[var(--cz-gold)]" aria-hidden />
          <p className="text-sm text-white/80">{t('account.off')}</p>
        </section>
      ) : status === 'loading' ? (
        <div className="cz-panel p-6 text-center text-sm text-[var(--cz-muted)]" aria-busy="true">
          {t('account.loading')}
        </div>
      ) : status === 'user' ? (
        <AccountPanel />
      ) : (
        <SignInPanel />
      )}
    </LuxPage>
  );
}

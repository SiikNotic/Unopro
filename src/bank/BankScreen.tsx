import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, CircleUserRound, Clock, Coins, Landmark, Loader2, MonitorPlay, RefreshCw, ShieldCheck, Sparkles, Tv } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { useWallet } from '@/casino/useWallet';
import { formatChips } from '@/casino/chipValues';
import { playSfx } from '@/audio/sfx';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { newId } from '@/casino/random';
import { claimLoan, fetchBankStatus } from './bankApi';
import { cooldownProgress, formatCountdown, loanRemainingMs, serverClock } from './bankLogic';
import type { AdState, BankStatus, ServerClock } from './bankLogic';
import { useRewardedAd } from './useRewardedAd';
import './bank.css';

type LoanPhase = 'idle' | 'claiming';

/** A coin shower from the button that paid, plus the balance bounce (skipped with reduced motion). */
function CoinBurst({ burst }: { burst: { key: number; amount: number } | null }) {
  if (!burst) return null;
  return (
    <div key={burst.key} className="bk-burst" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="bk-burst-coin" style={{ '--i': i } as React.CSSProperties} />
      ))}
      <span className="bk-burst-amount">+{formatChips(burst.amount)}</span>
    </div>
  );
}

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** The vault: the 24-hour loan and rewarded ads, both paid into account coins by the server. */
export function BankScreen() {
  const { t, language } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const { balance } = useWallet();
  const { preferences } = usePreferences();
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [clock, setClock] = useState<ServerClock | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loanPhase, setLoanPhase] = useState<LoanPhase>('idle');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [burst, setBurst] = useState<{ key: number; amount: number } | null>(null);
  const [bounce, setBounce] = useState(0);
  // One idempotency key per loan attempt: kept after a network failure, so the retry can't pay twice.
  const pendingLoan = useRef<string | null>(null);

  const signedIn = account.status === 'user';
  const registered = signedIn && !!account.coins?.registered;
  const banned = !!account.ban || !!status?.banned;

  const load = useCallback(async (): Promise<BankStatus | null> => {
    const res = await fetchBankStatus();
    if (!res.ok) {
      setLoadError(true);
      return null;
    }
    setClock(serverClock(res.data.serverNow, performance.now()));
    setStatus(res.data);
    setLoadError(false);
    return res.data;
  }, []);

  useEffect(() => {
    if (signedIn) void load();
    else {
      setStatus(null);
      setClock(null);
    }
  }, [signedIn, account.profile?.userId, load]);

  const celebrate = useCallback(
    (amount: number, sound: 'cashIn' | 'coin') => {
      playSfx(sound);
      vibrate(preferences.haptics, [30, 40, 60]);
      if (!reduced) setBurst({ key: Date.now(), amount });
      setBounce((b) => b + 1);
    },
    [preferences.haptics, reduced]
  );

  useEffect(() => {
    if (!burst) return;
    const id = window.setTimeout(() => setBurst(null), 1600);
    return () => window.clearTimeout(id);
  }, [burst]);

  const perfNow = useTicker(!!status?.loan);
  const remaining = loanRemainingMs(status?.loan?.availableAt, clock, perfNow);
  const cooling = remaining > 0;

  // When the countdown ends, ask the server again (it alone decides).
  const wasCooling = useRef(false);
  useEffect(() => {
    if (wasCooling.current && !cooling) void load();
    wasCooling.current = cooling;
  }, [cooling, load]);

  const errorText = (code: string) => {
    const key = `bank.errors.${code}`;
    const text = t(key);
    return text === key ? t('bank.errors.server') : text;
  };

  const requestLoan = async () => {
    if (loanPhase !== 'idle' || !registered || banned || cooling) return;
    setLoanPhase('claiming');
    setMessage(null);
    playSfx('chip');
    const id = pendingLoan.current ?? newId();
    pendingLoan.current = id;
    const res = await claimLoan(id);
    if (res.ok) {
      pendingLoan.current = null;
      account.setBalance(res.data.balance);
      if (!res.data.replayed) {
        celebrate(res.data.amount, 'cashIn');
        setMessage({ tone: 'ok', text: t('bank.loan.granted', { amount: formatChips(res.data.amount) }) });
      }
      await load();
    } else {
      // Only a network failure keeps the key: the request may have gone through.
      if (res.code !== 'network') pendingLoan.current = null;
      playSfx('error');
      vibrate(preferences.haptics, 20);
      setMessage({ tone: 'error', text: errorText(res.code) });
      if (res.code === 'cooldown' || res.code === 'banned') await load();
    }
    setLoanPhase('idle');
  };

  const ad = useRewardedAd({
    enabled: registered && !banned,
    userId: account.profile?.userId ?? null,
    checkServer: async () => {
      const s = await load();
      const ids = (s?.history ?? []).filter((h) => h.kind === 'ad_reward').map((h) => h.id);
      return ids.length ? Math.max(...ids) : null;
    },
    onConfirmed: () => {
      void account.refreshCoins();
      celebrate(status?.adAmount ?? 100, 'coin');
      setMessage({ tone: 'ok', text: t('bank.ad.rewarded', { amount: formatChips(status?.adAmount ?? 100) }) });
    },
  });

  const loanAmount = status?.loanAmount ?? 500;
  const adAmount = status?.adAmount ?? 100;
  const capReached = !!status && status.adToday >= status.adDailyCap;
  const dateFmt = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const progress = cooldownProgress(remaining, status?.loanCooldownHours ?? 24);

  return (
    <ScreenContainer title={t('bank.title')} subtitle={t('bank.subtitle')}>
      <div className="bk flex flex-col gap-4">
        {/* Vault with the balance */}
        <section className="bk-vault" aria-label={t('bank.balance')}>
          <div className="bk-door" aria-hidden>
            <div className="bk-door-ring">
              <div className="bk-wheel">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="bk-spoke" style={{ transform: `rotate(${i * 30}deg)` }} />
                ))}
                <span className="bk-hub">
                  <Landmark className="w-5 h-5" />
                </span>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="bk-label">{t('bank.balance')}</p>
            <p key={bounce} className={`bk-balance cz-num ${bounce && !reduced ? 'bk-bounce' : ''}`} aria-live="polite">
              <Coins className="w-6 h-6 text-[var(--cz-gold)]" aria-hidden />
              {formatChips(balance)}
            </p>
            <p className="text-[11px] text-white/60 leading-snug">{t(signedIn ? 'bank.balanceAccount' : 'bank.balanceGuest')}</p>
          </div>
          <CoinBurst burst={burst} />
        </section>

        {message && (
          <p className={`bk-msg ${message.tone === 'ok' ? 'bk-msg-ok' : 'bk-msg-err'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}

        {/* Who can claim */}
        {account.status === 'off' && <p className="cz-panel p-4 text-sm text-[var(--cz-muted)]">{t('bank.offline')}</p>}
        {account.status === 'guest' && (
          <div className="bk-guest">
            <CircleUserRound className="w-6 h-6 text-[var(--cz-gold)] shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-white text-[15px]">{t('bank.guestTitle')}</p>
              <p className="text-xs text-white/70">{t('bank.guestHint')}</p>
            </div>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-sm bk-guest-btn" onClick={() => navigate('account')}>
              {t('account.signUp')}
            </button>
          </div>
        )}
        {signedIn && !registered && account.coins && <p className="cz-panel p-4 text-sm text-[var(--cz-ivory)]">{t('bank.confirmEmail')}</p>}
        {signedIn && banned && (
          <p className="bk-msg bk-msg-err flex items-center gap-2" role="alert">
            <Ban className="w-4 h-4 shrink-0" aria-hidden />
            {t('bank.banned')}
          </p>
        )}
        {signedIn && loadError && (
          <div className="cz-panel p-3 flex items-center gap-3" role="alert">
            <p className="text-sm text-[var(--cz-ivory)] flex-1 min-w-0">{t('bank.loadError')}</p>
            <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm shrink-0" onClick={() => void load()}>
              <RefreshCw className="w-4 h-4" /> {t('account.retry')}
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* The loan */}
          <section className={`bk-card bk-wood ${cooling ? 'bk-card-rest' : ''}`} aria-labelledby="bk-loan-title">
            <div className="bk-card-top">
              <span className="bk-badge">
                <Clock className="w-3.5 h-3.5" aria-hidden /> {t('bank.loan.every', { hours: status?.loanCooldownHours ?? 24 })}
              </span>
            </div>
            <h2 id="bk-loan-title" className="bk-card-title">{t('bank.loan.title')}</h2>
            <p className="bk-amount cz-num">
              +{formatChips(loanAmount)} <span>{t('bank.coins')}</span>
            </p>
            {cooling ? (
              <div className="bk-cool" role="timer" aria-live="off" aria-label={t('bank.loan.nextIn', { time: formatCountdown(remaining) })}>
                <svg viewBox="0 0 44 44" className="bk-ring" aria-hidden>
                  <circle cx="22" cy="22" r="19" className="bk-ring-bg" />
                  <circle cx="22" cy="22" r="19" className="bk-ring-fg" style={{ strokeDasharray: `${progress * 119.4} 119.4` }} />
                </svg>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">{t('bank.loan.nextLabel')}</p>
                  <p className="bk-countdown cz-num">{formatCountdown(remaining)}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/70 min-h-[2.5em]">{t('bank.loan.hint')}</p>
            )}
            <button
              type="button"
              className="cz-btn cz-btn-primary w-full mt-auto"
              disabled={!registered || banned || cooling || loanPhase !== 'idle' || !status}
              aria-busy={loanPhase === 'claiming'}
              onClick={() => void requestLoan()}
            >
              {loanPhase === 'claiming' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
              {loanPhase === 'claiming' ? t('bank.loan.claiming') : cooling ? t('bank.loan.cooling') : !registered ? t('bank.needAccount') : t('bank.loan.cta', { amount: formatChips(loanAmount) })}
            </button>
          </section>

          {/* Rewarded ad */}
          <AdCard state={ad.state} amount={adAmount} capReached={capReached} locked={!registered || banned} today={status?.adToday ?? 0} cap={status?.adDailyCap ?? 20} onStart={ad.start} />
        </div>

        {/* History */}
        {signedIn && (
          <section aria-labelledby="bk-history">
            <h2 id="bk-history" className="cz-label mb-2 px-1">{t('bank.history')}</h2>
            {!status ? null : status.history.length === 0 ? (
              <p className="cz-panel p-4 text-sm text-[var(--cz-muted)]">{t('bank.historyEmpty')}</p>
            ) : (
              <ul className="cz-panel divide-y divide-[var(--cz-line)]">
                {status.history.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="bk-hist-icon" aria-hidden>
                      {h.kind === 'loan' ? <Landmark className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{t(h.kind === 'loan' ? 'bank.kind.loan' : 'bank.kind.ad')}</p>
                      <p className="text-[11px] text-[var(--cz-muted)]">{dateFmt.format(new Date(h.at))}</p>
                    </div>
                    <span className="cz-num text-sm font-bold text-[var(--cz-gold-hover)]">+{formatChips(h.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--cz-muted)] px-2">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {t('bank.footer')}
        </p>
      </div>
    </ScreenContainer>
  );
}

function AdCard({ state, amount, capReached, locked, today, cap, onStart }: { state: AdState; amount: number; capReached: boolean; locked: boolean; today: number; cap: number; onStart: () => void }) {
  const { t } = useI18n();
  const unavailable = state === 'UNAVAILABLE' || state === 'CHECKING';
  const off = unavailable || capReached;
  const label =
    state === 'LOADING'
      ? t('bank.ad.loading')
      : state === 'SHOWING_AD'
        ? t('bank.ad.showing')
        : state === 'VERIFYING'
          ? t('bank.ad.verifying')
          : state === 'REWARDED'
            ? t('bank.ad.done', { amount: formatChips(amount) })
            : state === 'ERROR'
              ? t('bank.ad.error')
              : capReached
                ? t('bank.ad.cap')
                : unavailable
                  ? t('bank.ad.unavailable')
                  : t('bank.ad.cta');
  const busy = state === 'LOADING' || state === 'SHOWING_AD' || state === 'VERIFYING';
  return (
    <section className={`bk-card bk-metal ${off ? 'bk-card-off' : ''}`} aria-labelledby="bk-ad-title" data-state={state}>
      <div className="bk-card-top">
        <span className="bk-badge">
          <MonitorPlay className="w-3.5 h-3.5" aria-hidden /> {t('bank.ad.length')}
        </span>
        {!off && !locked && (
          <span className="text-[11px] text-white/60 cz-num">
            {today}/{cap}
          </span>
        )}
      </div>
      <h2 id="bk-ad-title" className="bk-card-title">{t('bank.ad.title')}</h2>
      <p className="bk-amount cz-num">
        +{formatChips(amount)} <span>{t('bank.coins')}</span>
      </p>
      <p className="text-xs text-white/70 min-h-[2.5em]">{unavailable ? t('bank.ad.unavailableHint') : t('bank.ad.hint')}</p>
      <button type="button" className={`cz-btn w-full mt-auto ${off || state === 'ERROR' ? 'cz-btn-secondary' : 'cz-btn-primary'}`} disabled={state !== 'AVAILABLE' || capReached || locked} aria-busy={busy} onClick={onStart}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : state === 'REWARDED' ? <Sparkles className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
        {label}
      </button>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, CalendarClock, CircleUserRound, Clock, Coins, HandCoins, Landmark, Loader2, MonitorPlay, RefreshCw, ShieldCheck, Sparkles, Tv, Undo2 } from 'lucide-react';
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
import { claimLoan, fetchBankStatus, repayLoan } from './bankApi';
import { adRewardArrived, clearPendingAd, cooldownProgress, formatCountdown, loanRemainingMs, loanView, openLoan, readPendingAd, savePendingAd, serverClock } from './bankLogic';
import type { AdState, BankHistoryItem, BankStatus, ServerClock } from './bankLogic';
import { useRewardedAd } from './useRewardedAd';
import { getAdsIssue } from './ads';
import './bank.css';

type LoanPhase = 'idle' | 'claiming' | 'confirmRepay' | 'repaying';

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

/** The vault: the emergency loan and rewarded ads, both paid into account coins by the server. */
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
  // One idempotency key per loan (and repayment) attempt: kept after a network failure, so the retry can't
  // pay or charge twice.
  const pendingLoan = useRef<string | null>(null);
  const pendingRepay = useRef<string | null>(null);
  const [spin, setSpin] = useState(0);

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

  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [signedIn, load]);

  const celebrate = useCallback(
    (amount: number, sound: 'cashIn' | 'coin') => {
      playSfx(sound);
      vibrate(preferences.haptics, [30, 40, 60]);
      if (!reduced) {
        setBurst({ key: Date.now(), amount });
        setSpin((n) => n + 1);
      }
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

  const errorText = (code: string, detail = '') => {
    const specific = code === 'conflict' && (detail === 'loan_outstanding' || detail === 'balance_too_high') ? detail : code;
    const key = `bank.errors.${specific}`;
    const text = t(key, { amount: formatChips(status?.loanMaxBalance ?? 0) });
    return text === key ? t('bank.errors.server') : text;
  };

  const view = loanView(registered && !banned ? status : null, remaining);
  const owed = openLoan(status);

  const requestLoan = async () => {
    if (loanPhase !== 'idle' || view !== 'available') return;
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
      setMessage({ tone: 'error', text: errorText(res.code, res.detail) });
      if (res.code !== 'network') await load();
    }
    setLoanPhase('idle');
  };

  const repay = async () => {
    if (loanPhase !== 'confirmRepay' || !owed) return;
    setLoanPhase('repaying');
    setMessage(null);
    playSfx('chip');
    const id = pendingRepay.current ?? newId();
    pendingRepay.current = id;
    const res = await repayLoan(id);
    if (res.ok) {
      pendingRepay.current = null;
      account.setBalance(res.data.balance);
      setMessage({ tone: 'ok', text: t('bank.loan.repaid', { amount: formatChips(res.data.amount) }) });
      setBounce((b) => b + 1);
      await load();
    } else {
      if (res.code !== 'network') pendingRepay.current = null;
      playSfx('error');
      vibrate(preferences.haptics, 20);
      setMessage({ tone: 'error', text: errorText(res.code, res.detail) });
      if (res.code !== 'network') await load();
    }
    setLoanPhase('idle');
  };

  const ad = useRewardedAd({
    enabled: registered && !banned,
    userId: account.profile?.userId ?? null,
    checkServer: async () => (await load())?.lastAdRewardId ?? null,
    onConfirmed: () => {
      clearPendingAd();
      void account.refreshCoins();
      celebrate(status?.adAmount ?? 0, 'coin');
      setMessage({ tone: 'ok', text: t('bank.ad.rewarded', { amount: formatChips(status?.adAmount ?? 0) }) });
    },
  });

  // While the server confirms an ad, remember it in this tab: after a refresh the Bank keeps checking and
  // shows the reward once the server has granted it (it never shows one the server didn't grant).
  const lastAdId = status?.lastAdRewardId ?? null;
  const lastAdRef = useRef(lastAdId);
  lastAdRef.current = lastAdId;
  useEffect(() => {
    if (ad.state === 'VERIFYING') savePendingAd(lastAdRef.current);
  }, [ad.state]);
  const [recovering, setRecovering] = useState(() => readPendingAd() !== null);
  useEffect(() => {
    if (!recovering || !status || ad.state === 'VERIFYING') return;
    const pending = readPendingAd();
    if (!pending) return setRecovering(false);
    if (adRewardArrived(pending.before, status.lastAdRewardId)) {
      clearPendingAd();
      setRecovering(false);
      void account.refreshCoins();
      celebrate(status.adAmount, 'coin');
      setMessage({ tone: 'ok', text: t('bank.ad.rewarded', { amount: formatChips(status.adAmount) }) });
      return;
    }
    const id = window.setTimeout(() => void load(), 3000);
    return () => window.clearTimeout(id);
  }, [recovering, status, ad.state, load, account, celebrate, t]);

  const adAmount = status?.adAmount ?? 0;
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
              <div key={spin} className={`bk-wheel ${spin ? 'bk-wheel-turn' : ''}`}>
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
          {/* The emergency loan */}
          <LoanCard
            view={view}
            status={status}
            owed={owed}
            balance={balance}
            remaining={remaining}
            progress={progress}
            phase={loanPhase}
            dateFmt={dateFmt}
            onRequest={() => void requestLoan()}
            onAskRepay={() => loanPhase === 'idle' && setLoanPhase('confirmRepay')}
            onCancelRepay={() => loanPhase === 'confirmRepay' && setLoanPhase('idle')}
            onRepay={() => void repay()}
          />

          {/* Rewarded ad */}
          <AdCard state={recovering && ad.state !== 'VERIFYING' ? 'VERIFYING' : ad.state} failure={ad.failure} amount={adAmount} capReached={capReached} locked={!registered || banned || recovering} today={status?.adToday ?? 0} cap={status?.adDailyCap ?? 0} onStart={ad.start} />
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
                  <HistoryRow key={`${h.kind}-${h.id}`} item={h} dateFmt={dateFmt} />
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

function AdCard({ state, failure, amount, capReached, locked, today, cap, onStart }: { state: AdState; failure: 'load' | 'unconfirmed' | null; amount: number; capReached: boolean; locked: boolean; today: number; cap: number; onStart: () => void }) {
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
              ? t(failure === 'load' ? 'bank.ad.loadError' : 'bank.ad.error')
              : capReached
                ? t('bank.ad.cap')
                : unavailable
                  ? t('bank.ad.unavailable')
                  : t('bank.ad.cta');
  const busy = state === 'LOADING' || state === 'SHOWING_AD' || state === 'VERIFYING';
  const issue = getAdsIssue();
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
      {(unavailable || state === 'ERROR') && issue && <p className="text-[10px] text-white/45 break-words">{t('bank.ad.detail', { detail: issue })}</p>}
      <button type="button" className={`cz-btn w-full mt-auto ${off || state === 'ERROR' ? 'cz-btn-secondary' : 'cz-btn-primary'}`} disabled={state !== 'AVAILABLE' || capReached || locked} aria-busy={busy} onClick={onStart}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : state === 'REWARDED' ? <Sparkles className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
        {label}
      </button>
    </section>
  );
}

type LoanViewName = ReturnType<typeof loanView>;

/** The emergency loan: what can be asked for now, the open loan and its repayment, or when the next one comes. */
function LoanCard(p: {
  view: LoanViewName;
  status: BankStatus | null;
  owed: ReturnType<typeof openLoan>;
  balance: number;
  remaining: number;
  progress: number;
  phase: LoanPhase;
  dateFmt: Intl.DateTimeFormat;
  onRequest: () => void;
  onAskRepay: () => void;
  onCancelRepay: () => void;
  onRepay: () => void;
}) {
  const { t } = useI18n();
  const s = p.status;
  const amount = s?.loanAmount ?? 0;
  const busy = p.phase === 'claiming' || p.phase === 'repaying';
  const canRepay = !!p.owed && p.balance >= p.owed.amount;
  const nextAt = s?.loan?.availableAt ? p.dateFmt.format(new Date(s.loan.availableAt)) : '';
  const rest = p.view === 'cooldown' || p.view === 'balance';
  return (
    <section className={`bk-card bk-wood ${rest ? 'bk-card-rest' : ''}`} aria-labelledby="bk-loan-title" data-view={p.view}>
      <div className="bk-card-top">
        <span className="bk-badge">
          <Clock className="w-3.5 h-3.5" aria-hidden /> {t('bank.loan.every', { hours: s?.loanCooldownHours ?? 24 })}
        </span>
        {p.view === 'outstanding' && <span className="bk-chip bk-chip-warn">{t('bank.status.outstanding')}</span>}
      </div>
      <h2 id="bk-loan-title" className="bk-card-title">{t('bank.loan.title')}</h2>

      {p.view === 'outstanding' && p.owed ? (
        <>
          <p className="bk-amount bk-amount-owed cz-num">
            {formatChips(p.owed.amount)} <span>{t('bank.loan.owed')}</span>
          </p>
          <p className="text-xs text-white/70">{t('bank.loan.owedHint', { date: p.dateFmt.format(new Date(p.owed.claimedAt)) })}</p>
        </>
      ) : (
        <p className="bk-amount cz-num">
          +{formatChips(amount)} <span>{t('bank.coins')}</span>
        </p>
      )}

      {p.view === 'cooldown' && (
        <div className="bk-cool" role="timer" aria-live="off" aria-label={t('bank.loan.nextIn', { time: formatCountdown(p.remaining) })}>
          <svg viewBox="0 0 44 44" className="bk-ring" aria-hidden>
            <circle cx="22" cy="22" r="19" className="bk-ring-bg" />
            <circle cx="22" cy="22" r="19" className="bk-ring-fg" style={{ strokeDasharray: `${p.progress * 119.4} 119.4` }} />
          </svg>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">{t('bank.loan.nextLabel')}</p>
            <p className="bk-countdown cz-num">{formatCountdown(p.remaining)}</p>
            {nextAt && (
              <p className="flex items-center gap-1 text-[11px] text-white/60">
                <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden /> {nextAt}
              </p>
            )}
          </div>
        </div>
      )}
      {p.view === 'balance' && <p className="text-xs text-white/75">{t('bank.loan.balanceRule', { amount: formatChips(s?.loanMaxBalance ?? 0) })}</p>}
      {p.view === 'available' && <p className="text-xs text-white/70">{t(s?.loanRequiresRepayment ? 'bank.loan.hintRepay' : 'bank.loan.hint')}</p>}
      {p.view === 'locked' && <p className="text-xs text-white/70">{t('bank.loan.hintRepay')}</p>}

      {s && (
        <dl className="bk-facts">
          <div>
            <dt>{t('bank.loan.factAmount')}</dt>
            <dd className="cz-num">{formatChips(amount)}</dd>
          </div>
          <div>
            <dt>{t('bank.loan.factBalance')}</dt>
            <dd className="cz-num">&lt; {formatChips(s.loanMaxBalance)}</dd>
          </div>
          <div>
            <dt>{t('bank.loan.factRepay')}</dt>
            <dd>{t(s.loanRequiresRepayment ? 'bank.loan.repayYes' : 'bank.loan.repayNo')}</dd>
          </div>
        </dl>
      )}

      {p.view === 'outstanding' && p.owed ? (
        p.phase === 'confirmRepay' || p.phase === 'repaying' ? (
          <div className="bk-confirm" role="group" aria-label={t('bank.loan.confirmTitle', { amount: formatChips(p.owed.amount) })}>
            <p className="text-sm text-white">{t('bank.loan.confirmTitle', { amount: formatChips(p.owed.amount) })}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="cz-btn cz-btn-secondary" disabled={busy} onClick={p.onCancelRepay}>
                {t('common.cancel')}
              </button>
              <button type="button" className="cz-btn cz-btn-primary" disabled={busy} aria-busy={p.phase === 'repaying'} onClick={p.onRepay}>
                {p.phase === 'repaying' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Undo2 className="w-5 h-5" />}
                {t('bank.loan.repayConfirm')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!canRepay && <p className="text-[11px] text-white/60">{t('bank.loan.repayNeed', { amount: formatChips(p.owed.amount) })}</p>}
            <button type="button" className="cz-btn cz-btn-primary w-full mt-auto" disabled={!canRepay || p.phase !== 'idle'} onClick={p.onAskRepay}>
              <Undo2 className="w-5 h-5" /> {t('bank.loan.repay', { amount: formatChips(p.owed.amount) })}
            </button>
          </>
        )
      ) : (
        <button type="button" className="cz-btn cz-btn-primary w-full mt-auto" disabled={p.view !== 'available' || p.phase !== 'idle'} aria-busy={p.phase === 'claiming'} onClick={p.onRequest}>
          {p.phase === 'claiming' ? <Loader2 className="w-5 h-5 animate-spin" /> : <HandCoins className="w-5 h-5" />}
          {p.phase === 'claiming'
            ? t('bank.loan.claiming')
            : p.view === 'cooldown'
              ? t('bank.loan.cooling')
              : p.view === 'balance'
                ? t('bank.loan.notNeeded')
                : p.view === 'locked'
                  ? t('bank.needAccount')
                  : t('bank.loan.cta', { amount: formatChips(amount) })}
        </button>
      )}
    </section>
  );
}

const HISTORY_ICON: Record<BankHistoryItem['kind'], typeof Landmark> = { loan: Landmark, loan_repay: Undo2, ad_reward: Tv, ad_rejected: Tv };

/** One Bank movement: what it was, when, how much, and its state (open loan, paid back, refused ad…). */
function HistoryRow({ item: h, dateFmt }: { item: BankHistoryItem; dateFmt: Intl.DateTimeFormat }) {
  const { t } = useI18n();
  const Icon = HISTORY_ICON[h.kind];
  const chip =
    h.kind === 'loan'
      ? { tone: h.status === 'outstanding' ? 'warn' : h.status === 'repaid' ? 'ok' : 'muted', text: t(`bank.status.${h.status === 'outstanding' || h.status === 'repaid' ? h.status : 'settled'}`) }
      : h.kind === 'ad_rejected'
        ? { tone: 'err', text: t(`bank.status.reason.${['daily_cap', 'banned', 'not_registered'].includes(h.status) ? h.status : 'rejected'}`) }
        : { tone: 'ok', text: t('bank.status.done') };
  const sign = h.kind === 'loan_repay' ? '−' : h.kind === 'ad_rejected' ? '' : '+';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={`bk-hist-icon ${h.kind === 'ad_rejected' ? 'bk-hist-off' : ''}`} aria-hidden>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white leading-snug break-words">{t(`bank.kind.${h.kind}`)}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--cz-muted)]">
          <span>{dateFmt.format(new Date(h.at))}</span>
          <span className={`bk-chip bk-chip-${chip.tone}`}>{chip.text}</span>
        </p>
      </div>
      <span className={`cz-num text-sm font-bold shrink-0 ${h.kind === 'loan_repay' ? 'text-white/80' : h.kind === 'ad_rejected' ? 'text-[var(--cz-muted)]' : 'text-[var(--cz-gold-hover)]'}`}>
        {h.kind === 'ad_rejected' ? '—' : `${sign}${formatChips(h.amount)}`}
      </span>
    </li>
  );
}

// The live cards of the home screen: the weekly Discord giveaway (enter from the app with a linked Discord
// account, see the countdown and the last winner) and the daily streak (one claim a day, growing rewards).
// A win the player has not seen yet opens a one-time notice. Everything shown comes from the database.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { CalendarCheck, CheckCircle2, Coins, Crown, Flame, Gift, Link2, MessageCircle, PartyPopper, Trophy, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { formatChips } from '@/casino/chipValues';
import { dailyClaim, dailyStatus, giveawayAckWin, giveawayEnter, giveawayHome, remaining } from '@/home/homeExtras';
import type { DailyStatus, GiveawayHome } from '@/home/homeExtras';

const KNOWN_REASONS = new Set(['discord_not_linked', 'no_active_giveaway', 'giveaway_closed', 'account_required', 'banned']);

/** Re-renders every minute so countdowns stay current. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
}

function useRemaining(iso: string | null | undefined) {
  useMinuteTick();
  return iso ? remaining(iso) : null;
}

function useCountdown(iso: string | null | undefined) {
  const { t } = useI18n();
  const left = useRemaining(iso);
  if (!left) return '';
  const { d, h, m } = left;
  if (d > 0) return t('homeExtras.dh', { d, h });
  if (h > 0) return t('homeExtras.hm', { h, m });
  return t('homeExtras.m', { m: Math.max(1, m) });
}

/** Full amount with thousands separators ("10.000" / "10,000"). */
function useFullAmount() {
  const { language } = useI18n();
  return (n: number) => new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-US', { useGrouping: true }).format(n);
}

/** Decorative sparkles behind the banners (pure CSS shapes, hidden from assistive tech). */
function Sparkles() {
  return (
    <span className="hm-x-sparkles" aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function GiveawayCard({ data, onChanged }: { data: GiveawayHome; onChanged: () => void }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const full = useFullAmount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const left = useRemaining(data.active?.endsAt);
  if (!data.active && !data.last) return null;

  const me = data.me;
  const enter = async () => {
    setBusy(true);
    setMessage(null);
    const res = await giveawayEnter();
    setBusy(false);
    if (!res.ok) {
      setMessage(t(res.code === 'banned' ? 'homeExtras.giveaway.banned' : res.code === 'not_registered' ? 'homeExtras.giveaway.reason.account_required' : 'homeExtras.error'));
      return;
    }
    if (!res.data.ok) {
      const reason = res.data.reason && KNOWN_REASONS.has(res.data.reason) ? res.data.reason : 'other';
      setMessage(t(`homeExtras.giveaway.reason.${reason}`));
    }
    onChanged();
  };

  let action: JSX.Element | null = null;
  if (data.active) {
    if (!me?.registered) {
      action = (
        <button type="button" className="hm-gold-btn is-sm hm-x-cta" onClick={() => navigate('account')}>
          {t('homeExtras.giveaway.signUp')}
        </button>
      );
    } else if (!me.linked) {
      action = (
        <button type="button" className="hm-gold-btn is-sm hm-x-cta hm-x-discord" onClick={() => navigate('profile')}>
          <Link2 className="w-4 h-4" aria-hidden /> {t('homeExtras.giveaway.link')}
        </button>
      );
    } else if (me.entered) {
      action = (
        <span className="hm-x-badge hm-x-cta" role="status">
          <CheckCircle2 className="w-4 h-4" aria-hidden /> {t('homeExtras.giveaway.entered')}
        </span>
      );
    } else {
      action = (
        <button type="button" className="hm-gold-btn is-sm hm-x-cta" onClick={() => void enter()} disabled={busy} aria-busy={busy}>
          <Gift className="w-4 h-4" aria-hidden /> {t('homeExtras.giveaway.enter')}
        </button>
      );
    }
  }

  const prize = data.active?.prizeCoins ?? data.last?.prizeCoins ?? 0;
  const units: [number, string][] = left
    ? [
        [left.d, t('homeExtras.unit.d')],
        [left.h, t('homeExtras.unit.h')],
        [left.m, t('homeExtras.unit.m')],
      ]
    : [];

  return (
    <section className="hm-x hm-x-giveaway" aria-labelledby="hm-x-giveaway-title">
      <Sparkles />
      <div className="hm-x-head">
        <span className="hm-promo-chip">{t('homeExtras.giveaway.chip')}</span>
        {data.active && (
          <span className="hm-x-live">
            <span className="hm-x-live-dot" aria-hidden /> {t('homeExtras.giveaway.live')}
          </span>
        )}
      </div>

      <div className="hm-x-hero">
        <div className="hm-x-medal" aria-hidden>
          <Trophy className="w-9 h-9" />
        </div>
        <div className="hm-x-prize">
          <h2 id="hm-x-giveaway-title" className="sr-only">
            {data.active ? t('homeExtras.giveaway.title', { amount: full(prize) }) : t('homeExtras.giveaway.next')}
          </h2>
          <span className="hm-x-prize-n" aria-hidden>
            {full(prize)}
          </span>
          <span className="hm-x-prize-u" aria-hidden>
            {data.active ? t('homeExtras.giveaway.unit') : t('homeExtras.giveaway.next')}
          </span>
        </div>
      </div>

      {data.active && (
        <div className="hm-x-timer" role="timer" aria-label={t('homeExtras.giveaway.endsIn', { time: units.map(([n, u]) => `${n} ${u}`).join(' ') })}>
          {units.map(([n, u]) => (
            <span key={u} className="hm-x-time" aria-hidden>
              <b>{String(n).padStart(2, '0')}</b>
              <small>{u}</small>
            </span>
          ))}
        </div>
      )}

      <ul className="hm-x-meta">
        {data.active && (
          <li>
            <Users className="w-4 h-4" aria-hidden /> {t('homeExtras.giveaway.entries', { n: data.active.entries })}
          </li>
        )}
        {data.last && (
          <li>
            <Crown className="w-4 h-4" aria-hidden />
            {data.last.winner
              ? t('homeExtras.giveaway.lastWinner', { name: data.last.winner, amount: formatChips(data.last.prizeCoins) })
              : t('homeExtras.giveaway.lastNoWinner')}
          </li>
        )}
      </ul>

      {message && (
        <p className="hm-x-msg" role="alert">
          {message}
        </p>
      )}
      <div className="hm-x-actions">
        {action}
        {data.inviteUrl && (
          <a className="hm-x-link" href={data.inviteUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="w-4 h-4" aria-hidden /> {t('homeExtras.giveaway.discord')}
          </a>
        )}
      </div>
    </section>
  );
}

function DailyCard({ data, onClaimed }: { data: DailyStatus; onClaimed: () => void }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const countdown = useCountdown(data.claimedToday ? data.nextClaimAt : null);
  const amounts = data.amounts.length ? data.amounts : [100, 150, 200, 250, 300, 400, 500];
  // Which slot of the row is "today": the next day to claim (or the one claimed today), capped to the row.
  const todayDay = data.claimedToday ? data.streak : data.nextDay;
  const slot = Math.min(todayDay, amounts.length);
  const doneCount = data.registered ? (data.claimedToday ? slot : slot - 1) : 0;
  const progress = Math.round((doneCount / amounts.length) * 100);

  const claim = async () => {
    setBusy(true);
    setMessage(null);
    const res = await dailyClaim(crypto.randomUUID());
    setBusy(false);
    if (res.ok) {
      setMessage(t('homeExtras.daily.claimed', { amount: formatChips(res.data.amount), day: res.data.streak }));
      void account.refreshCoins();
    } else {
      setMessage(t(res.code === 'cooldown' ? 'homeExtras.daily.already' : res.code === 'banned' ? 'homeExtras.giveaway.banned' : 'homeExtras.error'));
    }
    onClaimed();
  };

  return (
    <section className="hm-x hm-x-daily" aria-labelledby="hm-x-daily-title">
      <Sparkles />
      <div className="hm-x-head">
        <span className="hm-promo-chip">{t('homeExtras.daily.chip')}</span>
        {data.registered && data.streak > 0 && (
          <span className="hm-x-flame">
            <Flame className="w-4 h-4" aria-hidden /> {t('homeExtras.daily.streak', { n: data.streak })}
          </span>
        )}
      </div>

      <div className="hm-x-hero">
        <div className="hm-x-medal is-gold" aria-hidden>
          <CalendarCheck className="w-8 h-8" />
        </div>
        <div className="hm-x-prize">
          <h2 id="hm-x-daily-title" className="hm-x-title">
            {t('homeExtras.daily.title')}
          </h2>
          <span className="hm-x-sub">{t('homeExtras.daily.sub')}</span>
        </div>
      </div>

      <ol className="hm-x-days" aria-label={t('homeExtras.daily.rowAria')}>
        {amounts.map((a, i) => {
          const day = i + 1;
          const done = data.registered && (day < slot || (day === slot && data.claimedToday));
          const today = data.registered && day === slot && !data.claimedToday;
          const big = day === amounts.length;
          return (
            <li
              key={day}
              className={`hm-x-day${done ? ' is-done' : ''}${today ? ' is-today' : ''}${big ? ' is-big' : ''}`}
              aria-current={today ? 'step' : undefined}
            >
              <span className="hm-x-day-n">{t('homeExtras.daily.day', { n: day })}</span>
              <span className="hm-x-day-ico" aria-hidden>
                {done ? <CheckCircle2 className="w-4 h-4" /> : big ? <Gift className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
              </span>
              <span className="hm-x-day-a">{formatChips(a)}</span>
            </li>
          );
        })}
      </ol>
      <div className="hm-x-bar" role="progressbar" aria-valuemin={0} aria-valuemax={amounts.length} aria-valuenow={doneCount} aria-label={t('homeExtras.daily.rowAria')}>
        <span style={{ width: `${progress}%` }} />
      </div>

      {message && (
        <p className="hm-x-msg" role="status">
          {message}
        </p>
      )}
      <div className="hm-x-actions">
        {!data.registered ? (
          <button type="button" className="hm-gold-btn is-sm hm-x-cta" onClick={() => navigate('account')}>
            {t('homeExtras.daily.signUp')}
          </button>
        ) : data.claimedToday ? (
          <span className="hm-x-badge hm-x-cta" role="status">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> {t('homeExtras.daily.comeBack', { time: countdown })}
          </span>
        ) : (
          <button type="button" className="hm-gold-btn is-sm hm-x-cta" onClick={() => void claim()} disabled={busy} aria-busy={busy}>
            <Gift className="w-4 h-4" aria-hidden /> {t('homeExtras.daily.claim', { amount: formatChips(data.todayAmount ?? data.nextAmount) })}
          </button>
        )}
      </div>
    </section>
  );
}

function WinNotice({ win, onClose }: { win: NonNullable<GiveawayHome['win']>; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet title={t('homeExtras.win.title')} onClose={onClose}>
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <PartyPopper className="w-12 h-12 text-[var(--cz-gold)]" aria-hidden />
        <p className="text-base text-[var(--cz-ivory)]">{t('homeExtras.win.body', { amount: formatChips(win.prizeCoins) })}</p>
        <button type="button" className="cz-btn cz-btn-primary w-full" onClick={onClose}>
          {t('homeExtras.win.ok')}
        </button>
      </div>
    </Sheet>
  );
}

/** The giveaway and daily-streak cards, loaded for the current session; hidden when the server is unreachable. */
export function HomeExtras() {
  const account = useAccount();
  const [giveaway, setGiveaway] = useState<GiveawayHome | null>(null);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [win, setWin] = useState<GiveawayHome['win']>(null);
  const shownWin = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [g, d] = await Promise.all([giveawayHome(), dailyStatus()]);
    if (g.ok) {
      setGiveaway(g.data);
      if (g.data.win && shownWin.current !== g.data.win.id) setWin(g.data.win);
    }
    if (d.ok) setDaily(d.data);
  }, []);

  useEffect(() => {
    if (account.status === 'loading' || account.status === 'off') return;
    void load();
  }, [account.status, account.user?.id, load]);

  const closeWin = () => {
    if (win) {
      shownWin.current = win.id;
      void giveawayAckWin(win.id);
    }
    setWin(null);
  };

  if (!giveaway && !daily) return null;
  return (
    <div className="hm-x-wrap">
      {daily && <DailyCard data={daily} onClaimed={() => void load()} />}
      {giveaway && <GiveawayCard data={giveaway} onChanged={() => void load()} />}
      {win && <WinNotice win={win} onClose={closeWin} />}
    </div>
  );
}

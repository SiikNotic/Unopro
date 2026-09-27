import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Ban, Coins, Copy, History, ListOrdered, RotateCcw, ShieldCheck, SlidersHorizontal, UserCog, UserRound, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { newId } from '@/casino/random';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { staffApi } from './api';
import type { UserDetail as Detail, LedgerRow } from './api';
import { fmtDate, fmtNum, signed } from './format';
import { auditLine } from './auditText';
import { Ago, Empty, ErrorLine, Loading, RoleBadge } from './ui';
import { rtpText, useGameName } from './lib';

export { RoleBadge } from './ui';

const PRESETS = [500, 1000, 5000];
const BAN_HOURS: (number | null)[] = [1, 24, 24 * 7, 24 * 30, null];
const LEDGER_GAMES = ['', 'premium', 'slots', 'roulette', 'blackjack', 'domino', 'bingo', 'carta', 'crash', 'horse', 'airhockey', 'bonus', 'loan', 'ad_reward', 'admin_add', 'admin_remove', 'guest_migration'];

type View = 'summary' | 'movements' | 'actions' | 'history';

/** One player: everything staff may see and do, in four views. The server checks every action again. */
export function UserDetailPanel({ userId, myRole, myId, onClose, version, onChanged }: { userId: string; myRole: Role; myId: string; onClose: () => void; version: number; onChanged: () => void }) {
  const { t, language } = useI18n();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('summary');
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const r = await staffApi.detail(userId);
    if (r.ok) {
      setD(r.data);
      setError(null);
    } else setError(r.code);
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load, version]);
  useEffect(() => {
    setView('summary');
    closeRef.current?.focus();
  }, [userId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const myRank = ROLE_RANK[myRole];
  const targetRank = d ? ROLE_RANK[d.role] : 99;
  const isSelf = userId === myId;
  const canBan = myRank >= 1 && targetRank < myRank && !isSelf;
  const canCoins = myRank >= 2 && (targetRank < myRank || (isSelf && myRole === 'owner'));
  const canRole = myRole === 'owner' && !isSelf && targetRank < 3;
  const done = () => {
    void load();
    onChanged();
  };
  const online = d?.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60000;

  const VIEWS: { id: View; icon: typeof UserRound }[] = [
    { id: 'summary', icon: UserRound },
    { id: 'movements', icon: ListOrdered },
    { id: 'actions', icon: SlidersHorizontal },
    { id: 'history', icon: History },
  ];

  return (
    <>
      <div className="sd-drawer-back" onClick={onClose} aria-hidden />
      <aside className="sd-drawer" role="dialog" aria-modal="true" aria-labelledby="sd-detail-title">
        <header className="sd-drawer-head">
          <div className="flex items-start gap-3">
            <span className="sd-avatar" aria-hidden>
              {(d?.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="sd-detail-title" className="sd-h truncate">
                {d?.username ?? t('staff.userDetails')}
              </h2>
              {d && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <RoleBadge role={d.role} />
                  {d.ban ? <span className="sd-badge bad">{d.ban.kind === 'permanent' ? t('staff.bannedPermanent') : t('staff.bannedUntil', { date: fmtDate(d.ban.expires_at, language) })}</span> : online ? <span className="sd-badge ok">{t('staff.online')}</span> : null}
                </div>
              )}
            </div>
            <button ref={closeRef} type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={onClose} aria-label={t('common.close')}>
              <X className="w-5 h-5" />
            </button>
          </div>
          {d && (
            <div className="sd-drawer-balance">
              <span>
                <Coins className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden />
                <b className="cz-num">{fmtNum(d.balance, language)}</b>
                <span className="sd-muted text-xs">{t('staff.cols.coins')}</span>
              </span>
              <span className="flex gap-1.5">
                {canCoins && (
                  <button type="button" className="sd-chip-btn" onClick={() => setView('actions')}>
                    <Coins className="w-3.5 h-3.5" aria-hidden /> {t('staff.adjustCoins')}
                  </button>
                )}
                {canBan && (
                  <button type="button" className={`sd-chip-btn ${d.ban ? '' : 'is-bad'}`} onClick={() => setView('actions')}>
                    {d.ban ? <RotateCcw className="w-3.5 h-3.5" aria-hidden /> : <Ban className="w-3.5 h-3.5" aria-hidden />} {d.ban ? t('staff.unbanUser') : t('staff.banShort')}
                  </button>
                )}
              </span>
            </div>
          )}
          <nav className="sd-tabs" aria-label={t('staff.userDetails')}>
            {VIEWS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
                <Icon className="w-4 h-4" aria-hidden /> {t(`staff.view.${id}`)}
              </button>
            ))}
          </nav>
        </header>
        <ErrorLine code={error} />
        {!d && !error && <Loading />}
        {d && view === 'summary' && <Summary d={d} />}
        {d && view === 'movements' && <Movements userId={d.userId} first={d.ledger} version={version} />}
        {d && view === 'actions' && (
          <div className="sd-drawer-body flex flex-col gap-3">
            {canCoins && <CoinsForm userId={d.userId} balance={d.balance} onDone={done} />}
            {canBan && (d.ban ? <UnbanForm userId={d.userId} onDone={done} /> : <BanForm userId={d.userId} onDone={done} />)}
            {canRole && <RoleForm userId={d.userId} role={d.role} onDone={done} />}
            {!canCoins && !canBan && !canRole && <p className="sd-muted text-sm">{isSelf ? t('staff.selfNoActions') : t('staff.protected')}</p>}
            {(canCoins || canBan || canRole) && (
              <p className="sd-muted text-xs flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden /> {t('staff.actionsNote')}
              </p>
            )}
          </div>
        )}
        {d && view === 'history' && <HistoryView d={d} />}
      </aside>
    </>
  );
}

function Summary({ d }: { d: Detail }) {
  const { t, language } = useI18n();
  const gameName = useGameName();
  const tot = d.totals;
  const games = Object.entries(tot?.byGame ?? {}).sort((a, b) => Number(b[1].staked) - Number(a[1].staked));
  const staked = Number(tot?.staked ?? 0);
  const paid = Number(tot?.paid ?? 0);
  return (
    <div className="sd-drawer-body flex flex-col gap-4">
      <div className="sd-mini-kpis">
        <div>
          <span>{t('staff.kpi.bets')}</span>
          <b className="cz-num">{fmtNum(Number(tot?.rounds ?? d.rounds), language)}</b>
        </div>
        <div>
          <span>{t('staff.money.staked')}</span>
          <b className="cz-num">{fmtNum(staked, language)}</b>
        </div>
        <div>
          <span>{t('staff.player.result')}</span>
          <b className={`cz-num ${paid - staked > 0 ? 'sd-plus' : paid - staked < 0 ? 'sd-minus' : ''}`}>{signed(paid - staked, language)}</b>
        </div>
        <div>
          <span>{t('staff.money.rtpShort')}</span>
          <b className="cz-num">{rtpText(paid, staked)}</b>
        </div>
      </div>
      {games.length > 0 && (
        <section>
          <h3 className="sd-sec-title">{t('staff.player.byGame')}</h3>
          <div className="sd-panel sd-scroll">
            <table className="sd-table">
              <thead>
                <tr>
                  <th>{t('staff.byGame.game')}</th>
                  <th className="sd-num">{t('staff.kpi.bets')}</th>
                  <th className="sd-num">{t('staff.money.staked')}</th>
                  <th className="sd-num">{t('staff.player.result')}</th>
                </tr>
              </thead>
              <tbody>
                {games.map(([g, v]) => (
                  <tr key={g} className="is-static">
                    <td>{gameName(g)}</td>
                    <td className="sd-num">{fmtNum(Number(v.rounds), language)}</td>
                    <td className="sd-num">{fmtNum(Number(v.staked), language)}</td>
                    <td className={`sd-num ${Number(v.paid) - Number(v.staked) > 0 ? 'sd-plus' : Number(v.paid) - Number(v.staked) < 0 ? 'sd-minus' : ''}`}>{signed(Number(v.paid) - Number(v.staked), language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section>
        <h3 className="sd-sec-title">{t('staff.sections.account')}</h3>
        <dl className="sd-dl">
          <dt>{t('staff.cols.email')}</dt>
          <dd>{d.email ?? '—'}</dd>
          <dt>{t('staff.provider')}</dt>
          <dd>{d.provider}</dd>
          <dt>{t('staff.confirmed')}</dt>
          <dd>{d.confirmed ? t('staff.yes') : t('staff.no')}</dd>
          <dt>{t('staff.cols.registered')}</dt>
          <dd>{fmtDate(d.createdAt, language)}</dd>
          <dt>{t('staff.lastSignIn')}</dt>
          <dd>{fmtDate(d.lastSignInAt, language)}</dd>
          <dt>{t('staff.cols.lastSeen')}</dt>
          <dd>
            <Ago iso={d.lastSeenAt} />
          </dd>
          <dt>{t('staff.player.lastPlay')}</dt>
          <dd>
            <Ago iso={tot?.lastPlayAt ?? null} />
          </dd>
          <dt>{t('staff.bonus')}</dt>
          <dd>{d.bonusAt ? fmtDate(d.bonusAt, language) : t('staff.no')}</dd>
          <dt>{t('staff.migration')}</dt>
          <dd>{d.migration ? t('staff.migrationValue', { credited: fmtNum(d.migration.credited, language), reported: fmtNum(d.migration.reported, language) }) : '—'}</dd>
          <dt>{t('staff.cols.id')}</dt>
          <dd className="flex items-center gap-1">
            <span className="sd-mono break-all">{d.userId}</span>
            <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm !min-h-0 !p-1" onClick={() => void navigator.clipboard?.writeText(d.userId)} aria-label={t('staff.copyId')}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </dd>
        </dl>
      </section>
    </div>
  );
}

function Movements({ userId, first, version }: { userId: string; first: LedgerRow[]; version: number }) {
  const { t, language } = useI18n();
  const gameName = useGameName();
  const [game, setGame] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>(first);
  const [more, setMore] = useState(first.length >= 50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void staffApi.userLedger(userId, null, game || null).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.code);
      setError(null);
      setRows(r.data);
      setMore(r.data.length === 50);
    });
    return () => {
      live = false;
    };
  }, [userId, game, version]);

  const loadMore = async () => {
    const last = rows.at(-1);
    if (!last) return;
    setBusy(true);
    const r = await staffApi.userLedger(userId, last.id, game || null);
    setBusy(false);
    if (!r.ok) return setError(r.code);
    setRows([...rows, ...r.data]);
    setMore(r.data.length === 50);
  };

  return (
    <div className="sd-drawer-body flex flex-col gap-3">
      <label className="sd-field">
        <span>{t('staff.player.filterGame')}</span>
        <select className="sd-input" value={game} onChange={(e) => setGame(e.target.value)}>
          {LEDGER_GAMES.map((g) => (
            <option key={g} value={g}>
              {g ? gameName(g) : t('staff.player.allMovements')}
            </option>
          ))}
        </select>
      </label>
      <ErrorLine code={error} />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul className="sd-list sd-panel">
          {rows.map((l) => {
            const net = Number(l.payout) - Number(l.stake);
            return (
              <li key={l.id} className="sd-row">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{gameName(l.game)}</span>
                  <span className="block text-[11px] sd-muted">
                    {fmtDate(l.created_at, language)}
                    {l.reason ? ` · ${l.reason}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <b className={`cz-num block ${net > 0 ? 'sd-plus' : net < 0 ? 'sd-minus' : ''}`}>{signed(net, language)}</b>
                  <span className="cz-num text-[11px] sd-muted">{t('staff.player.balanceAfter', { n: fmtNum(Number(l.balance_after), language) })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <button type="button" className="cz-btn cz-btn-secondary self-center" disabled={busy} onClick={() => void loadMore()}>
          {t('staff.loadMore')}
        </button>
      )}
    </div>
  );
}

function HistoryView({ d }: { d: Detail }) {
  const { t, language } = useI18n();
  return (
    <div className="sd-drawer-body flex flex-col gap-4">
      <section>
        <h3 className="sd-sec-title">{t('staff.banHistory')}</h3>
        {d.bans.length === 0 ? (
          <p className="sd-muted text-sm">{t('staff.notBanned')}</p>
        ) : (
          <ul className="sd-list sd-panel">
            {d.bans.map((b) => (
              <li key={b.id}>
                <span className="font-semibold">{b.kind === 'permanent' ? t('staff.permanent') : t('staff.temporary')}</span> · {fmtDate(b.created_at, language)}
                <span className="block text-[12px] break-words">{b.reason}</span>
                {b.lifted_at && (
                  <span className="block text-[11px] sd-muted break-words">
                    {t('staff.lifted', { date: fmtDate(b.lifted_at, language) })} {b.lift_reason ? `· ${b.lift_reason}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="sd-sec-title">{t('staff.sections.history')}</h3>
        {d.audit.length === 0 ? (
          <p className="sd-muted text-sm">{t('staff.none')}</p>
        ) : (
          <ul className="sd-list sd-panel">
            {d.audit.map((a) => (
              <li key={a.id}>
                <span className="flex items-center gap-2 flex-wrap">
                  <b className="text-white">{t(`staff.actions.${a.action}`)}</b>
                  <span className="text-[11px] sd-muted">{fmtDate(a.at, language)}</span>
                </span>
                <span className="block mt-0.5">{auditLine(a, t, language)}</span>
                {a.reason && <span className="block text-[12px] text-white/70 break-words">{t('staff.reasonValue', { reason: a.reason })}</span>}
                <span className="block text-[11px] sd-muted">{t('staff.by', { name: a.actor_username ?? a.actor_id.slice(0, 8), role: t(`account.roleLabel.${a.actor_role}`) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { busy, setBusy, error, setError };
}

function CoinsForm({ userId, balance, onDone }: { userId: string; balance: number; onDone: () => void }) {
  const { t, language } = useI18n();
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const { busy, setBusy, error, setError } = useSubmit();
  // One id per intended adjustment: a retried click replays it instead of applying it twice.
  const requestId = useRef<string | null>(null);
  const value = Math.floor(Number(amount));
  const delta = Number.isFinite(value) && value > 0 ? sign * value : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setOk(null);
    if (!delta) return setError(t('staff.errors.amount'));
    if (reason.trim().length < 3) return setError(t('staff.errors.reason'));
    if (balance + delta < 0) return setError(t('staff.errors.insufficient_funds'));
    setBusy(true);
    setError(null);
    requestId.current ??= newId();
    const r = await staffApi.adjustCoins(userId, delta, reason.trim(), requestId.current);
    setBusy(false);
    if (!r.ok) return setError(t(`staff.errors.${r.code}`));
    requestId.current = null;
    setOk(t('staff.done.coins', { amount: signed(delta, language) }));
    setAmount('');
    setReason('');
    onDone();
  };

  return (
    <form className="sd-form" onSubmit={submit}>
      <p className="sd-form-title">
        <Coins className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden /> {t('staff.adjustCoins')}
      </p>
      <div className="sd-seg" role="group" aria-label={t('staff.adjustCoins')}>
        <button type="button" aria-pressed={sign === 1} onClick={() => { setSign(1); requestId.current = null; }}>{t('staff.add')}</button>
        <button type="button" aria-pressed={sign === -1} onClick={() => { setSign(-1); requestId.current = null; }}>{t('staff.remove')}</button>
      </div>
      <div className="sd-seg" role="group" aria-label={t('staff.customAmount')}>
        {PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => { setAmount(String(p)); requestId.current = null; }}>
            {sign > 0 ? '+' : '−'}
            {fmtNum(p, language)}
          </button>
        ))}
      </div>
      <input className="sd-input" inputMode="numeric" placeholder={t('staff.customAmount')} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9]/g, '')); requestId.current = null; }} aria-label={t('staff.customAmount')} />
      <textarea className="sd-textarea" placeholder={t('staff.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
      {delta !== 0 && <p className="text-xs sd-muted">{t('staff.preview', { before: fmtNum(balance, language), after: fmtNum(balance + delta, language) })}</p>}
      {error && <p className="ac-error" role="alert">{error}</p>}
      {ok && <p className="text-xs sd-plus" role="status">{ok}</p>}
      <button type="submit" className="cz-btn cz-btn-primary" disabled={busy} aria-busy={busy}>
        {delta ? t('staff.applyAmount', { amount: signed(delta, language) }) : t('staff.apply')}
      </button>
    </form>
  );
}

function BanForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [hours, setHours] = useState<number | null>(24);
  const [reason, setReason] = useState('');
  const { busy, setBusy, error, setError } = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('staff.errors.reason'));
    setBusy(true);
    setError(null);
    const r = await staffApi.ban(userId, reason.trim(), hours);
    setBusy(false);
    if (!r.ok) return setError(t(`staff.errors.${r.code}`));
    setReason('');
    onDone();
  };
  return (
    <form className="sd-form" onSubmit={submit}>
      <p className="sd-form-title">
        <Ban className="w-4 h-4 text-[#ffb3b3]" aria-hidden /> {t('staff.banUser')}
      </p>
      <div className="sd-seg" role="group" aria-label={t('staff.duration')}>
        {BAN_HOURS.map((h) => (
          <button key={String(h)} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>
            {h === null ? t('staff.permanent') : t(`staff.hours.${h}`)}
          </button>
        ))}
      </div>
      <textarea className="sd-textarea" placeholder={t('staff.banReasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
      {error && <p className="ac-error" role="alert">{error}</p>}
      <button type="submit" className="cz-btn cz-btn-secondary !border-[rgba(224,122,122,0.6)] !text-[#ffd0d0]" disabled={busy} aria-busy={busy}>
        {t('staff.confirmBan')}
      </button>
    </form>
  );
}

function UnbanForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, setBusy, error, setError } = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('staff.errors.reason'));
    setBusy(true);
    setError(null);
    const r = await staffApi.unban(userId, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(t(`staff.errors.${r.code}`));
    setReason('');
    onDone();
  };
  return (
    <form className="sd-form" onSubmit={submit}>
      <p className="sd-form-title">
        <RotateCcw className="w-4 h-4 text-emerald-300" aria-hidden /> {t('staff.unbanUser')}
      </p>
      <textarea className="sd-textarea" placeholder={t('staff.unbanReasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
      {error && <p className="ac-error" role="alert">{error}</p>}
      <button type="submit" className="cz-btn cz-btn-secondary" disabled={busy} aria-busy={busy}>
        {t('staff.confirmUnban')}
      </button>
    </form>
  );
}

function RoleForm({ userId, role, onDone }: { userId: string; role: Role; onDone: () => void }) {
  const { t } = useI18n();
  const [next, setNext] = useState<Exclude<Role, 'owner'>>(role === 'owner' ? 'admin' : role);
  const [reason, setReason] = useState('');
  const { busy, setBusy, error, setError } = useSubmit();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next === role) return setError(t('staff.errors.sameRole'));
    if (reason.trim().length < 3) return setError(t('staff.errors.reason'));
    setBusy(true);
    setError(null);
    const r = await staffApi.setRole(userId, next, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(t(`staff.errors.${r.code}`));
    setReason('');
    onDone();
  };
  return (
    <form className="sd-form" onSubmit={submit}>
      <p className="sd-form-title">
        <UserCog className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden /> {t('staff.changeRole')}
      </p>
      <p className="text-xs sd-muted">{t('staff.roleHelp')}</p>
      <div className="sd-seg" role="group" aria-label={t('staff.changeRole')}>
        {(['user', 'staff', 'admin'] as const).map((r) => (
          <button key={r} type="button" aria-pressed={next === r} onClick={() => setNext(r)}>
            {t(`account.roleLabel.${r}`)}
          </button>
        ))}
      </div>
      <textarea className="sd-textarea" placeholder={t('staff.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
      {error && <p className="ac-error" role="alert">{error}</p>}
      <button type="submit" className="cz-btn cz-btn-secondary" disabled={busy} aria-busy={busy}>
        {t('staff.saveRole')}
      </button>
    </form>
  );
}

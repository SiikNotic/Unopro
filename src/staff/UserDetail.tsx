import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Ban, Coins, Copy, RotateCcw, ShieldCheck, UserCog, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { newId } from '@/casino/random';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { staffApi } from './api';
import type { UserDetail as Detail } from './api';
import { fmtDate, fmtNum, signed } from './format';
import { auditLine } from './auditText';

const PRESETS = [500, 1000, 5000];
const BAN_HOURS: (number | null)[] = [1, 24, 24 * 7, 24 * 30, null];

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return <span className={`sd-badge ${role}`}>{t(`account.roleLabel.${role}`)}</span>;
}

/** One player, everything staff may see and do. The server checks every action again. */
export function UserDetailPanel({ userId, myRole, myId, onClose, version, onChanged }: { userId: string; myRole: Role; myId: string; onClose: () => void; version: number; onChanged: () => void }) {
  const { t, language } = useI18n();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const r = await staffApi.detail(userId);
    if (r.ok) {
      setD(r.data);
      setError(null);
    } else setError(t(`staff.errors.${r.code}`));
  }, [userId, t]);
  useEffect(() => {
    void load();
  }, [load, version]);
  useEffect(() => closeRef.current?.focus(), []);
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

  return (
    <>
      <div className="sd-drawer-back" onClick={onClose} aria-hidden />
      <aside className="sd-drawer" role="dialog" aria-modal="true" aria-labelledby="sd-detail-title">
        <div className="sd-top !static">
          <h2 id="sd-detail-title" className="sd-h flex-1 min-w-0 truncate">
            {d?.username ?? t('staff.userDetails')}
          </h2>
          {d && <RoleBadge role={d.role} />}
          <button ref={closeRef} type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="p-4 ac-error" role="alert">{error}</p>}
        {!d && !error && <p className="p-4 text-sm text-[var(--cz-muted)]" aria-busy="true">{t('staff.loading')}</p>}
        {d && (
          <>
            <section className="sd-sec">
              <h3>{t('staff.sections.profile')}</h3>
              <dl className="sd-dl">
                <dt>{t('staff.cols.username')}</dt>
                <dd>{d.username ?? '—'}</dd>
                <dt>{t('staff.cols.role')}</dt>
                <dd>
                  <RoleBadge role={d.role} />
                </dd>
                <dt>{t('staff.cols.id')}</dt>
                <dd className="flex items-center gap-1">
                  <span className="sd-mono break-all">{d.userId}</span>
                  <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm !min-h-0 !p-1" onClick={() => void navigator.clipboard?.writeText(d.userId)} aria-label={t('staff.copyId')}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </dd>
              </dl>
            </section>
            <section className="sd-sec">
              <h3>{t('staff.sections.account')}</h3>
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
              </dl>
            </section>
            <section className="sd-sec">
              <h3>{t('staff.sections.economy')}</h3>
              <p className="flex items-center gap-2 text-2xl font-extrabold text-white cz-num">
                <Coins className="w-6 h-6 text-[var(--cz-gold)]" aria-hidden /> {fmtNum(d.balance, language)}
              </p>
              <dl className="sd-dl mt-2">
                <dt>{t('staff.bonus')}</dt>
                <dd>{d.bonusAt ? fmtDate(d.bonusAt, language) : t('staff.no')}</dd>
                <dt>{t('staff.migration')}</dt>
                <dd>{d.migration ? t('staff.migrationValue', { credited: fmtNum(d.migration.credited, language), reported: fmtNum(d.migration.reported, language) }) : '—'}</dd>
              </dl>
              {canCoins && <CoinsForm userId={d.userId} balance={d.balance} onDone={() => { void load(); onChanged(); }} />}
              <h4 className="cz-label mt-4 mb-1">{t('staff.movements')}</h4>
              {d.ledger.length === 0 ? (
                <p className="text-sm text-[var(--cz-muted)]">{t('staff.none')}</p>
              ) : (
                <ul className="sd-list sd-card">
                  {d.ledger.map((l) => {
                    const net = Number(l.payout) - Number(l.stake);
                    return (
                      <li key={l.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{t(`staff.ledger.${l.game}`)}</span>
                          <span className="block text-[11px] text-[var(--cz-muted)]">
                            {fmtDate(l.created_at, language)}
                            {l.reason ? ` · ${l.reason}` : ''}
                          </span>
                        </span>
                        <span className={`cz-num font-bold ${net > 0 ? 'sd-plus' : net < 0 ? 'sd-minus' : ''}`}>{signed(net, language)}</span>
                        <span className="cz-num text-[11px] text-[var(--cz-muted)] w-16 text-right">{fmtNum(Number(l.balance_after), language)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="sd-sec">
              <h3>{t('staff.sections.activity')}</h3>
              <dl className="sd-dl">
                <dt>{t('staff.cols.lastSeen')}</dt>
                <dd>{fmtDate(d.lastSeenAt, language)}</dd>
                <dt>{t('staff.rounds')}</dt>
                <dd>{fmtNum(d.rounds, language)}</dd>
              </dl>
            </section>
            <section className="sd-sec">
              <h3>{t('staff.sections.moderation')}</h3>
              {d.ban ? (
                <div className="sd-card p-3 mb-3 border-[rgba(224,122,122,0.5)]">
                  <p className="font-bold text-[#ffb3b3]">{d.ban.kind === 'permanent' ? t('staff.bannedPermanent') : t('staff.bannedUntil', { date: fmtDate(d.ban.expires_at, language) })}</p>
                  <p className="text-sm mt-1 break-words">{d.ban.reason}</p>
                </div>
              ) : (
                <p className="text-sm text-[var(--cz-muted)] mb-3">{t('staff.notBanned')}</p>
              )}
              {canBan && (d.ban ? <UnbanForm userId={d.userId} onDone={() => { void load(); onChanged(); }} /> : <BanForm userId={d.userId} onDone={() => { void load(); onChanged(); }} />)}
              {!canBan && !isSelf && <p className="text-xs text-[var(--cz-muted)]">{t('staff.protected')}</p>}
              {canRole && <RoleForm userId={d.userId} role={d.role} onDone={() => { void load(); onChanged(); }} />}
              {d.bans.length > 0 && (
                <>
                  <h4 className="cz-label mt-4 mb-1">{t('staff.banHistory')}</h4>
                  <ul className="sd-list sd-card">
                    {d.bans.map((b) => (
                      <li key={b.id}>
                        <span className="font-semibold">{b.kind === 'permanent' ? t('staff.permanent') : t('staff.temporary')}</span> · {fmtDate(b.created_at, language)}
                        <span className="block text-[12px] break-words">{b.reason}</span>
                        {b.lifted_at && (
                          <span className="block text-[11px] text-[var(--cz-muted)] break-words">
                            {t('staff.lifted', { date: fmtDate(b.lifted_at, language) })} {b.lift_reason ? `· ${b.lift_reason}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="sd-sec">
              <h3>{t('staff.sections.history')}</h3>
              {d.audit.length === 0 ? (
                <p className="text-sm text-[var(--cz-muted)]">{t('staff.none')}</p>
              ) : (
                <ul className="sd-list sd-card">
                  {d.audit.map((a) => (
                    <li key={a.id}>
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="sd-badge">{a.action}</span>
                        <span className="text-[11px] text-[var(--cz-muted)]">{fmtDate(a.at, language)}</span>
                      </span>
                      <span className="block mt-1">{auditLine(a, t, language)}</span>
                      {a.reason && <span className="block text-[12px] text-white/75 break-words">{t('staff.reasonValue', { reason: a.reason })}</span>}
                      <span className="block text-[11px] text-[var(--cz-muted)]">{t('staff.by', { name: a.actor_username ?? a.actor_id.slice(0, 8), role: a.actor_role })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </>
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
  const { busy, setBusy, error, setError } = useSubmit();
  // One id per intended adjustment: a retried click replays it instead of applying it twice.
  const requestId = useRef<string | null>(null);
  const value = Math.floor(Number(amount));
  const delta = Number.isFinite(value) && value > 0 ? sign * value : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    setAmount('');
    setReason('');
    onDone();
  };

  return (
    <form className="sd-card p-3 mt-3 flex flex-col gap-2" onSubmit={submit}>
      <p className="font-semibold flex items-center gap-2">
        <Coins className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden /> {t('staff.adjustCoins')}
      </p>
      <div className="sd-seg" role="group" aria-label={t('staff.adjustCoins')}>
        <button type="button" aria-pressed={sign === 1} onClick={() => { setSign(1); requestId.current = null; }}>{t('staff.add')}</button>
        <button type="button" aria-pressed={sign === -1} onClick={() => { setSign(-1); requestId.current = null; }}>{t('staff.remove')}</button>
        {PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => { setAmount(String(p)); requestId.current = null; }}>
            {sign > 0 ? '+' : '−'}
            {fmtNum(p, language)}
          </button>
        ))}
      </div>
      <input className="sd-input" inputMode="numeric" placeholder={t('staff.customAmount')} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9]/g, '')); requestId.current = null; }} aria-label={t('staff.customAmount')} />
      <textarea className="sd-textarea" placeholder={t('staff.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
      {delta !== 0 && <p className="text-xs text-[var(--cz-muted)]">{t('staff.preview', { before: fmtNum(balance, language), after: fmtNum(balance + delta, language) })}</p>}
      {error && <p className="ac-error" role="alert">{error}</p>}
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
    <form className="sd-card p-3 flex flex-col gap-2" onSubmit={submit}>
      <p className="font-semibold flex items-center gap-2">
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
    <form className="sd-card p-3 flex flex-col gap-2" onSubmit={submit}>
      <p className="font-semibold flex items-center gap-2">
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
    <form className="sd-card p-3 mt-3 flex flex-col gap-2" onSubmit={submit}>
      <p className="font-semibold flex items-center gap-2">
        <UserCog className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden /> {t('staff.changeRole')}
      </p>
      <p className="text-xs text-[var(--cz-muted)] flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden /> {t('staff.roleHelp')}
      </p>
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

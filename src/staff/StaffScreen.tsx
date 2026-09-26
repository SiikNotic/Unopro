import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Ban, Coins, Gamepad2, LayoutDashboard, Power, ScrollText, Search, ShieldX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { onlineConfig } from '@/games/online/client';
import { subscribeLive } from '@/account/live';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { staffApi } from './api';
import type { AuditRow, BankActivityRow, BanRow, Overview, StaffUser } from './api';
import { createStaffFeed } from './feed';
import { ago, fmtDate, fmtNum, shortId, signed } from './format';
import { RoleBadge, UserDetailPanel } from './UserDetail';
import { auditLine } from './auditText';
import { CONTROLLED_GAMES, setAvailability } from '@/games/availability';
import type { ControlledGame } from '@/games/availability';
import './staff.css';

type Tab = 'overview' | 'users' | 'economy' | 'games' | 'bans' | 'audit';
const TABS: { id: Tab; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'users', icon: Users },
  { id: 'economy', icon: Coins },
  { id: 'games', icon: Gamepad2 },
  { id: 'bans', icon: Ban },
  { id: 'audit', icon: ScrollText },
];

/**
 * Staff dashboard. What it shows comes from database functions that check the caller's role; a player
 * who opens this screen gets "access denied" from the server, not just a hidden button.
 */
export function StaffScreen() {
  const { t } = useI18n();
  const { back } = useNavigation();
  const account = useAccount();
  const [tab, setTab] = useState<Tab>('overview');
  const [denied, setDenied] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped by live events: panels reload their data.
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(false);
  const myRole: Role = account.profile?.role ?? 'user';
  const myId = account.profile?.userId ?? '';

  const loadOverview = useCallback(async () => {
    const r = await staffApi.overview();
    if (r.ok) setOverview(r.data);
    else if (r.code === 'forbidden' || r.code === 'not_registered') setDenied(true);
  }, []);

  useEffect(() => {
    if (account.status === 'loading') return;
    if (account.status !== 'user') {
      setDenied(true);
      return;
    }
    void loadOverview();
  }, [account.status, loadOverview, version]);

  // Presence ("online") changes slowly; a calm refresh once a minute is enough.
  useEffect(() => {
    if (denied) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void loadOverview();
    }, 60000);
    return () => window.clearInterval(id);
  }, [denied, loadOverview]);

  // Live: audit entries, balances and bans (RLS lets only staff receive other players' rows).
  useEffect(() => {
    const cfg = onlineConfig();
    if (!cfg || denied || account.status !== 'user' || ROLE_RANK[myRole] < 1) return;
    const feed = createStaffFeed({
      subscribe: (onChange) =>
        subscribeLive(cfg, 'staff-dashboard', [{ table: 'admin_audit', event: 'INSERT' }, { table: 'account_wallets' }, { table: 'account_bans' }], onChange, setLive),
      onRefresh: () => setVersion((v) => v + 1),
    });
    void feed.start().catch(() => setLive(false));
    return () => feed.stop();
  }, [denied, account.status, myRole]);

  if (denied) {
    return (
      <div className="sd">
        <div className="sd-deny sd-card" role="alert">
          <ShieldX className="w-10 h-10 mx-auto text-[#ffb3b3]" aria-hidden />
          <h1 className="sd-h mt-3">{t('staff.denied')}</h1>
          <p className="text-sm text-[var(--cz-muted)] mt-2">{t('staff.deniedText')}</p>
          <button type="button" className="cz-btn cz-btn-primary mt-5" onClick={() => back('home')}>
            {t('staff.backHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sd">
      <header className="sd-top">
        <button type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={() => back('account')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="sd-h flex-1 min-w-0 truncate">{t('staff.title')}</h1>
        <span className={`sd-live ${live ? 'on' : ''}`} title={t(live ? 'staff.liveOn' : 'staff.liveOff')}>
          <i aria-hidden /> <span className="hidden sm:inline">{t(live ? 'staff.liveOn' : 'staff.liveOff')}</span>
        </span>
        <RoleBadge role={myRole} />
      </header>
      <div className="sd-body">
        <nav className="sd-nav" aria-label={t('staff.title')}>
          {TABS.map(({ id, icon: Icon }) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon className="w-4 h-4" aria-hidden /> {t(`staff.tabs.${id}`)}
            </button>
          ))}
        </nav>
        <main className="sd-main">
          {tab === 'overview' && <OverviewTab overview={overview} version={version} onOpen={setSelected} />}
          {tab === 'users' && <UsersTab version={version} onOpen={setSelected} selected={selected} />}
          {tab === 'economy' && <EconomyTab overview={overview} version={version} onOpen={setSelected} />}
          {tab === 'games' && <GamesTab version={version} isOwner={myRole === 'owner'} onChanged={() => setVersion((v) => v + 1)} />}
          {tab === 'bans' && <BansTab version={version} onOpen={setSelected} />}
          {tab === 'audit' && <AuditTab version={version} onOpen={setSelected} />}
        </main>
      </div>
      {selected && <UserDetailPanel userId={selected} myRole={myRole} myId={myId} version={version} onClose={() => setSelected(null)} onChanged={() => setVersion((v) => v + 1)} />}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="sd-card sd-kpi">
      <span>{label}</span>
      <b className="cz-num">{value}</b>
      {hint && <span className="block mt-0.5 text-[11px]">{hint}</span>}
    </div>
  );
}

function Ago({ iso }: { iso: string | null | undefined }) {
  const { t, language } = useI18n();
  const a = ago(iso);
  if (!a) return <>—</>;
  return <time dateTime={iso ?? undefined} title={fmtDate(iso, language)}>{t(`staff.ago.${a.unit}`, { n: a.n })}</time>;
}

function useLoader<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; code: string }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    void fn().then((r) => {
      if (mine !== seq.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs explicitly
  }, deps);
  return { data, error };
}

function ErrorLine({ code }: { code: string | null }) {
  const { t } = useI18n();
  return code ? <p className="ac-error" role="alert">{t(`staff.errors.${code}`)}</p> : null;
}

function AuditList({ rows, onOpen }: { rows: AuditRow[]; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  if (!rows.length) return <p className="text-sm text-[var(--cz-muted)] p-3">{t('staff.none')}</p>;
  return (
    <ul className="sd-list">
      {rows.map((a) => (
        <li key={a.id}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="sd-badge">{a.action}</span>
            <span className="text-[11px] text-[var(--cz-muted)]">{fmtDate(a.at, language)}</span>
          </div>
          <p className="mt-1">
            {a.target_id ? (
              <button type="button" className="font-semibold underline decoration-dotted underline-offset-2" onClick={() => onOpen(a.target_id!)}>
                {a.target_username ?? shortId(a.target_id)}
              </button>
            ) : null}{' '}
            · {auditLine(a, t, language)}
          </p>
          {a.reason && <p className="text-[12px] text-white/75 break-words">{t('staff.reasonValue', { reason: a.reason })}</p>}
          <p className="text-[11px] text-[var(--cz-muted)]">{t('staff.by', { name: a.actor_username ?? a.actor_id.slice(0, 8), role: a.actor_role })}</p>
        </li>
      ))}
    </ul>
  );
}

function BankList({ rows, onOpen }: { rows: BankActivityRow[]; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  if (!rows.length) return <p className="text-sm text-[var(--cz-muted)] p-3">{t('staff.none')}</p>;
  return (
    <ul className="sd-list">
      {rows.map((b) => (
        <li key={`${b.kind}-${b.id}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="sd-badge">{t(`staff.ledger.${b.kind}`)}</span>
            <span className={`text-[11px] font-bold ${b.status === 'granted' ? 'text-[var(--cz-gold-hover)]' : 'text-[#f3c4c8]'}`}>{t(`staff.bank.status.${b.status}`)}</span>
            <span className="text-[11px] text-[var(--cz-muted)]">{fmtDate(b.at, language)}</span>
          </div>
          <p className="mt-1">
            <button type="button" className="font-semibold underline decoration-dotted underline-offset-2" onClick={() => onOpen(b.user_id)}>
              {b.username ?? shortId(b.user_id)}
            </button>{' '}
            · {b.status === 'granted' ? `+${fmtNum(b.amount, language)}` : t(`staff.bank.reason.${b.reason ?? 'other'}`)}
          </p>
          <p className="text-[11px] text-[var(--cz-muted)] break-all">{t('staff.bank.reference', { id: b.reference })}</p>
        </li>
      ))}
    </ul>
  );
}

function OverviewTab({ overview, version, onOpen }: { overview: Overview | null; version: number; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const recent = useLoader(() => staffApi.audit(8), [version]);
  const n = (x: number | undefined) => (overview ? fmtNum(Number(x ?? 0), language) : '…');
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.overview')}</h2>
      <div className="sd-kpis">
        <Kpi label={t('staff.kpi.registered')} value={n(overview?.registered)} />
        <Kpi label={t('staff.kpi.online')} value={n(overview?.online)} hint={t('staff.kpi.onlineHint')} />
        <Kpi label={t('staff.kpi.active24h')} value={n(overview?.active24h)} />
        <Kpi label={t('staff.kpi.coins')} value={n(overview?.coins)} />
        <Kpi label={t('staff.kpi.banned')} value={n(overview?.banned)} />
        <Kpi label={t('staff.kpi.guests')} value={n(overview?.guests)} hint={t('staff.kpi.guestsHint')} />
        <Kpi label={t('staff.kpi.rounds24h')} value={n(overview?.rounds24h)} />
        <Kpi label={t('staff.kpi.houseNet24h')} value={overview ? signed(Number(overview.staked24h) - Number(overview.paid24h), language) : '…'} hint={t('staff.kpi.houseNetHint')} />
      </div>
      <section className="sd-card">
        <h3 className="cz-label px-3 pt-3">{t('staff.recentActions')}</h3>
        <ErrorLine code={recent.error} />
        {recent.data && <AuditList rows={recent.data} onOpen={onOpen} />}
      </section>
    </>
  );
}

function UserRows({ users, onOpen, selected }: { users: StaffUser[]; onOpen: (id: string) => void; selected?: string | null }) {
  const { t, language } = useI18n();
  return (
    <div className="sd-card sd-scroll">
      <table className="sd-table">
        <thead>
          <tr>
            <th>{t('staff.cols.username')}</th>
            <th>{t('staff.cols.email')}</th>
            <th>{t('staff.cols.id')}</th>
            <th>{t('staff.cols.role')}</th>
            <th className="sd-num">{t('staff.cols.coins')}</th>
            <th>{t('staff.cols.registered')}</th>
            <th>{t('staff.cols.lastSeen')}</th>
            <th>{t('staff.cols.status')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} onClick={() => onOpen(u.user_id)} aria-selected={selected === u.user_id} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(u.user_id)}>
              <td className="font-semibold text-white whitespace-nowrap">{u.username ?? '—'}</td>
              <td className="max-w-[220px] truncate">{u.email ?? '—'}</td>
              <td className="sd-mono">{shortId(u.user_id)}</td>
              <td>
                <RoleBadge role={u.role} />
              </td>
              <td className="sd-num">{fmtNum(u.balance, language)}</td>
              <td className="whitespace-nowrap">{fmtDate(u.created_at, language)}</td>
              <td className="whitespace-nowrap">
                <Ago iso={u.last_seen_at} />
              </td>
              <td>{u.banned ? <span className="sd-badge bad">{u.ban_expires_at ? t('staff.temporary') : t('staff.permanent')}</span> : <span className="sd-badge ok">{t('staff.active')}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="text-sm text-[var(--cz-muted)] p-4">{t('staff.noUsers')}</p>}
    </div>
  );
}

function UsersTab({ version, onOpen, selected }: { version: number; onOpen: (id: string) => void; selected: string | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);
  const users = useLoader(() => staffApi.users(debounced), [debounced, version]);
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.users')}</h2>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cz-muted)]" aria-hidden />
        <input className="sd-input !pl-9" type="search" placeholder={t('staff.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('staff.search')} />
      </div>
      <ErrorLine code={users.error} />
      {users.data ? <UserRows users={users.data} onOpen={onOpen} selected={selected} /> : !users.error && <p className="text-sm text-[var(--cz-muted)]" aria-busy="true">{t('staff.loading')}</p>}
    </>
  );
}

function EconomyTab({ overview, version, onOpen }: { overview: Overview | null; version: number; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const top = useLoader(() => staffApi.users('', 'balance', 10), [version]);
  const audit = useLoader(() => staffApi.audit(200), [version]);
  const bank = useLoader(() => staffApi.bank(100), [version]);
  const adjustments = useMemo(() => (audit.data ?? []).filter((a) => a.action === 'ADD_COINS' || a.action === 'REMOVE_COINS').slice(0, 25), [audit.data]);
  const n = (x: number | undefined) => (overview ? fmtNum(Number(x ?? 0), language) : '…');
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.economy')}</h2>
      <div className="sd-kpis">
        <Kpi label={t('staff.kpi.coins')} value={n(overview?.coins)} />
        <Kpi label={t('staff.kpi.staked24h')} value={n(overview?.staked24h)} />
        <Kpi label={t('staff.kpi.paid24h')} value={n(overview?.paid24h)} />
        <Kpi label={t('staff.kpi.adminNet24h')} value={overview ? signed(Number(overview.adminNet24h), language) : '…'} />
        <Kpi label={t('staff.kpi.loans24h')} value={n(overview?.loans24h)} />
        <Kpi label={t('staff.kpi.adRewards24h')} value={n(overview?.adRewards24h)} />
        <Kpi label={t('staff.kpi.bankPaid24h')} value={n(overview?.bankPaid24h)} />
      </div>
      <section className="sd-card">
        <h3 className="cz-label px-3 pt-3">{t('staff.bank.title')}</h3>
        <p className="px-3 text-[11px] text-[var(--cz-muted)]">{t('staff.bank.hint')}</p>
        <ErrorLine code={bank.error} />
        {bank.data && <BankList rows={bank.data} onOpen={onOpen} />}
      </section>
      <section>
        <h3 className="cz-label mb-2">{t('staff.topBalances')}</h3>
        <ErrorLine code={top.error} />
        {top.data && <UserRows users={top.data} onOpen={onOpen} />}
      </section>
      <section className="sd-card">
        <h3 className="cz-label px-3 pt-3">{t('staff.adjustments')}</h3>
        <ErrorLine code={audit.error} />
        {audit.data && <AuditList rows={adjustments} onOpen={onOpen} />}
      </section>
    </>
  );
}

function BansTab({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const [activeOnly, setActiveOnly] = useState(true);
  const bans = useLoader(() => staffApi.bans(activeOnly), [activeOnly, version]);
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.bans')}</h2>
      <div className="sd-seg" role="group" aria-label={t('staff.tabs.bans')}>
        <button type="button" aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>{t('staff.activeBans')}</button>
        <button type="button" aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>{t('staff.allBans')}</button>
      </div>
      <ErrorLine code={bans.error} />
      {bans.data && (
        <ul className="sd-list sd-card">
          {bans.data.length === 0 && <li className="text-[var(--cz-muted)]">{t('staff.none')}</li>}
          {bans.data.map((b: BanRow) => (
            <li key={b.id}>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" className="font-semibold text-white underline decoration-dotted underline-offset-2" onClick={() => onOpen(b.user_id)}>
                  {b.username ?? shortId(b.user_id)}
                </button>
                <span className={`sd-badge ${b.active ? 'bad' : ''}`}>{b.kind === 'permanent' ? t('staff.permanent') : t('staff.temporary')}</span>
                {!b.active && <span className="sd-badge">{t('staff.lifted', { date: fmtDate(b.lifted_at ?? b.expires_at, language) })}</span>}
              </div>
              <p className="mt-1 break-words">{b.reason}</p>
              <p className="text-[11px] text-[var(--cz-muted)]">
                {t('staff.bannedBy', { name: b.banned_by_username ?? shortId(b.banned_by), date: fmtDate(b.created_at, language) })}
                {b.expires_at ? ` · ${t('staff.expires', { date: fmtDate(b.expires_at, language) })}` : ''}
              </p>
              {b.lift_reason && <p className="text-[11px] text-[var(--cz-muted)] break-words">{t('staff.liftReason', { name: b.lifted_by_username ?? '—', reason: b.lift_reason })}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Games in service. Everyone on staff sees the state; only the owner gets the switches, and the switch is
 * the database function owner_set_game_enabled, which checks the owner role itself (a hidden button would
 * protect nothing) and writes the audit log.
 */
function GamesTab({ version, isOwner, onChanged }: { version: number; isOwner: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const games = useLoader(() => staffApi.games(), [version]);
  const [editing, setEditing] = useState<ControlledGame | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async (game: ControlledGame, enabled: boolean) => {
    setBusy(true);
    setError(null);
    const r = await staffApi.setGame(game, enabled, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.code);
    if (games.data) setAvailability({ ...games.data, [game]: enabled });
    setEditing(null);
    setReason('');
    onChanged();
  };
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.games')}</h2>
      <p className="text-xs text-[var(--cz-muted)]">{t(isOwner ? 'staff.games.noteOwner' : 'staff.games.noteStaff')}</p>
      <ErrorLine code={games.error} />
      <ErrorLine code={error} />
      <section className="sd-card divide-y divide-[var(--cz-line)]">
        {games.data &&
          CONTROLLED_GAMES.map((g) => {
            const on = games.data![g];
            return (
              <div key={g} className="p-4 flex flex-col gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-base truncate">{t(`availability.games.${g}`)}</p>
                    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-[#ffb3b3]'}`} role="status">
                      <i className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-300' : 'bg-[#ff7a7a]'}`} aria-hidden /> {t(on ? 'staff.games.on' : 'staff.games.off')}
                    </span>
                  </div>
                  {isOwner && editing !== g && (
                    <button type="button" className={`cz-btn ${on ? 'cz-btn-secondary' : 'cz-btn-primary'} cz-btn-sm`} onClick={() => { setEditing(g); setReason(''); setError(null); }}>
                      <Power className="w-4 h-4" aria-hidden /> {t(on ? 'staff.games.turnOff' : 'staff.games.turnOn')}
                    </button>
                  )}
                </div>
                {isOwner && editing === g && (
                  <div className="flex flex-col gap-2">
                    <textarea className="sd-textarea" placeholder={t('staff.games.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" className={`cz-btn ${on ? 'cz-btn-secondary !border-[rgba(224,122,122,0.6)] !text-[#ffd0d0]' : 'cz-btn-primary'} cz-btn-sm`} disabled={busy || reason.trim().length < 3} onClick={() => void apply(g, !on)}>
                        {t(on ? 'staff.games.confirmOff' : 'staff.games.confirmOn')}
                      </button>
                      <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => setEditing(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </section>
    </>
  );
}

function AuditTab({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<string>('all');
  const [older, setOlder] = useState<AuditRow[]>([]);
  const first = useLoader(() => staffApi.audit(100), [version]);
  useEffect(() => setOlder([]), [version]);
  const rows = useMemo(() => {
    const all = [...(first.data ?? []), ...older];
    const unique = all.filter((a, i) => all.findIndex((b) => b.id === a.id) === i);
    return filter === 'all' ? unique : unique.filter((a) => a.action === filter);
  }, [first.data, older, filter]);
  const last = [...(first.data ?? []), ...older].at(-1);
  const more = async () => {
    if (!last) return;
    const r = await staffApi.audit(100, last.id);
    if (r.ok) setOlder((o) => [...o, ...r.data]);
  };
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.audit')}</h2>
      <p className="text-xs text-[var(--cz-muted)]">{t('staff.auditNote')}</p>
      <div className="sd-seg" role="group" aria-label={t('staff.filter')}>
        {['all', 'ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GAME_AVAILABILITY'].map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t('staff.all') : f}
          </button>
        ))}
      </div>
      <ErrorLine code={first.error} />
      <section className="sd-card">{first.data && <AuditList rows={rows} onOpen={onOpen} />}</section>
      {first.data && first.data.length >= 100 && (
        <button type="button" className="cz-btn cz-btn-secondary self-center" onClick={() => void more()}>
          {t('staff.loadMore')}
        </button>
      )}
    </>
  );
}

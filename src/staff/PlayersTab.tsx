// Staff → Players: search (name, email or ID), quick filters, order, and a list that is cards on a phone and a
// table on a wide screen. A click opens the player's file.
import { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useI18n } from '@/i18n';
import { staffApi } from './api';
import type { StaffUser, UserFilter, UserOrder } from './api';
import { fmtDate, fmtNum } from './format';
import { Ago, Empty, ErrorLine, Loading, RoleBadge } from './ui';

const FILTERS: UserFilter[] = ['all', 'online', 'new', 'banned', 'staff'];
const ORDERS: UserOrder[] = ['recent', 'balance', 'new'];
const PAGE = 50;

export function PlayersTab({ version, onOpen, selected, query, onQuery }: { version: number; onOpen: (id: string) => void; selected: string | null; query: string; onQuery: (q: string) => void }) {
  const { t, language } = useI18n();
  const [debounced, setDebounced] = useState(query.trim());
  const [filter, setFilter] = useState<UserFilter>('all');
  const [order, setOrder] = useState<UserOrder>('recent');
  const [rows, setRows] = useState<StaffUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    void staffApi.users(debounced, order, PAGE, 0, filter).then((r) => {
      if (!live) return;
      setBusy(false);
      if (!r.ok) return setError(r.code);
      setError(null);
      setRows(r.data);
      setMore(r.data.length === PAGE);
    });
    return () => {
      live = false;
    };
  }, [debounced, order, filter, version]);

  const loadMore = async () => {
    if (!rows) return;
    setBusy(true);
    const r = await staffApi.users(debounced, order, PAGE, rows.length, filter);
    setBusy(false);
    if (!r.ok) return setError(r.code);
    setRows([...rows, ...r.data.filter((u) => !rows.some((x) => x.user_id === u.user_id))]);
    setMore(r.data.length === PAGE);
  };

  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.users')}</h2>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 sd-muted" aria-hidden />
        <input className="sd-input !pl-9" type="search" placeholder={t('staff.searchPlaceholder')} value={query} onChange={(e) => onQuery(e.target.value)} aria-label={t('staff.search')} />
      </div>
      <div className="sd-toolbar">
        <div className="sd-seg" role="group" aria-label={t('staff.filter')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`staff.userFilter.${f}`)}
            </button>
          ))}
        </div>
        <label className="sd-inline-field">
          <span>{t('staff.sortBy')}</span>
          <select className="sd-input sd-input-sm" value={order} onChange={(e) => setOrder(e.target.value as UserOrder)}>
            {ORDERS.map((o) => (
              <option key={o} value={o}>
                {t(`staff.userOrder.${o}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine code={error} />
      {!rows ? (
        !error && <Loading />
      ) : rows.length === 0 ? (
        <div className="sd-panel">
          <Empty>{t('staff.noUsers')}</Empty>
        </div>
      ) : (
        <>
          <p className="sd-muted text-xs" aria-live="polite">
            {t(more ? 'staff.shownMore' : 'staff.shown', { n: rows.length })}
          </p>
          <ul className="sd-cards sd-only-narrow">
            {rows.map((u) => (
              <li key={u.user_id}>
                <button type="button" className="sd-user-card" onClick={() => onOpen(u.user_id)} aria-current={selected === u.user_id ? 'true' : undefined}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <b className="text-white truncate">{u.username ?? '—'}</b>
                      {u.role !== 'user' && <RoleBadge role={u.role} />}
                      <Status u={u} />
                    </span>
                    <span className="block text-[12px] sd-muted truncate">{u.email ?? '—'}</span>
                    <span className="block text-[11px] sd-muted">
                      {t('staff.cols.lastSeen')}: <Ago iso={u.last_seen_at} />
                    </span>
                  </span>
                  <span className="text-right">
                    <b className="cz-num text-white block">{fmtNum(u.balance, language)}</b>
                    <span className="text-[11px] sd-muted">{t('staff.cols.coins')}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 sd-muted shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="sd-panel sd-scroll sd-only-wide">
            <UserTable rows={rows} onOpen={onOpen} selected={selected} />
          </div>
          {more && (
            <button type="button" className="cz-btn cz-btn-secondary self-center" disabled={busy} onClick={() => void loadMore()}>
              {t('staff.loadMore')}
            </button>
          )}
        </>
      )}
    </>
  );
}

function Status({ u }: { u: StaffUser }) {
  const { t } = useI18n();
  if (u.banned) return <span className="sd-badge bad">{u.ban_expires_at ? t('staff.temporary') : t('staff.permanent')}</span>;
  const online = u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 5 * 60000;
  return online ? <span className="sd-badge ok">{t('staff.online')}</span> : null;
}

export function UserTable({ rows, onOpen, selected }: { rows: StaffUser[]; onOpen: (id: string) => void; selected?: string | null }) {
  const { t, language } = useI18n();
  return (
    <table className="sd-table">
      <thead>
        <tr>
          <th>{t('staff.cols.username')}</th>
          <th>{t('staff.cols.email')}</th>
          <th>{t('staff.cols.role')}</th>
          <th className="sd-num">{t('staff.cols.coins')}</th>
          <th>{t('staff.cols.registered')}</th>
          <th>{t('staff.cols.lastSeen')}</th>
          <th>{t('staff.cols.status')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.user_id} onClick={() => onOpen(u.user_id)} aria-selected={selected === u.user_id} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(u.user_id)}>
            <td className="font-semibold text-white whitespace-nowrap">{u.username ?? '—'}</td>
            <td className="max-w-[220px] truncate">{u.email ?? '—'}</td>
            <td>
              <RoleBadge role={u.role} />
            </td>
            <td className="sd-num">{fmtNum(u.balance, language)}</td>
            <td className="whitespace-nowrap">{fmtDate(u.created_at, language)}</td>
            <td className="whitespace-nowrap">
              <Ago iso={u.last_seen_at} />
            </td>
            <td>
              <Status u={u} />
              {!u.banned && !(u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 5 * 60000) && <span className="sd-muted text-[12px]">{t('staff.active')}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

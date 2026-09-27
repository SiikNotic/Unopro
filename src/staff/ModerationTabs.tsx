// Staff → Bans and Staff → Log (the audit trail, which nobody can edit or delete).
import { useEffect, useMemo, useState } from 'react';
import { Ban, ScrollText } from 'lucide-react';
import { useI18n } from '@/i18n';
import { staffApi } from './api';
import type { AuditRow, BanRow } from './api';
import { AuditList } from './AuditList';
import { fmtDate } from './format';
import { Ago, Empty, ErrorLine, Loading, Panel, PlayerLink } from './ui';
import { AUDIT_ACTIONS, useLoader } from './lib';

export function BansTab({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const [activeOnly, setActiveOnly] = useState(true);
  const bans = useLoader(() => staffApi.bans(activeOnly), [activeOnly, version]);
  return (
    <>
      <div className="sd-title-row">
        <h2 className="sd-h">{t('staff.tabs.bans')}</h2>
        <div className="sd-seg" role="group" aria-label={t('staff.tabs.bans')}>
          <button type="button" aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>
            {t('staff.activeBans')}
          </button>
          <button type="button" aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>
            {t('staff.allBans')}
          </button>
        </div>
      </div>
      <p className="sd-muted text-xs">{t('staff.bansHelp')}</p>
      <ErrorLine code={bans.error} />
      <Panel icon={Ban} title={t(activeOnly ? 'staff.bansActiveTitle' : 'staff.bansAllTitle', { n: bans.data?.length ?? 0 })} flush>
        {!bans.data ? (
          !bans.error && <Loading />
        ) : bans.data.length === 0 ? (
          <Empty>{t(activeOnly ? 'staff.noActiveBans' : 'staff.none')}</Empty>
        ) : (
          <ul className="sd-list">
            {bans.data.map((b: BanRow) => (
              <li key={b.id}>
                <div className="flex items-center gap-2 flex-wrap">
                  <PlayerLink id={b.user_id} name={b.username} onOpen={onOpen} />
                  <span className={`sd-badge ${b.active ? 'bad' : ''}`}>{b.kind === 'permanent' ? t('staff.permanent') : t('staff.temporary')}</span>
                  {b.active && b.expires_at && <span className="sd-muted text-[11px]">{t('staff.expires', { date: fmtDate(b.expires_at, language) })}</span>}
                  {!b.active && <span className="sd-badge">{t('staff.lifted', { date: fmtDate(b.lifted_at ?? b.expires_at, language) })}</span>}
                </div>
                <p className="mt-1 break-words">{b.reason}</p>
                <p className="text-[11px] sd-muted">
                  {t('staff.bannedByShort', { name: b.banned_by_username ?? `${b.banned_by.slice(0, 8)}…` })} · <Ago iso={b.created_at} />
                </p>
                {b.lift_reason && <p className="text-[11px] sd-muted break-words">{t('staff.liftReason', { name: b.lifted_by_username ?? '—', reason: b.lift_reason })}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export function AuditTab({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | AuditRow['action']>('all');
  const [older, setOlder] = useState<AuditRow[]>([]);
  const [end, setEnd] = useState(false);
  const first = useLoader(() => staffApi.audit(100), [version]);
  useEffect(() => {
    setOlder([]);
    setEnd(false);
  }, [version]);
  const all = useMemo(() => {
    const rows = [...(first.data ?? []), ...older];
    return rows.filter((a, i) => rows.findIndex((b) => b.id === a.id) === i);
  }, [first.data, older]);
  const rows = filter === 'all' ? all : all.filter((a) => a.action === filter);
  const more = async () => {
    const last = all.at(-1);
    if (!last) return;
    const r = await staffApi.audit(100, last.id);
    if (r.ok) {
      setOlder((o) => [...o, ...r.data]);
      if (r.data.length < 100) setEnd(true);
    }
  };
  return (
    <>
      <h2 className="sd-h">{t('staff.tabs.audit')}</h2>
      <p className="sd-muted text-xs">{t('staff.auditNote')}</p>
      <label className="sd-field max-w-xs">
        <span>{t('staff.filterByAction')}</span>
        <select className="sd-input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">{t('staff.allActions')}</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`staff.actions.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <ErrorLine code={first.error} />
      <Panel icon={ScrollText} title={t('staff.auditCount', { n: rows.length })} flush>
        {first.data ? <AuditList rows={rows} onOpen={onOpen} /> : !first.error && <Loading />}
      </Panel>
      {first.data && first.data.length >= 100 && !end && (
        <button type="button" className="cz-btn cz-btn-secondary self-center" onClick={() => void more()}>
          {t('staff.loadMore')}
        </button>
      )}
    </>
  );
}

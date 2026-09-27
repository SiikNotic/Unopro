// Small building blocks shared by the staff dashboard's sections.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Role } from '@/account/accountContext';
import { ago, fmtDate } from './format';
import { PERIODS } from './lib';
import type { Period } from './lib';

export function ErrorLine({ code }: { code: string | null | undefined }) {
  const { t } = useI18n();
  return code ? (
    <p className="ac-error" role="alert">
      {t(`staff.errors.${code}`)}
    </p>
  ) : null;
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p className="sd-muted p-3" aria-busy="true">
      {t('staff.loading')}
    </p>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <p className="sd-muted p-3">{children ?? t('staff.none')}</p>;
}

export function Ago({ iso }: { iso: string | null | undefined }) {
  const { t, language } = useI18n();
  const a = ago(iso);
  if (!a) return <>—</>;
  return (
    <time dateTime={iso ?? undefined} title={fmtDate(iso, language)}>
      {t(`staff.ago.${a.unit}`, { n: a.n })}
    </time>
  );
}

export type Tone = 'good' | 'bad' | 'warn' | undefined;

export function Kpi({ label, value, hint, tone, icon: Icon }: { label: string; value: string; hint?: string; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className={`sd-kpi ${tone ? `is-${tone}` : ''}`}>
      <span className="sd-kpi-label">
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden />}
        {label}
      </span>
      <b className="cz-num">{value}</b>
      {hint && <span className="sd-kpi-hint">{hint}</span>}
    </div>
  );
}

/** A titled block. `action` sits on the right of the title (a "see all" link, a filter…). */
export function Panel({ title, icon: Icon, action, children, flush }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="sd-panel">
      {(title || action) && (
        <header className="sd-panel-head">
          {title && (
            <h3>
              {Icon && <Icon className="w-4 h-4" aria-hidden />}
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      <div className={flush ? '' : 'sd-panel-body'}>{children}</div>
    </section>
  );
}

export function PeriodPicker({ value, onChange }: { value: number; onChange: (d: Period) => void }) {
  const { t } = useI18n();
  return (
    <div className="sd-seg" role="group" aria-label={t('staff.period.label')}>
      {PERIODS.map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}>
          {t(`staff.period.d${d}`)}
        </button>
      ))}
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return <span className={`sd-badge ${role}`}>{t(`account.roleLabel.${role}`)}</span>;
}

/** A player's name as a button that opens their file. */
export function PlayerLink({ id, name, onOpen }: { id: string; name: string | null | undefined; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="sd-link" onClick={() => onOpen(id)}>
      {name ?? `${id.slice(0, 8)}…`}
    </button>
  );
}


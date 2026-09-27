// The frame of the Settings and Account screens: a lit night backdrop (optional painted art that fades out
// behind the header, never behind the content), the back button, the title and the subtitle.
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import './lux.css';

export function LuxPage({ title, subtitle, art, children, onBack }: { title: string; subtitle: string; art?: string; children: ReactNode; onBack?: () => void }) {
  const { goHome } = useNavigation();
  const { t } = useI18n();
  return (
    <div className="lx-page">
      <div className="lx-backdrop" aria-hidden>
        {art && <img src={art} alt="" decoding="async" />}
      </div>
      <div className="lx-wrap">
        <header className="lx-head">
          <button type="button" className="lx-back" onClick={onBack ?? goHome} aria-label={t('common.back')}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="lx-title">{title}</h1>
            <p className="lx-subtitle">{subtitle}</p>
          </div>
        </header>
        <div className="lx-content">{children}</div>
      </div>
    </div>
  );
}

/** A section title (and an optional line under it). */
export function LuxSection({ title, hint, children, id }: { title: string; hint?: string; children: ReactNode; id?: string }) {
  return (
    <section className="lx-section" aria-labelledby={id}>
      <div className="lx-section-head">
        <h2 id={id}>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** The round icon well used at the start of a row. */
export function LuxIcon({ icon: Icon, tone }: { icon: LucideIcon; tone?: 'gold' | 'red' }) {
  return (
    <span className={`lx-icon ${tone ? `is-${tone}` : ''}`} aria-hidden>
      <Icon className="w-[18px] h-[18px]" />
    </span>
  );
}

// The two boxes a player ticks to create an account: 18 or older, and acceptance of the Terms, the Privacy
// Policy and the Virtual Currency Rules (each readable in place).
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { Sheet } from '@/components/ui/Sheet';
import { legalDoc } from './content';
import type { DocId } from './content';
import type { Consent } from './consent';


/** One legal document, read inside the app. */
export function LegalDocSheet({ id, onClose }: { id: DocId; onClose: () => void }) {
  const { language } = useI18n();
  const doc = legalDoc(language === 'en' ? 'en' : 'es', id);
  return (
    <Sheet title={doc.title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h3 className="font-display font-bold text-white text-sm mb-1">{s.h}</h3>
            {s.p.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-white/80 mb-1.5 break-words">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  );
}

export function ConsentBox({ value, onChange, invalid }: { value: Consent; onChange: (c: Consent) => void; invalid?: boolean }) {
  const { t } = useI18n();
  const [reading, setReading] = useState<DocId | null>(null);
  const link = (id: DocId, label: string) => (
    <button type="button" className="ac-legal-link" onClick={() => setReading(id)}>
      {label}
    </button>
  );
  return (
    <fieldset className={`ac-consent ${invalid ? 'is-invalid' : ''}`} aria-describedby={invalid ? 'ac-consent-error' : undefined}>
      <legend className="sr-only">{t('gate.consentLegend')}</legend>
      <label className="ac-check">
        <input type="checkbox" checked={value.adult} onChange={(e) => onChange({ ...value, adult: e.target.checked })} />
        <span>{t('gate.adult')}</span>
      </label>
      <label className="ac-check">
        <input type="checkbox" checked={value.terms} onChange={(e) => onChange({ ...value, terms: e.target.checked })} />
        <span>
          {t('gate.accept')} {link('terms', t('gate.terms'))}, {link('privacy', t('gate.privacy'))} {t('gate.and')} {link('virtual', t('gate.virtual'))}.
        </span>
      </label>
      <p className="text-[11px] leading-snug text-[var(--cz-muted)]">{t('gate.virtualNote')}</p>
      {invalid && (
        <p id="ac-consent-error" className="ac-error" role="alert">
          {t('gate.consentRequired')}
        </p>
      )}
      {reading && <LegalDocSheet id={reading} onClose={() => setReading(null)} />}
    </fieldset>
  );
}

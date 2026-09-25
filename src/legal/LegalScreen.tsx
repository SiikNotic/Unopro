// Settings → Legal & Privacy: the list of documents, and each document (bilingual, from content.ts).
import { ChevronRight, FileText, Scale, ShieldCheck, Coins, HeartHandshake, Trash2, Mail, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { DOC_IDS, legalDoc, legalDocs } from './content';
import type { DocId, LegalLang } from './content';
import { LEGAL_CONFIG } from './config';

const ICONS: Record<DocId, LucideIcon> = { notice: Info, virtual: Coins, responsible: HeartHandshake, privacy: ShieldCheck, terms: Scale, deletion: Trash2, contact: Mail };

export function LegalScreen() {
  const { t, language } = useI18n();
  const { params, navigate, back } = useNavigation();
  const lang: LegalLang = language === 'en' ? 'en' : 'es';
  const id = DOC_IDS.includes(params.doc as DocId) ? (params.doc as DocId) : null;

  if (id) {
    const doc = legalDoc(lang, id);
    return (
      <ScreenContainer title={doc.title} subtitle={t('legal.updated', { date: LEGAL_CONFIG.updated })} onBack={() => back('legal')}>
        <article className="flex flex-col gap-4 pb-6">
          {doc.sections.map((s) => (
            <section key={s.h} className="menu-panel rounded-2xl p-4">
              <h2 className="font-display font-bold text-white text-base mb-2">{s.h}</h2>
              {s.p.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-white/80 mb-2 last:mb-0 break-words">
                  {p}
                </p>
              ))}
            </section>
          ))}
          {id === 'deletion' && (
            <button type="button" className="cz-btn cz-btn-secondary" onClick={() => navigate('account')}>
              <Trash2 className="w-4 h-4" /> {t('legal.goToAccount')}
            </button>
          )}
          <p className="text-xs text-white/50 px-1">
            {t('legal.webCopy')} {LEGAL_CONFIG.publicBase}
            {id}-{lang}.html
          </p>
        </article>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t('legal.title')} subtitle={t('legal.subtitle')} onBack={() => back('settings')}>
      <div className="flex flex-col gap-2 pb-6">
        {legalDocs(lang).map((d) => {
          const Icon = ICONS[d.id] ?? FileText;
          return (
            <button key={d.id} type="button" className="cz-row" onClick={() => navigate('legal', { doc: d.id })}>
              <span className="cz-row-icon">
                <Icon className="w-5 h-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold text-white text-[15px]">{d.title}</span>
                <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{d.summary}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
            </button>
          );
        })}
      </div>
    </ScreenContainer>
  );
}

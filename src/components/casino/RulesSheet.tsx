import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface RulesSheetProps {
  title: string;
  items: string[];
  onClose: () => void;
}

/** Rules of a game: a bottom sheet on phones, a centred dialog on larger screens. Esc or tapping outside closes it. */
export function RulesSheet({ title, items, onClose }: RulesSheetProps) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Latest onClose without re-running the effect: screens pass a new inline function on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cz-rules-title"
        onClick={(e) => e.stopPropagation()}
        className="cz-panel cz-fade-in w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5"
        style={{ paddingBottom: 'max(20px, var(--safe-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="cz-rules-title" className="font-display font-extrabold text-lg text-[var(--cz-ivory)]">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} className="cz-btn cz-btn-secondary cz-icon-btn" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <ol className="flex flex-col gap-3">
          {items.map((text, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-[var(--cz-ivory)]/90">
              <span className="flex-none w-6 h-6 rounded-full bg-[var(--cz-surface-2)] border border-[var(--cz-line)] text-[11px] font-bold flex items-center justify-center text-[var(--cz-gold)]">{i + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

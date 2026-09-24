import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Bottom sheet on phones, centred dialog on wider screens; Esc or a tap outside closes it. */
export function Sheet({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`cz-panel cz-fade-in w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 ${className}`}
        style={{ paddingBottom: 'max(20px, var(--safe-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id={titleId} className="font-display font-extrabold text-lg text-[var(--cz-ivory)]">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} className="cz-btn cz-btn-secondary cz-icon-btn" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

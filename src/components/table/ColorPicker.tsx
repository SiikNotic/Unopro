import { useEffect, useRef } from 'react';
import type { CardColor } from '@/game/engine';
import { COLORS } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';

/** Visual color chooser shown when the engine is waiting for CHOOSE_COLOR from the local player. */
export function ColorPicker({ onChoose }: { onChoose: (color: CardColor) => void }) {
  const { t } = useI18n();
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="color-picker-title">
      <div className="w-full max-w-sm rounded-3xl bg-ink-900/95 border border-white/10 p-5 shadow-card animate-scale-in">
        <h2 id="color-picker-title" className="text-center font-display font-bold text-lg mb-4">
          {t('table.chooseColor')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((color, i) => {
            const { className, Icon, labelKey } = COLOR_THEME[color];
            return (
              <button
                key={color}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                onClick={() => onChoose(color)}
                className={`pc-face ${className} !h-24 flex flex-col items-center justify-center gap-1 rounded-2xl transition-transform duration-150 hover:scale-[1.04] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
              >
                <Icon className="w-8 h-8 relative z-10" strokeWidth={2.5} />
                <span className="relative z-10 text-sm font-extrabold uppercase tracking-wide">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

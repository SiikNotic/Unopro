import { useEffect, useRef } from 'react';
import type { CardColor } from '@/game/engine';
import { COLORS } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';
import { SuitIcon, WildWheel } from './cardArt';

/**
 * Color chooser laid over the play zone when the engine waits for CHOOSE_COLOR from the local player.
 * Rendered inside the table stage so it reads as part of the table, not a browser dialog.
 */
export function ColorPicker({ onChoose }: { onChoose: (color: CardColor) => void }) {
  const { t } = useI18n();
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus({ preventScroll: true }), []);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3 bg-black/45 rounded-[inherit] animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="color-picker-title">
      <div className="panel panel-brass w-full max-w-[340px] rounded-3xl p-4 animate-rise">
        <div className="flex items-center justify-center gap-2 mb-3">
          <WildWheel className="w-7 h-7" withSuits={false} />
          <h2 id="color-picker-title" className="font-display font-extrabold text-base sm:text-lg">
            {t('table.chooseColor')}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((color, i) => {
            const { className, labelKey } = COLOR_THEME[color];
            return (
              <button
                key={color}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                onClick={() => onChoose(color)}
                className={`color-swatch ${className} min-h-[76px] rounded-2xl flex flex-col items-center justify-center gap-1 text-white transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}
              >
                <SuitIcon color={color} className="w-8 h-8 drop-shadow" />
                <span className="text-sm font-extrabold uppercase tracking-wide drop-shadow">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

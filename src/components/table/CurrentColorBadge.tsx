import type { CardColor } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';
import { SuitIcon } from './cardArt';

/** "CURRENT COLOR · RED" with the suit, so the color is never conveyed by hue alone. */
export function CurrentColorBadge({ color }: { color: CardColor | null }) {
  const { t } = useI18n();
  return (
    <div key={color ?? 'none'} className="chip flex items-center gap-2 rounded-full pl-1 pr-3 py-1 animate-pop" aria-live="polite">
      <span className={`color-swatch ${color ? COLOR_THEME[color].className : 'pc-wild'} w-6 h-6 rounded-full flex items-center justify-center`} style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 0 0 2px #f3ecdc' }}>
        {color && <SuitIcon color={color} className="w-3.5 h-3.5 text-white" />}
      </span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-400 font-semibold whitespace-nowrap">{t('table.currentColor')}</span>
      <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide whitespace-nowrap">{color ? t(COLOR_THEME[color].labelKey) : '—'}</span>
    </div>
  );
}

import type { CardColor } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';

/** "CURRENT COLOR · RED" with the suit icon, so the color is never conveyed by hue alone. */
export function CurrentColorBadge({ color }: { color: CardColor | null }) {
  const { t } = useI18n();
  const theme = color ? COLOR_THEME[color] : null;
  const Icon = theme?.Icon;
  return (
    <div
      key={color ?? 'none'}
      className="flex items-center gap-2 rounded-full bg-black/45 border border-white/10 pl-1 pr-3 py-1 animate-pop"
      aria-live="polite"
    >
      <span className={`pc-card !p-0 flex items-center justify-center !rounded-full ${theme?.className ?? 'pc-wild'}`} style={{ '--cw': '26px', height: 26 } as React.CSSProperties}>
        {Icon && <Icon className="w-3.5 h-3.5 relative z-10" strokeWidth={2.75} />}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold whitespace-nowrap">{t('table.currentColor')}</span>
      <span className="text-xs sm:text-sm font-extrabold uppercase">{color ? t(COLOR_THEME[color].labelKey) : '—'}</span>
    </div>
  );
}

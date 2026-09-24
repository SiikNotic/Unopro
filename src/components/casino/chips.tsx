import { Coins } from 'lucide-react';
import { useI18n } from '@/i18n';
import { CHIP_VALUES, chipColor, formatChips } from '@/casino/chipValues';

export function Chip({ value, size = 48, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="casino-chip" style={{ '--chip': chipColor(value), '--size': `${size}px` } as React.CSSProperties} aria-hidden>
      <span>{label ?? formatChips(value)}</span>
    </span>
  );
}

interface ChipSelectorProps {
  selected: number;
  onSelect: (value: number) => void;
  /** Chips above this are disabled. */
  max: number;
  values?: readonly number[];
}

/** Row of clay chips: pick the denomination each tap on the table will add. */
export function ChipSelector({ selected, onSelect, max, values = CHIP_VALUES }: ChipSelectorProps) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('casino.chipValue')} className="flex items-center justify-center gap-2 sm:gap-3 py-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={selected === v}
          aria-label={t('casino.chipOf', { amount: v })}
          disabled={v > max}
          onClick={() => onSelect(v)}
          className={`casino-chip ${selected === v ? 'casino-chip-selected' : ''}`}
          style={{ '--chip': chipColor(v), '--size': 'clamp(44px, 12vw, 54px)' } as React.CSSProperties}
        >
          <span>{formatChips(v)}</span>
        </button>
      ))}
    </div>
  );
}

/** Balance pill shown in every casino header. */
export function ChipBalance({ balance }: { balance: number }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/45 border border-gold-400/40 pl-1.5 pr-3 py-1 shadow-lg" aria-label={t('casino.balanceAria', { amount: balance })}>
      <span className="w-6 h-6 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 flex items-center justify-center text-ink-950">
        <Coins className="w-3.5 h-3.5" aria-hidden />
      </span>
      <span key={balance} className="font-display font-extrabold tabular-nums text-sm sm:text-base text-white casino-pop" aria-live="polite">
        {balance.toLocaleString()}
      </span>
    </div>
  );
}

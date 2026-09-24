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
    <div className="cz-pill cz-pill-gold px-2.5 shrink-0" style={{ minHeight: 36 }} aria-label={t('casino.balanceAria', { amount: balance })} title={t('casino.balance')}>
      <Coins className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden />
      <span key={balance} className="casino-pop text-[14px]" aria-live="polite">
        {formatChips(balance)}
      </span>
    </div>
  );
}

interface ChipAdderProps {
  onAdd: (value: number) => void;
  /** Chips above this are disabled. */
  max: number;
  values?: readonly number[];
}

/** Row of chips where each tap adds that chip to the bet. */
export function ChipAdder({ onAdd, max, values = CHIP_VALUES }: ChipAdderProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-1.5 min-[360px]:gap-2 sm:gap-3" role="group" aria-label={t('casino.addChips')}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-label={t('casino.addChip', { amount: v })}
          disabled={v > max}
          onClick={() => onAdd(v)}
          className="casino-chip active:translate-y-0.5"
          style={{ '--chip': chipColor(v), '--size': 'clamp(42px, 12.5vw, 54px)' } as React.CSSProperties}
        >
          <span>{formatChips(v)}</span>
        </button>
      ))}
    </div>
  );
}

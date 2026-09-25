// Power-ups under the board: Hammer, Divine Shuffle, Lightning, Olympus Power. Each shows its charges; one
// with none left is locked. Picking a targeted one arms it (the board then waits for a tap; tap it again to
// cancel). Kept below the board so it never covers a jewel.
import { memo } from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { BOOSTERS } from '../engine';
import type { Booster } from '../engine';
import type { Inventory } from '../progress';
import { BoosterIcon } from './OlympusArt';

interface PowerBarProps {
  inventory: Inventory;
  armed: Booster | null;
  disabled: boolean;
  onPick: (b: Booster) => void;
}

export const PowerBar = memo(function PowerBar({ inventory, armed, disabled, onPick }: PowerBarProps) {
  const { t } = useI18n();
  return (
    <nav className="ol-powers" aria-label={t('jewels.boosters')}>
      {BOOSTERS.map((b) => {
        const left = inventory[b];
        const locked = left <= 0;
        return (
          <button
            key={b}
            type="button"
            className={`ol-power${armed === b ? ' is-armed' : ''}${locked ? ' is-locked' : ''}`}
            disabled={disabled || locked}
            aria-pressed={armed === b}
            aria-label={t('jewels.boosterAria', { name: t(`jewels.booster.${b}`), n: left })}
            title={t(`jewels.boosterHint.${b}`)}
            onClick={() => onPick(b)}
          >
            <span className="ol-power-icon">
              <BoosterIcon booster={b} />
            </span>
            <span className="ol-power-count" aria-hidden>
              {locked ? <Lock className="w-3 h-3" /> : left}
            </span>
          </button>
        );
      })}
    </nav>
  );
});

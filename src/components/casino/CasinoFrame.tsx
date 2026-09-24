import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Gift, ShieldCheck } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { REFILL_CHIPS } from '@/casino/wallet';
import { scenarioStyle } from '@/game/scenarios/scenarios';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import type { Screen } from '@/types/navigation';
import { playSfx, unlockAudio } from '@/audio/sfx';
import { ChipBalance } from './chips';
import './casino.css';

interface CasinoFrameProps {
  title: string;
  subtitle?: string;
  back: Screen;
  scenario: ScenarioId;
  children: ReactNode;
}

/** Shared shell for the casino: animated scene, header with the chip balance, refill offer and the virtual-chips notice. */
export function CasinoFrame({ title, subtitle, back, scenario, children }: CasinoFrameProps) {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const { balance, canRefill, refill } = useWallet();

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { capture: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden" style={scenarioStyle(scenario) as React.CSSProperties}>
      <div className="fixed inset-0">
        <SceneBackground scenario={scenario} />
      </div>
      <div className="relative w-full max-w-3xl mx-auto px-3 sm:px-6 pt-4 pb-8 flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(back)}
            aria-label={t('common.back')}
            className="btn-game btn-secondary shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-extrabold text-xl sm:text-2xl text-white truncate drop-shadow">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-white/70 truncate">{subtitle}</p>}
          </div>
          <ChipBalance balance={balance} />
        </header>

        {canRefill && (
          <div className="glass-strong rounded-2xl p-3 flex flex-col sm:flex-row items-center gap-3 casino-pop" role="status">
            <p className="text-sm text-white text-center sm:text-left flex-1">{t('casino.broke')}</p>
            <Button
              size="sm"
              icon={<Gift className="w-4 h-4" />}
              onClick={() => {
                refill();
                playSfx('cashIn');
              }}
            >
              {t('casino.refill', { amount: REFILL_CHIPS })}
            </Button>
          </div>
        )}

        {children}

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] sm:text-xs text-white/60 px-2">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {t('casino.disclaimer')}
        </p>
      </div>
    </div>
  );
}

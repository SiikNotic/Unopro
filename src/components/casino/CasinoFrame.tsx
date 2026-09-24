import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleUserRound, Gift, HelpCircle, ShieldCheck } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { MusicButton } from '@/components/ui/MusicButton';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { useAccount } from '@/account/useAccount';
import { BanNotice } from '@/account/BanNotice';
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
  /** Replaces the animated scene with a custom backdrop. */
  backdrop?: ReactNode;
  /** Opens the game's rules. */
  onHelp?: () => void;
  /** Primary controls, pinned to the bottom of the screen (above the phone's home bar). */
  dock?: ReactNode;
  /** Widest the content may grow on tablets and desktops. */
  maxWidth?: string;
  /** Balance to show instead of the wallet's (a server balance, or one held back until reels stop). */
  balanceOverride?: number | null;
  /** Offer the free refill when the wallet runs dry (default true). */
  allowRefill?: boolean;
  /** A message about the last round (e.g. the account server refused or couldn't be reached). */
  error?: string | null;
  children: ReactNode;
}

/**
 * Shared shell for every casino game: a top bar that always says where you are and how to go back,
 * the table in the middle and the controls in a dock under the thumb. Respects notches and home bars.
 */
export function CasinoFrame({ title, subtitle, back, scenario, backdrop, onHelp, dock, maxWidth = 'max-w-3xl', balanceOverride, allowRefill = true, error, children }: CasinoFrameProps) {
  const { back: goBack } = useNavigation();
  const { t } = useI18n();
  const { balance, canRefill, refill, activeHere, playHere, mode } = useWallet();
  const account = useAccount();
  const { navigate } = useNavigation();

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { capture: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col overflow-x-clip" style={scenarioStyle(scenario) as React.CSSProperties}>
      <div className="fixed inset-0" aria-hidden>
        {backdrop ?? <SceneBackground scenario={scenario} />}
        {/* keep the backdrop as atmosphere; the game stays the brightest thing on screen */}
        <div className={`absolute inset-0 ${backdrop ? "bg-[#0a0e0c]/35" : "bg-[#0a0e0c]/60"}`} />
      </div>

      <header className="cz-topbar cz-safe-x">
        <div className={`mx-auto w-full ${maxWidth} flex items-center gap-2`}>
          <button type="button" onClick={() => goBack(back)} className="cz-btn cz-btn-quiet cz-btn-sm -ml-2 px-2 shrink-0" aria-label={t('casino.backToGames')}>
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">{t('casino.games')}</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-extrabold text-[17px] sm:text-xl leading-tight text-[var(--cz-ivory)] truncate">{title}</h1>
            {subtitle && <p className="hidden sm:block text-xs text-[var(--cz-muted)] truncate">{subtitle}</p>}
          </div>
          <span className="flex flex-col items-end">
            <ChipBalance balance={balanceOverride === undefined ? balance : balanceOverride} />
            {mode === 'account' && <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cz-gold)] leading-none mt-0.5">{t('casino.accountBadge')}</span>}
          </span>
          {onHelp && (
            <button type="button" onClick={onHelp} className="cz-btn cz-btn-secondary cz-icon-btn" aria-label={t('casino.rules')} title={t('casino.rules')}>
              <HelpCircle className="w-5 h-5" />
            </button>
          )}
          <MusicButton className="!hidden min-[400px]:!flex !w-11 !h-11 !rounded-xl" />
        </div>
      </header>

      <main className={`relative flex-1 mx-auto w-full ${maxWidth} cz-safe-x py-3 sm:py-5 flex flex-col gap-3 sm:gap-4`}>
        {!activeHere && (
          <div className="cz-panel p-3 flex items-center gap-3 cz-fade-in" role="status">
            <p className="text-sm text-[var(--cz-ivory)] flex-1 min-w-0">{t('casino.otherTab')}</p>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-sm shrink-0" onClick={playHere}>
              {t('casino.playHere')}
            </button>
          </div>
        )}
        {mode === 'account' && <BanNotice />}
        {mode === 'account' && account.coinsError && (
          <div className="cz-panel p-3 flex items-center gap-3 cz-fade-in" role="alert">
            <p className="text-sm text-[var(--cz-ivory)] flex-1 min-w-0">{t('account.coinsError')}</p>
            <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm shrink-0" onClick={() => void account.refreshCoins()}>
              {t('account.retry')}
            </button>
          </div>
        )}
        {error && (
          <div className="cz-panel p-3 text-sm text-[#ffd0d0] cz-fade-in" role="alert">
            {error}
          </div>
        )}
        {mode === 'account' && account.coins && account.coins.balance < 10 && (
          <div className="cz-panel p-3 text-sm text-[var(--cz-ivory)] cz-fade-in" role="status">
            {t('casino.accountBroke')}
          </div>
        )}
        {canRefill && allowRefill && activeHere && account.status === 'guest' && (
          <div className="cz-panel p-3 flex items-center gap-3 cz-fade-in" role="status">
            <p className="text-sm text-[var(--cz-ivory)] flex-1 min-w-0">{t('casino.guestUpsell')}</p>
            <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm shrink-0" onClick={() => navigate('account')}>
              <CircleUserRound className="w-4 h-4" />
              {t('account.signUp')}
            </button>
          </div>
        )}
        {canRefill && allowRefill && activeHere && (
          <div className="cz-panel p-3 flex items-center gap-3 cz-fade-in" role="status">
            <p className="text-sm text-[var(--cz-ivory)] flex-1 min-w-0">{t('casino.broke')}</p>
            <button
              type="button"
              className="cz-btn cz-btn-primary cz-btn-sm shrink-0"
              onClick={() => {
                refill();
                playSfx('cashIn');
              }}
            >
              <Gift className="w-4 h-4" />
              {t('casino.refillShort', { amount: REFILL_CHIPS })}
            </button>
          </div>
        )}
        {children}
        <p className="mt-auto flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--cz-muted)] px-2 pt-1">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {t('casino.disclaimer')}
        </p>
      </main>

      {dock && (
        <div className="cz-dock cz-safe-x">
          <div className={`mx-auto w-full ${maxWidth}`}>
            <div className="mx-auto w-full max-w-xl">{dock}</div>
          </div>
        </div>
      )}
    </div>
  );
}

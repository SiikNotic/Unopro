import { ChevronRight, LayoutGrid, Lock, ShieldCheck, Sliders, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { ChipBalance } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { GAME_MODES } from '@/game/rules/modes';
import type { Screen } from '@/types/navigation';

const iconMap: Record<string, LucideIcon> = {
  cards: LayoutGrid,
  users: Users,
  trophy: Trophy,
  sliders: Sliders,
};

const MiniWheel = () => (
  <svg viewBox="0 0 48 48" className="w-9 h-9" aria-hidden>
    <circle cx="24" cy="24" r="23" fill="#3b2416" stroke="#d8b26a" strokeWidth="1.5" />
    {Array.from({ length: 12 }, (_, i) => (
      <path key={i} d="M24 24 L24 4 A20 20 0 0 1 34 6.7 Z" transform={`rotate(${i * 30} 24 24)`} fill={i === 0 ? '#126642' : i % 2 ? '#a3222f' : '#1a1c1e'} />
    ))}
    <circle cx="24" cy="24" r="8" fill="#d8b26a" />
  </svg>
);

const CASINO_GAMES: { screen: Screen; key: 'blackjack' | 'roulette' | 'slots'; art: React.ReactNode }[] = [
  {
    screen: 'blackjack',
    key: 'blackjack',
    art: (
      <span className="relative w-10 h-10 flex items-center justify-center">
        <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={22} className="absolute -rotate-12 -translate-x-1.5" />
        <PlayingCardView card={{ id: 'k', rank: 'K', suit: 'H' }} width={22} className="absolute rotate-12 translate-x-1.5" />
      </span>
    ),
  },
  { screen: 'roulette', key: 'roulette', art: <MiniWheel /> },
  { screen: 'slots', key: 'slots', art: <SlotSymbolIcon symbol="seven" className="w-8 h-8" /> },
];

/** "Play": the one place to pick what to play — Carta modes and casino games. */
export function GameModesScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const { balance } = useWallet();

  return (
    <ScreenContainer title={t('gameModes.title')} subtitle={t('gameModes.subtitle')}>
      <div className="flex flex-col gap-7">
        <section className="animate-slide-up">
          <div className="flex items-end justify-between gap-3 mb-2 px-1">
            <div>
              <h2 className="font-display font-bold text-white text-base">{t('gameModes.cartaTitle')}</h2>
              <p className="text-xs text-[var(--cz-muted)]">{t('gameModes.cartaSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {GAME_MODES.map((mode) => {
              const Icon = iconMap[mode.icon] ?? LayoutGrid;
              return (
                <button key={mode.id} type="button" className="cz-row" disabled={!mode.enabled} onClick={() => navigate('play', { mode: mode.id })}>
                  <span className="cz-row-icon">
                    <Icon className="w-5 h-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display font-bold text-white text-[15px]">{t(mode.nameKey)}</span>
                      {!mode.enabled && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cz-line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--cz-muted)]">
                          <Lock className="w-3 h-3" aria-hidden /> {t('common.comingSoon')}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(mode.descriptionKey)}</span>
                    <span className="block text-[11px] text-[var(--cz-muted)]/80 mt-1">{t('gameModes.players', { min: mode.minPlayers, max: mode.maxPlayers })}</span>
                  </span>
                  {mode.enabled && <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="animate-slide-up" style={{ animationDelay: '0.06s' }}>
          <div className="flex items-end justify-between gap-3 mb-2 px-1">
            <div className="min-w-0">
              <h2 className="font-display font-bold text-white text-base">{t('casino.title')}</h2>
              <p className="text-xs text-[var(--cz-muted)]">{t('gameModes.casinoSubtitle')}</p>
            </div>
            <ChipBalance balance={balance} />
          </div>
          <div className="flex flex-col gap-2">
            {CASINO_GAMES.map((g) => (
              <button key={g.key} type="button" className="cz-row" onClick={() => navigate(g.screen)}>
                <span className="cz-row-icon bg-[rgba(17,86,59,0.45)] border-[rgba(216,178,106,0.3)]">{g.art}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold text-white text-[15px]">{t(`casino.${g.key}.name`)}</span>
                  <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`casino.${g.key}.description`)}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 px-1 text-[11px] text-[var(--cz-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {t('casino.disclaimer')}
          </p>
        </section>
      </div>
    </ScreenContainer>
  );
}

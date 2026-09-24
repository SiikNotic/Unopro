import { ChevronRight } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { useI18n } from '@/i18n';
import type { Screen } from '@/types/navigation';

interface GameEntry {
  screen: Screen;
  key: 'blackjack' | 'roulette' | 'slots';
  art: React.ReactNode;
}

const MiniWheel = () => (
  <svg viewBox="0 0 48 48" className="w-14 h-14 drop-shadow-lg" aria-hidden>
    <circle cx="24" cy="24" r="23" fill="#3b2416" stroke="#c9a24a" strokeWidth="1.5" />
    {Array.from({ length: 12 }, (_, i) => (
      <path
        key={i}
        d="M24 24 L24 4 A20 20 0 0 1 34 6.7 Z"
        transform={`rotate(${i * 30} 24 24)`}
        fill={i === 0 ? '#1a9a5c' : i % 2 ? '#c8202f' : '#16161f'}
      />
    ))}
    <circle cx="24" cy="24" r="8" fill="#c9a24a" />
    <circle cx="24" cy="9" r="2.4" fill="#fff" />
  </svg>
);

export function CasinoScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();

  const games: GameEntry[] = [
    {
      screen: 'blackjack',
      key: 'blackjack',
      art: (
        <span className="relative w-14 h-14 flex items-center justify-center">
          <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={30} className="absolute -rotate-12 -translate-x-2" />
          <PlayingCardView card={{ id: 'k', rank: 'K', suit: 'H' }} width={30} className="absolute rotate-12 translate-x-2" />
        </span>
      ),
    },
    { screen: 'roulette', key: 'roulette', art: <MiniWheel /> },
    {
      screen: 'slots',
      key: 'slots',
      art: (
        <span className="w-14 h-14 rounded-xl bg-[#fffdf6] flex items-center justify-center shadow-lg">
          <SlotSymbolIcon symbol="seven" className="w-10 h-10" />
        </span>
      ),
    },
  ];

  return (
    <CasinoFrame title={t('casino.title')} subtitle={t('casino.subtitle')} back="home" scenario="lounge">
      <div className="casino-felt p-5 sm:p-7 mx-2 my-2 flex flex-col items-center gap-3 text-center">
        <div className="flex -space-x-3" aria-hidden>
          {[10, 25, 50, 100, 500].map((v, i) => (
            <span key={v} style={{ transform: `translateY(${Math.abs(i - 2) * 3}px)` }}>
              <Chip value={v} size={42} />
            </span>
          ))}
        </div>
        <p className="font-display font-bold text-white text-lg">{t('casino.welcome')}</p>
        <p className="text-sm text-white/75 max-w-sm">{t('casino.welcomeText')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {games.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => navigate(g.screen)}
            className="btn-game btn-secondary w-full rounded-2xl p-3 sm:p-4 flex items-center gap-4 text-left"
          >
            <span className="shrink-0">{g.art}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-extrabold text-white text-lg">{t(`casino.${g.key}.name`)}</span>
              <span className="block text-xs sm:text-sm text-ink-400 leading-snug">{t(`casino.${g.key}.description`)}</span>
            </span>
            <ChevronRight className="w-5 h-5 shrink-0 text-gold-400" aria-hidden />
          </button>
        ))}
      </div>
    </CasinoFrame>
  );
}

import { ChevronRight, Globe, LayoutGrid, ShieldCheck, Users } from 'lucide-react';
import { onlineConfig } from '@/games/online/client';
import type { OnlineGame } from '@/types/navigation';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { ChipBalance } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { BingoArt, DominoArt } from '@/games/shared/ui/GameArt';
import type { Screen } from '@/types/navigation';

/** Every multiplayer game opens its setup (GameSetupScreen); the slot machines are single-player. */
const SETUP: Record<OnlineGame, Screen> = { carta: 'cartaSetup', domino: 'dominoSetup', bingo: 'bingoSetup', blackjack: 'blackjackSetup', roulette: 'rouletteSetup' };

const TABLE_GAMES: { key: 'carta' | 'domino' | 'bingo'; screen: Screen; art: React.ReactNode }[] = [
  { key: 'carta', screen: 'cartaSetup', art: <LayoutGrid className="w-5 h-5" aria-hidden /> },
  { key: 'domino', screen: 'dominoSetup', art: <DominoArt size={14} /> },
  { key: 'bingo', screen: 'bingoSetup', art: <BingoArt size={14} /> },
];

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
    screen: 'blackjackSetup',
    key: 'blackjack',
    art: (
      <span className="relative w-10 h-10 flex items-center justify-center">
        <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={22} className="absolute -rotate-12 -translate-x-1.5" />
        <PlayingCardView card={{ id: 'k', rank: 'K', suit: 'H' }} width={22} className="absolute rotate-12 translate-x-1.5" />
      </span>
    ),
  },
  { screen: 'rouletteSetup', key: 'roulette', art: <MiniWheel /> },
  { screen: 'slotLobby', key: 'slots', art: <SlotSymbolIcon symbol="seven" className="w-8 h-8" /> },
];

const ONLINE: { game: OnlineGame; art: React.ReactNode }[] = [
  { game: 'carta', art: <Users className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden /> },
  { game: 'blackjack', art: CASINO_GAMES[0].art },
  { game: 'roulette', art: <MiniWheel /> },
];

/** "Play": the one place to pick what to play. Each game then opens its setup screen. */
export function GameModesScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const { balance } = useWallet();
  const online = onlineConfig() !== null;

  return (
    <ScreenContainer title={t('gameModes.title')} subtitle={t('gameModes.subtitle')}>
      <div className="flex flex-col gap-7">
        <section className="animate-slide-up">
          <div className="flex items-end justify-between gap-3 mb-2 px-1">
            <div>
              <h2 className="font-display font-bold text-white text-base">{t('gameModes.tableTitle')}</h2>
              <p className="text-xs text-[var(--cz-muted)]">{t('gameModes.tableSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {TABLE_GAMES.map((g) => (
              <button key={g.key} type="button" className="cz-row" onClick={() => navigate(g.screen)}>
                <span className="cz-row-icon">{g.art}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold text-white text-[15px]">{t(`hub.${g.key}.name`)}</span>
                  <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`hub.${g.key}.desc`)}</span>
                  <span className="block text-[11px] text-[var(--cz-muted)]/80 mt-1">{t(`hub.${g.key}.players`)}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
              </button>
            ))}
          </div>
        </section>

        {online && (
          <section className="animate-slide-up" style={{ animationDelay: '0.03s' }}>
            <div className="mb-2 px-1">
              <h2 className="font-display font-bold text-white text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden /> {t('gameModes.onlineTitle')}
              </h2>
              <p className="text-xs text-[var(--cz-muted)]">{t('gameModes.onlineSubtitle')}</p>
            </div>
            <div className="flex flex-col gap-2">
              {ONLINE.map((g) => (
                <button key={g.game} type="button" className="cz-row" onClick={() => navigate(SETUP[g.game], { online: true })}>
                  <span className="cz-row-icon bg-[rgba(216,178,106,0.14)] border-[rgba(216,178,106,0.4)]">{g.art}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-white text-[15px]">{t(`gameModes.online.${g.game}.name`)}</span>
                    <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`gameModes.online.${g.game}.description`)}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        )}

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

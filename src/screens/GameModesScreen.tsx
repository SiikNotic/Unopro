import { ChevronRight, Globe, ShieldCheck, Users } from 'lucide-react';
import { onlineConfig } from '@/games/online/client';
import type { OnlineGame, Screen } from '@/types/navigation';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { ChipBalance } from '@/components/casino/chips';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { useGameAvailability } from '@/games/availability';
import { GAMES, gamesIn } from '@/games/catalog';
import type { GameInfo } from '@/games/catalog';
import { GameIcon } from '@/games/GameIcon';

/** Every multiplayer game opens its setup (GameSetupScreen); the slot machines are single-player. */
const SETUP: Record<OnlineGame, Screen> = { carta: 'cartaSetup', domino: 'dominoSetup', bingo: 'bingoSetup', blackjack: 'blackjackSetup', roulette: 'rouletteSetup' };

const ONLINE_ICON: Record<'carta' | 'blackjack' | 'roulette', React.ReactNode> = {
  carta: <Users className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden />,
  blackjack: <GameIcon id="blackjack" />,
  roulette: <GameIcon id="roulette" />,
};

/** One game in a list: its picture, name and line, and a clear badge when the owner has it out of service. */
function GameRow({ game, iconClass = '', extra }: { game: GameInfo; iconClass?: string; extra?: string }) {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const availability = useGameAvailability();
  const off = game.controlled !== null && !availability[game.controlled];
  return (
    <button type="button" className={`cz-row ${off ? 'opacity-70' : ''}`} onClick={() => navigate(game.screen)}>
      <span className={`cz-row-icon overflow-hidden ${iconClass}`}>
        <GameIcon id={game.id} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0">
          <span className="block font-display font-bold text-white text-[15px] truncate">{t(game.nameKey)}</span>
          {off && <span className="shrink-0 rounded-full border border-[#ff8a8a]/40 bg-[#ff5d5d]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffb3b3]">{t('availability.badge')}</span>}
        </span>
        <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(game.descKey)}</span>
        {extra && <span className="block text-[11px] text-[var(--cz-muted)]/80 mt-1">{extra}</span>}
      </span>
      <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
    </button>
  );
}

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
            {gamesIn('table').map((g) => (
              <GameRow key={g.id} game={g} extra={t(`hub.${g.id}.players`)} />
            ))}
          </div>
        </section>

        <section className="animate-slide-up" style={{ animationDelay: '0.02s' }}>
          <div className="mb-2 px-1">
            <h2 className="font-display font-bold text-white text-base">{t('gameModes.puzzleTitle')}</h2>
            <p className="text-xs text-[var(--cz-muted)]">{t('gameModes.puzzleSubtitle')}</p>
          </div>
          {gamesIn('puzzle').map((g) => (
            <GameRow key={g.id} game={g} iconClass="bg-[rgba(120,70,190,0.3)] border-[rgba(216,178,106,0.4)]" />
          ))}
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
              {GAMES.flatMap((g) => (g.online ? [g.online] : [])).map((game) => (
                <button key={game} type="button" className="cz-row" onClick={() => navigate(SETUP[game], { online: true })}>
                  <span className="cz-row-icon overflow-hidden bg-[rgba(216,178,106,0.14)] border-[rgba(216,178,106,0.4)]">{ONLINE_ICON[game]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-white text-[15px]">{t(`gameModes.online.${game}.name`)}</span>
                    <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`gameModes.online.${game}.description`)}</span>
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
            {gamesIn('casino').map((g) => (
              <GameRow key={g.id} game={g} iconClass="bg-[rgba(17,86,59,0.45)] border-[rgba(216,178,106,0.3)]" />
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

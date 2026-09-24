import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, CircleUserRound, Coins, Gift, Layers, Play, Settings, ShieldCheck, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { MusicButton } from '@/components/ui/MusicButton';
import { GameArt } from '@/components/lobby/lobbyArt';
import { MOODS } from '@/components/lobby/lobbyMoods';
import type { LobbyGame } from '@/components/lobby/lobbyMoods';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { formatChips } from '@/casino/chipValues';
import { useProfileName } from '@/settings/profile';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import type { Screen } from '@/types/navigation';
import { GamesHub } from '@/games/shared/ui/GamesHub';
import { useAccount } from '@/account/useAccount';

interface GameEntry {
  id: LobbyGame;
  /** Casino games open directly (Carta lives in the games hub above). */
  screen: Screen;
}

const GAMES: GameEntry[] = [
  { id: 'blackjack', screen: 'blackjack' },
  { id: 'roulette', screen: 'roulette' },
  { id: 'slots', screen: 'slotLobby' },
];

const HERO_MS = 6500;

/** Featured games, one at a time: swipe, dots or auto-advance (paused by reduced motion or a touch). */
function Hero({ onPlay }: { onPlay: (g: GameEntry) => void }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [index, setIndex] = useState(0);
  const pausedUntil = useRef(0);
  const start = useRef<number | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (performance.now() < pausedUntil.current || document.hidden) return;
      setIndex((i) => (i + 1) % GAMES.length);
    }, HERO_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  const go = (i: number) => {
    pausedUntil.current = performance.now() + HERO_MS * 2;
    setIndex((i + GAMES.length) % GAMES.length);
  };
  const artSize = Math.round(Math.min(96, Math.max(58, vw * 0.17)));

  return (
    <section
      className="relative"
      aria-roledescription="carousel"
      aria-label={t('lobby.featured')}
      onPointerDown={(e) => {
        start.current = e.clientX;
        swiped.current = false;
      }}
      onPointerMove={(e) => {
        if (start.current !== null && Math.abs(e.clientX - start.current) > 12) swiped.current = true;
      }}
      onPointerCancel={() => (start.current = null)}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const dx = e.clientX - start.current;
        start.current = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
      // A swipe that ends on the Play button must not also press it.
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div className="lobby-hero relative overflow-hidden rounded-[26px]">
        {GAMES.map((g, i) => {
          const active = i === index;
          return (
            <div
              key={g.id}
              className={`lobby-slide ${active ? 'lobby-slide-on' : ''}`}
              style={{ background: MOODS[g.id].bg }}
              aria-hidden={!active}
              role="group"
              aria-roledescription="slide"
              aria-label={t('lobby.slideOf', { n: i + 1, total: GAMES.length })}
            >
              <div className="absolute inset-0 lobby-light" style={{ background: `radial-gradient(60% 55% at 72% 30%, ${MOODS[g.id].light}, transparent 70%)` }} />
              <div className="absolute right-[-2%] top-[7%] sm:right-[4%] sm:top-1/2 sm:-translate-y-1/2 lobby-float">
                <GameArt game={g.id} size={artSize} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent sm:bg-gradient-to-r sm:from-black/80 sm:via-black/35 sm:to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 sm:max-w-[58%] sm:top-0 sm:flex sm:flex-col sm:justify-center">
                <span className="self-start inline-flex items-center gap-1.5 rounded-full border border-[rgba(216,178,106,0.45)] bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cz-gold-hover)]">
                  {t(`lobby.tag.${g.id}`)}
                </span>
                <h2 className="mt-2 font-display font-extrabold text-[28px] sm:text-4xl leading-[1.05] text-white">{t(`lobby.name.${g.id}`)}</h2>
                <p className="mt-1.5 text-sm sm:text-base text-white/75 leading-snug max-w-[34ch]">{t(`lobby.pitch.${g.id}`)}</p>
                <button type="button" tabIndex={active ? 0 : -1} className="cz-btn cz-btn-primary cz-btn-lg mt-4 w-full sm:w-auto sm:self-start sm:px-8" onClick={() => onPlay(g)}>
                  <Play className="w-5 h-5" /> {t('lobby.play')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-center" role="tablist" aria-label={t('lobby.featured')}>
        {GAMES.map((g, i) => (
          <button key={g.id} type="button" role="tab" aria-selected={i === index} aria-label={t(`lobby.name.${g.id}`)} onClick={() => go(i)} className="w-9 h-9 flex items-center justify-center">
            <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-[var(--cz-gold)]' : 'w-1.5 bg-white/30'}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

function GameTile({ game, onPlay }: { game: GameEntry; onPlay: () => void }) {
  const { t } = useI18n();
  const vw = useViewport().width;
  const artSize = Math.round(Math.min(52, Math.max(34, vw * 0.095)));
  return (
    <button type="button" onClick={onPlay} className="lobby-card group text-left" aria-label={`${t('lobby.play')} ${t(`lobby.name.${game.id}`)}`}>
      <div className="relative aspect-[5/4] overflow-hidden rounded-t-[18px]" style={{ background: MOODS[game.id].bg }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 70% at 60% 30%, ${MOODS[game.id].light}, transparent 70%)` }} />
        <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.04]">
          <GameArt game={game.id} size={artSize} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[15px] leading-tight text-white line-clamp-2">{t(`lobby.name.${game.id}`)}</p>
          <p className="text-[11px] text-[var(--cz-muted)] truncate">{t(`lobby.tag.${game.id}`)}</p>
        </div>
        <span className="hidden sm:flex flex-none w-9 h-9 rounded-full bg-[var(--cz-gold)] text-[var(--cz-gold-ink)] items-center justify-center transition-transform group-active:scale-90" aria-hidden>
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </span>
      </div>
    </button>
  );
}

function Shortcut({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 w-full min-h-[56px] px-3 py-2 rounded-xl text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]">
      <span className="flex-none w-10 h-10 rounded-xl bg-white/[0.05] border border-[var(--cz-line)] flex items-center justify-center text-[var(--cz-muted)]">
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--cz-ivory)]">{label}</span>
        <span className="block text-xs text-[var(--cz-muted)] truncate">{hint}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-[var(--cz-muted)]" aria-hidden />
    </button>
  );
}

/** The lobby: featured game, the game library, and quiet secondary links. */
export function HomeScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const { balance } = useWallet();
  const account = useAccount();
  const [profileName] = useProfileName();
  const name = account.user?.name || profileName;
  const play = (g: GameEntry) => navigate(g.screen);

  return (
    <div className="lobby relative min-h-[100dvh] w-full overflow-x-clip">
      <div className="lobby-ambient" aria-hidden />

      <header className="cz-topbar cz-safe-x">
        <div className="mx-auto w-full max-w-5xl flex items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex-none w-9 h-9 rounded-xl bg-gradient-to-br from-[#e8c887] to-[#a8792c] flex items-center justify-center shadow-[0_4px_14px_-6px_rgba(216,178,106,0.8)]">
              <Layers className="w-5 h-5 text-[#1c1509]" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block font-display font-extrabold text-[17px] text-white tracking-tight truncate">Carta</span>
              <span className="block text-[9px] font-bold tracking-[0.3em] text-[var(--cz-gold)]">CASINO</span>
            </span>
          </div>
          <button type="button" onClick={() => navigate('profile')} className="cz-pill cz-pill-gold px-3" style={{ minHeight: 44 }} aria-label={t('lobby.balanceProfile', { amount: balance })}>
            <Coins className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden />
            <span className="text-[14px]">{formatChips(balance)}</span>
          </button>
          {account.status !== 'off' && (
            <button type="button" onClick={() => navigate('account')} className={`cz-btn cz-icon-btn ${account.status === 'user' ? 'cz-btn-secondary !border-[rgba(216,178,106,0.55)]' : 'cz-btn-secondary'}`} aria-label={t('account.entry')} title={t('account.entry')}>
              {account.user?.avatar ? <img src={account.user.avatar} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" /> : <CircleUserRound className={`w-5 h-5 ${account.status === 'user' ? 'text-[var(--cz-gold)]' : ''}`} />}
            </button>
          )}
          <MusicButton className="!hidden min-[400px]:!flex !w-11 !h-11 !rounded-xl" />
          <button type="button" onClick={() => navigate('settings')} className="cz-btn cz-btn-secondary cz-icon-btn" aria-label={t('home.settings')} title={t('home.settings')}>
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl cz-safe-x pt-4 sm:pt-6 flex flex-col gap-7 sm:gap-9" style={{ paddingBottom: 'max(32px, calc(var(--safe-bottom) + 20px))' }}>
        <div className="lobby-rise">
          <p className="text-sm text-[var(--cz-muted)]">{name ? t('lobby.hello', { name }) : t('lobby.helloGuest')}</p>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white leading-tight">{t('lobby.headline')}</h1>
          {account.status === 'guest' && (
            <button type="button" onClick={() => navigate('account')} className="mt-3 w-full sm:w-auto flex items-center gap-3 rounded-2xl border border-[rgba(216,178,106,0.45)] bg-[linear-gradient(120deg,rgba(216,178,106,0.22),rgba(216,178,106,0.06))] px-3.5 py-3 text-left transition-colors hover:bg-[rgba(216,178,106,0.2)]">
              <span className="flex-none w-10 h-10 rounded-xl bg-[var(--cz-gold)] text-[var(--cz-gold-ink)] flex items-center justify-center">
                <Gift className="w-5 h-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold text-[15px] text-white">{t('account.guestCta')}</span>
                <span className="block text-xs text-white/70">{t('account.guestCtaHint')}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden />
            </button>
          )}
        </div>

        <section className="lobby-rise" style={{ animationDelay: '60ms' }} aria-labelledby="lobby-hub">
          <div className="mb-3">
            <h2 id="lobby-hub" className="font-display font-bold text-lg text-white">{t('hub.title')}</h2>
            <p className="text-xs text-[var(--cz-muted)]">{t('hub.hint')}</p>
          </div>
          <GamesHub />
        </section>

        <section className="lobby-rise" style={{ animationDelay: '120ms' }} aria-labelledby="lobby-games">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 id="lobby-games" className="font-display font-bold text-lg text-white">{t('lobby.casino')}</h2>
              <p className="text-xs text-[var(--cz-muted)]">{t('lobby.casinoHint')}</p>
            </div>
          </div>
          <Hero onPlay={play} />
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mt-3">
            {GAMES.map((g) => (
              <GameTile key={g.id} game={g} onPlay={() => play(g)} />
            ))}
          </div>
        </section>

        <section className="lobby-rise" style={{ animationDelay: '180ms' }} aria-labelledby="lobby-more">
          <h2 id="lobby-more" className="cz-label mb-1 px-1">{t('lobby.more')}</h2>
          <div className="grid sm:grid-cols-3 gap-1 sm:gap-2">
            <Shortcut icon={BookOpen} label={t('home.tutorial')} hint={t('lobby.tutorialHint')} onClick={() => navigate('tutorial')} />
            <Shortcut icon={UserRound} label={t('lobby.profile')} hint={t('lobby.profileHint')} onClick={() => navigate('profile')} />
            <Shortcut icon={Settings} label={t('home.settings')} hint={t('lobby.settingsHint')} onClick={() => navigate('settings')} />
          </div>
        </section>

        <footer className="flex flex-col items-center gap-1 text-center">
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--cz-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {t('casino.disclaimer')}
          </p>
          <p className="text-[10px] text-[var(--cz-muted)]/70">v0.3.0</p>
        </footer>
      </main>
    </div>
  );
}

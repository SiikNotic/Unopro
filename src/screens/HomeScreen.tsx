// The home screen: a luxury social-casino lobby. Header (brand, player, coins), the welcome hero, the
// category rail, popular games, the Jewellery: Olympus promo, casino games, the real extras (online rooms,
// the Bank's daily coins, the tutorial), a recommended rail, and the bottom navigation with the Play orb.
// Every card opens an existing screen; nothing here pretends to be a feature the app does not have.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronRight, CircleDot, Cherry, Club, Crown, Gem, Globe, GraduationCap, House, Landmark, LayoutGrid, Menu, Play, Plus, Settings, ShieldCheck, Spade, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { formatChips } from '@/casino/chipValues';
import { useAccount } from '@/account/useAccount';
import { usePlayerName } from '@/account/usePlayerName';
import { onlineConfig } from '@/games/online/client';
import { CASINO, CATEGORIES, EXTRA_IMAGES, HERO_ART, HOME_GAMES, POPULAR, PROMO_IMAGE, RECOMMENDED } from './home/homeGames';
import type { HomeCategory, HomeGame, HomeGameId } from './home/homeGames';
import './home/home.css';

const CATEGORY_ICON: Record<HomeCategory, LucideIcon> = { all: LayoutGrid, cards: Spade, table: CircleDot, slots: Cherry, puzzle: Gem };

function Logo() {
  return (
    <span className="hm-logo" aria-label="Carta Casino">
      <Crown className="hm-logo-crown" aria-hidden />
      <span className="hm-logo-word">Carta</span>
      <span className="hm-logo-sub">CASINO</span>
    </span>
  );
}

function SectionHead({ id, icon: Icon, title, action }: { id: string; icon: LucideIcon; title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="hm-head">
      <h2 id={id} className="hm-title">
        <Icon className="hm-title-icon" aria-hidden />
        {title}
      </h2>
      {action && (
        <button type="button" className="hm-see" onClick={action.onClick}>
          {action.label} <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** A large game card: art, name, short description and a Play button. */
function GameCard({ game, size = 'big', onPlay }: { game: HomeGame; size?: 'big' | 'small'; onPlay: () => void }) {
  const { t } = useI18n();
  const name = t(`home2.game.${game.id}.name`);
  return (
    <button type="button" className={`hm-card is-${size}${game.image ? ' has-image' : ''}`} style={{ '--hm-bg': game.bg, '--hm-accent': game.accent } as CSSProperties} onClick={onPlay} aria-label={t('home2.playAria', { name })}>
      <span className="hm-card-art" aria-hidden>
        {game.image ? <img src={game.image} alt="" loading="lazy" /> : game.art(size === 'big' ? 64 : 52)}
      </span>
      <span className="hm-card-body">
        <span className="hm-card-name">{name}</span>
        <span className="hm-card-desc">{t(`home2.game.${game.id}.desc`)}</span>
        {size === 'big' && <span className="hm-card-cta">{t('lobby.play')}</span>}
      </span>
    </button>
  );
}

function Hero({ onPlay }: { onPlay: () => void }) {
  const { t } = useI18n();
  return (
    <section className="hm-hero" aria-labelledby="hm-hero-title">
      <picture className="hm-hero-img" aria-hidden>
        <source media="(min-width: 720px)" srcSet={HERO_ART.landscape} />
        <img src={HERO_ART.portrait} alt="" />
      </picture>
      <div className="hm-hero-shade" aria-hidden />
      <div className="hm-hero-copy">
        <p className="hm-hero-kicker">{t('home2.welcome')}</p>
        <h1 id="hm-hero-title" className="hm-hero-title">
          Carta
          <span>CASINO</span>
        </h1>
        <p className="hm-hero-tag">{t('home2.tagline')}</p>
        <button type="button" className="hm-gold-btn" onClick={onPlay}>
          <Play className="w-5 h-5" fill="currentColor" aria-hidden /> {t('home2.playNow')}
        </button>
      </div>
    </section>
  );
}

/** The promo banner: the Bank's daily coins (a real feature: the daily loan and rewarded ads). */
function CoinsBanner({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="hm-promo" style={{ '--hm-promo-bg': `url(${PROMO_IMAGE})` } as CSSProperties} onClick={onOpen} aria-label={t('home2.promo.aria')}>
      <span className="hm-promo-copy">
        <span className="hm-promo-chip">{t('home2.promo.chip')}</span>
        <span className="hm-promo-title">{t('home2.promo.title')}</span>
        <span className="hm-promo-sub">{t('home2.promo.sub')}</span>
      </span>
      <span className="hm-gold-btn is-sm" aria-hidden>
        {t('home2.promo.cta')}
      </span>
    </button>
  );
}

function BottomNav({ onPlay }: { onPlay: () => void }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const item = (Icon: LucideIcon, label: string, onClick: () => void, active = false) => (
    <button type="button" className={`hm-nav-item ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <Icon className="w-[22px] h-[22px]" aria-hidden />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="hm-nav" aria-label={t('home2.nav.aria')}>
      <div className="hm-nav-inner">
        {item(House, t('home2.nav.home'), () => window.scrollTo({ top: 0, behavior: 'smooth' }), true)}
        {item(LayoutGrid, t('home2.nav.games'), () => navigate('gameModes'))}
        <button type="button" className="hm-orb" onClick={onPlay} aria-label={t('home2.playNow')}>
          <span className="hm-orb-ball">
            <Club className="w-7 h-7" fill="currentColor" aria-hidden />
          </span>
          <span className="hm-orb-label">{t('home2.nav.play')}</span>
        </button>
        {item(Landmark, t('home2.nav.bank'), () => navigate('bank'))}
        {item(UserRound, t('home2.nav.profile'), () => navigate('profile'))}
        {item(Menu, t('home2.nav.more'), () => navigate('settings'))}
      </div>
    </nav>
  );
}

export function HomeScreen() {
  const { navigate } = useNavigation();
  const { t } = useI18n();
  const { balance } = useWallet();
  const account = useAccount();
  const name = usePlayerName();
  const online = useMemo(() => onlineConfig() !== null, []);
  const [category, setCategory] = useState<HomeCategory>('all');
  const open = (id: HomeGameId) => navigate(HOME_GAMES[id].screen);
  const playNow = () => navigate('gameModes');
  const filtered = category === 'all' ? [] : (Object.values(HOME_GAMES) as HomeGame[]).filter((g) => g.category === category);

  const events: { key: 'online' | 'learn'; icon: LucideIcon; tone: string; onClick: () => void }[] = [
    ...(online ? [{ key: 'online' as const, icon: Globe, tone: 'purple', onClick: () => navigate('cartaSetup', { online: true }) }] : []),
    { key: 'learn' as const, icon: GraduationCap, tone: 'red', onClick: () => navigate('tutorial') },
  ];

  return (
    <div className="hm">
      <header className="hm-top cz-safe-x">
        <div className="hm-wrap hm-top-row">
          <Logo />
          <button type="button" className="hm-player" onClick={() => navigate(account.status === 'off' ? 'profile' : 'account')} aria-label={t('account.entry')}>
            <span className="hm-avatar">{account.user?.avatar ? <img src={account.user.avatar} alt="" referrerPolicy="no-referrer" /> : <UserRound className="w-5 h-5" aria-hidden />}</span>
            <span className="hm-player-name">{name || t('lobby.helloGuest')}</span>
          </button>
          <button type="button" className="hm-coins" onClick={() => navigate('bank')} aria-label={t('home2.coinsAria', { amount: formatChips(balance) })}>
            <span className="hm-coin-dot" aria-hidden />
            <b>{formatChips(balance)}</b>
            <span className="hm-coins-plus" aria-hidden>
              <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
          </button>
          <button type="button" className="hm-icon" onClick={() => navigate('settings')} aria-label={t('home.settings')}>
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="hm-wrap hm-main cz-safe-x">
        <Hero onPlay={playNow} />

        <div className="hm-cats" role="tablist" aria-label={t('home2.categories')}>
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <button key={c} type="button" role="tab" aria-selected={category === c} className={`hm-cat ${category === c ? 'is-on' : ''}`} onClick={() => setCategory(c)}>
                <Icon className="w-5 h-5" aria-hidden />
                <span>{t(`home2.cat.${c}`)}</span>
              </button>
            );
          })}
        </div>

        {category !== 'all' ? (
          <section aria-labelledby="hm-filtered">
            <SectionHead id="hm-filtered" icon={CATEGORY_ICON[category]} title={t(`home2.cat.${category}`)} />
            <div className="hm-grid">
              {filtered.map((g) => (
                <GameCard key={g.id} game={g} onPlay={() => open(g.id)} />
              ))}
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="hm-popular">
              <SectionHead id="hm-popular" icon={Crown} title={t('home2.popular')} action={{ label: t('lobby.seeAll'), onClick: () => navigate('gameModes') }} />
              <div className="hm-grid">
                {POPULAR.map((id) => (
                  <GameCard key={id} game={HOME_GAMES[id]} onPlay={() => open(id)} />
                ))}
              </div>
            </section>

            <CoinsBanner onOpen={() => navigate('bank')} />

            <section aria-labelledby="hm-casino">
              <SectionHead id="hm-casino" icon={Cherry} title={t('home2.casino')} action={{ label: t('lobby.seeAll'), onClick: () => navigate('gameModes') }} />
              <div className="hm-grid">
                {CASINO.map((id) => (
                  <GameCard key={id} game={HOME_GAMES[id]} size="small" onPlay={() => open(id)} />
                ))}
              </div>
            </section>

            <section aria-labelledby="hm-events">
              <SectionHead id="hm-events" icon={Gem} title={t('home2.extras')} />
              <div className="hm-events">
                {events.map((e) => (
                  <button key={e.key} type="button" className={`hm-event is-${e.tone}`} onClick={e.onClick}>
                    <img className="hm-event-img" src={EXTRA_IMAGES[e.key]} alt="" loading="lazy" />
                    <span className="hm-event-copy">
                      <span className="hm-event-title">{t(`home2.event.${e.key}.title`)}</span>
                      <span className="hm-event-sub">{t(`home2.event.${e.key}.sub`)}</span>
                    </span>
                    <ChevronRight className="hm-event-go" aria-hidden />
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="hm-rec">
              <SectionHead id="hm-rec" icon={Play} title={t('home2.recommended')} />
              <div className="hm-rail">
                {RECOMMENDED.map((id) => (
                  <GameCard key={id} game={HOME_GAMES[id]} size="small" onPlay={() => open(id)} />
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="hm-foot">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {t('casino.disclaimer')}
        </footer>
      </main>

      <BottomNav onPlay={playNow} />
    </div>
  );
}

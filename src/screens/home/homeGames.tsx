/* eslint-disable react-refresh/only-export-components -- a data module (game list and art), not a component file */
// The games shown on the home screen: where each opens, its category and its card art. The art is drawn
// from the project's own pieces (lobby SVG art, playing cards, slot and Olympus artwork); to use painted
// card art instead, set `image` (see docs/home.md).
import type { ReactNode } from 'react';
import type { Screen } from '@/types/navigation';
import { GameArt } from '@/components/lobby/lobbyArt';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { BingoArt, DominoArt } from '@/games/shared/ui/GameArt';
import { GEM_IMAGES } from '@/games/jewels/ui/assets';
import crown from '@/components/slots/art/diamondRoyale/crown.webp';
import coin from '@/components/slots/art/goldenFortune/coin.webp';
import diamond from '@/components/slots/art/diamondRoyale/diamond.webp';
import cardCarta from './art/card-carta.webp';
import cardDomino from './art/card-domino.webp';
import cardBingo from './art/card-bingo.webp';
import cardPoker from './art/card-poker.webp';
import cardRoulette from './art/card-roulette.webp';
import cardBlackjack from './art/card-blackjack.webp';
import cardSlots from './art/card-slots.webp';
import cardJewels from './art/card-jewels.webp';
import cardCrash from './art/card-crash.webp';
// The Horse Racing card art is picked up when the file exists (until then the card draws its emoji art).
const cardHorse = (import.meta.glob('./art/card-horse-racing.webp', { eager: true, import: 'default' }) as Record<string, string>)['./art/card-horse-racing.webp'];
import heroPortrait from './art/hero-portrait.webp';
import heroLandscape from './art/hero-landscape.webp';
import promoCoins from './art/promo-coins.webp';
import extraOnline from './art/extra-online.webp';
import extraDaily from './art/extra-daily.webp';
import extraLearn from './art/extra-learn.webp';

export type HomeGameId = 'carta' | 'domino' | 'bingo' | 'poker' | 'roulette' | 'blackjack' | 'slots' | 'jewels' | 'crash' | 'horse';
export type HomeCategory = 'all' | 'cards' | 'table' | 'slots' | 'puzzle' | 'instant';

export interface HomeGame {
  id: HomeGameId;
  screen: Screen;
  category: Exclude<HomeCategory, 'all'>;
  /** Card backdrop (a dark, rich gradient in the game's colour). */
  bg: string;
  /** Rim / glow colour of the card. */
  accent: string;
  /** Painted card art; when absent the card draws `art`. */
  image?: string;
  art: (size: number) => ReactNode;
}

const wheel = (size: number) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
    <circle cx="24" cy="24" r="23" fill="#2b1a10" stroke="#e7bf6a" strokeWidth="1.6" />
    {Array.from({ length: 18 }, (_, i) => (
      <path key={i} d="M24 24 L24 3 A21 21 0 0 1 31.2 4.3 Z" transform={`rotate(${i * 20} 24 24)`} fill={i === 0 ? '#12744a' : i % 2 ? '#b3202f' : '#141416'} />
    ))}
    <circle cx="24" cy="24" r="9" fill="url(#hm-gold)" stroke="#6d4508" strokeWidth="0.8" />
    <circle cx="24" cy="24" r="3" fill="#fff4cf" />
    <circle cx="24" cy="7.5" r="1.8" fill="#fff" />
    <defs>
      <radialGradient id="hm-gold" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#fff6d6" />
        <stop offset="0.5" stopColor="#e3b04b" />
        <stop offset="1" stopColor="#7a5410" />
      </radialGradient>
    </defs>
  </svg>
);

const cardPair = (a: { rank: 'A' | 'K' | 'J'; suit: 'S' | 'H' | 'D' | 'C' }, b: { rank: 'A' | 'K' | 'Q'; suit: 'S' | 'H' | 'D' | 'C' }) => (size: number) => (
  <span className="hm-cards" style={{ width: size * 1.35, height: size * 1.1 }}>
    <span className="hm-card-l">
      <PlayingCardView card={{ id: 'x', ...a }} width={size * 0.62} />
    </span>
    <span className="hm-card-r">
      <PlayingCardView card={{ id: 'y', ...b }} width={size * 0.62} />
    </span>
  </span>
);

export const HOME_GAMES: Record<HomeGameId, HomeGame> = {
  carta: { id: 'carta', image: cardCarta, screen: 'cartaSetup', category: 'cards', bg: 'radial-gradient(120% 90% at 50% 10%, #1f4f9a 0%, #0f2350 50%, #070d1f 100%)', accent: '#5b8dff', art: (s) => <GameArt game="carta" size={s * 0.52} /> },
  domino: { id: 'domino', image: cardDomino, screen: 'dominoSetup', category: 'table', bg: 'radial-gradient(120% 90% at 50% 10%, #8a5a1c 0%, #3d230c 55%, #140b04 100%)', accent: '#e0a24a', art: (s) => <DominoArt size={s * 0.52} /> },
  bingo: { id: 'bingo', image: cardBingo, screen: 'bingoSetup', category: 'table', bg: 'radial-gradient(120% 90% at 50% 10%, #6a2bc4 0%, #2f1266 55%, #10061f 100%)', accent: '#a974ff', art: (s) => <BingoArt size={s * 0.52} /> },
  poker: { id: 'poker', image: cardPoker, screen: 'pokerSetup', category: 'cards', bg: 'radial-gradient(120% 90% at 50% 10%, #b3202f 0%, #560c16 55%, #1a0406 100%)', accent: '#ff5d6c', art: cardPair({ rank: 'A', suit: 'S' }, { rank: 'K', suit: 'H' }) },
  roulette: { id: 'roulette', image: cardRoulette, screen: 'rouletteSetup', category: 'table', bg: 'radial-gradient(120% 90% at 50% 10%, #7a1f2b 0%, #3a0d14 55%, #140507 100%)', accent: '#e0525f', art: (s) => wheel(s * 1.15) },
  blackjack: { id: 'blackjack', image: cardBlackjack, screen: 'blackjackSetup', category: 'cards', bg: 'radial-gradient(120% 90% at 50% 10%, #16784c 0%, #0b3a25 55%, #04140c 100%)', accent: '#3fd688', art: cardPair({ rank: 'J', suit: 'H' }, { rank: 'A', suit: 'S' }) },
  slots: {
    id: 'slots',
    image: cardSlots,
    screen: 'slotLobby',
    category: 'slots',
    bg: 'radial-gradient(120% 90% at 50% 10%, #9a6a14 0%, #4a2c06 55%, #170d02 100%)',
    accent: '#ffd76a',
    art: (s) => (
      <span className="hm-stack" style={{ width: s * 1.4, height: s * 1.1 }}>
        <img src={crown} alt="" width={s} height={s} className="hm-stack-a" loading="lazy" />
        <img src={coin} alt="" width={s * 0.62} height={s * 0.62} className="hm-stack-b" loading="lazy" />
        <img src={diamond} alt="" width={s * 0.55} height={s * 0.55} className="hm-stack-c" loading="lazy" />
      </span>
    ),
  },
  crash: {
    id: 'crash',
    image: cardCrash,
    screen: 'crash',
    category: 'instant',
    bg: 'radial-gradient(120% 90% at 50% 10%, #8a1a24 0%, #3a0a10 55%, #0d0305 100%)',
    accent: '#ff6b5a',
    art: (s) => <span style={{ fontSize: s * 0.7 }} aria-hidden>🚀</span>,
  },
  horse: {
    id: 'horse',
    image: cardHorse,
    screen: 'horse',
    category: 'instant',
    bg: 'radial-gradient(120% 90% at 50% 10%, #1f6a3c 0%, #0e3a20 55%, #04140a 100%)',
    accent: '#e8c46a',
    art: (s) => <span style={{ fontSize: s * 0.7 }} aria-hidden>🏇</span>,
  },
  jewels: {
    id: 'jewels',
    image: cardJewels,
    screen: 'jewels',
    category: 'puzzle',
    bg: 'radial-gradient(120% 90% at 50% 10%, #2f5fb8 0%, #152a66 55%, #070d24 100%)',
    accent: '#7fb4ff',
    art: (s) => (
      <span className="hm-stack" style={{ width: s * 1.4, height: s * 1.1 }}>
        <img src={GEM_IMAGES[3]} alt="" width={s * 0.8} height={s * 0.8} className="hm-stack-a" loading="lazy" />
        <img src={GEM_IMAGES[2]} alt="" width={s * 0.58} height={s * 0.58} className="hm-stack-b" loading="lazy" />
        <img src={GEM_IMAGES[5]} alt="" width={s * 0.52} height={s * 0.52} className="hm-stack-c" loading="lazy" />
      </span>
    ),
  },
};

export const POPULAR: HomeGameId[] = ['carta', 'domino', 'bingo', 'poker'];
export const CASINO: HomeGameId[] = ['crash', 'horse', 'roulette', 'blackjack', 'slots', 'jewels'];
/** "Recommended for you": a static, configurable pick (there is no play history to learn from yet). */
export const RECOMMENDED: HomeGameId[] = ['horse', 'crash', 'jewels', 'slots', 'poker', 'roulette', 'bingo'];
export const CATEGORIES: HomeCategory[] = ['all', 'cards', 'table', 'slots', 'instant', 'puzzle'];
export const HERO_ART = { crown, coin, portrait: heroPortrait, landscape: heroLandscape };
export const PROMO_IMAGE = promoCoins;
export const EXTRA_IMAGES = { online: extraOnline, daily: extraDaily, learn: extraLearn };

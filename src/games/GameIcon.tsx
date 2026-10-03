// The small picture of each game in lists (Play screen, Tutorials): one place, so a game looks the same everywhere.
import { LayoutGrid, Rocket } from 'lucide-react';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { BingoArt, DominoArt } from '@/games/shared/ui/GameArt';
import { GemMark } from '@/games/jewels/JewelsEntry';
import { HockeyArt } from '@/games/airhockey/ui/HockeyArt';
import { BilliardsArt } from '@/games/billiards/ui/BilliardsArt';
import type { GameId } from './catalog';

const MiniWheel = () => (
  <svg viewBox="0 0 48 48" className="w-9 h-9" aria-hidden>
    <circle cx="24" cy="24" r="23" fill="#3b2416" stroke="#d8b26a" strokeWidth="1.5" />
    {Array.from({ length: 12 }, (_, i) => (
      <path key={i} d="M24 24 L24 4 A20 20 0 0 1 34 6.7 Z" transform={`rotate(${i * 30} 24 24)`} fill={i === 0 ? '#126642' : i % 2 ? '#a3222f' : '#1a1c1e'} />
    ))}
    <circle cx="24" cy="24" r="8" fill="#d8b26a" />
  </svg>
);

const CardPair = ({ a, b }: { a: 'A' | 'K'; b: 'A' | 'K' }) => (
  <span className="relative w-10 h-10 flex items-center justify-center" aria-hidden>
    <PlayingCardView card={{ id: 'l', rank: a, suit: 'S' }} width={22} className="absolute -rotate-12 -translate-x-1.5" />
    <PlayingCardView card={{ id: 'r', rank: b, suit: 'H' }} width={22} className="absolute rotate-12 translate-x-1.5" />
  </span>
);

export function GameIcon({ id }: { id: GameId }) {
  switch (id) {
    case 'carta':
      return <LayoutGrid className="w-5 h-5" aria-hidden />;
    case 'domino':
      return <DominoArt size={14} />;
    case 'bingo':
      return <BingoArt size={14} />;
    case 'jewels':
      return <GemMark size={30} />;
    case 'crash':
      return <Rocket className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden />;
    case 'horse':
      return (
        <span className="text-lg" aria-hidden>
          🏇
        </span>
      );
    case 'airhockey':
      return <HockeyArt size={40} />;
    case 'billiards':
      return <BilliardsArt size={36} />;
    case 'blackjack':
      return <CardPair a="A" b="K" />;
    case 'roulette':
      return <MiniWheel />;
    case 'poker':
      return <CardPair a="A" b="A" />;
    case 'slots':
      return <SlotSymbolIcon symbol="seven" className="w-8 h-8" />;
  }
}

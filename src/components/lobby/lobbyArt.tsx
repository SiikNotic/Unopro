import { memo } from 'react';
import { GameCard } from '@/components/table/GameCard';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { RouletteWheel } from '@/components/casino/RouletteWheel';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { Chip } from '@/components/casino/chips';

import type { LobbyGame } from './lobbyMoods';

/** Game illustration, scaled by `size` (a px unit). Pure decoration. */
export const GameArt = memo(function GameArt({ game, size }: { game: LobbyGame; size: number }) {
  switch (game) {
    case 'carta':
      return (
        <div className="relative" style={{ width: size * 3.2, height: size * 2.4 }} aria-hidden>
          {[
            { card: { id: 'c1', color: 'BLUE', type: 'SKIP', value: null } as const, r: -16, x: 0 },
            { card: { id: 'c2', color: 'WILD', type: 'WILD', value: null } as const, r: 0, x: 0.95 },
            { card: { id: 'c3', color: 'RED', type: 'NUMBER', value: 7 } as const, r: 16, x: 1.9 },
          ].map(({ card, r, x }) => (
            <GameCard
              key={card.id}
              card={card}
              className="absolute bottom-0"
              style={{ '--cw': `${size * 1.3}px`, left: size * x * 1.0, transform: `rotate(${r}deg)`, transformOrigin: '50% 100%' } as React.CSSProperties}
            />
          ))}
        </div>
      );
    case 'blackjack':
      return (
        <div className="relative flex items-end" style={{ width: size * 3.2, height: size * 2.4 }} aria-hidden>
          <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={size * 1.35} className="absolute" style={{ left: size * 0.35, bottom: size * 0.1, transform: 'rotate(-10deg)' }} />
          <PlayingCardView card={{ id: 'k', rank: 'K', suit: 'H' }} width={size * 1.35} className="absolute" style={{ left: size * 1.25, bottom: size * 0.25, transform: 'rotate(8deg)' }} />
          <div className="absolute flex flex-col-reverse" style={{ right: 0, bottom: size * 0.05 }}>
            {[500, 100, 100, 25, 25].map((v, i) => (
              <span key={i} style={{ marginTop: i ? -size * 0.42 : 0 }}>
                <Chip value={v} size={size * 0.62} label="" />
              </span>
            ))}
          </div>
        </div>
      );
    case 'roulette':
      return (
        <div aria-hidden>
          <RouletteWheel rotorDeg={-28} ballDeg={0} durationMs={0} highlight={null} size={size * 2.6} label="" />
        </div>
      );
    case 'slots':
      return (
        <div className="flex gap-[6%] rounded-2xl p-[4%] bg-[#1d0e05]/80 border border-[rgba(216,178,106,0.5)]" style={{ width: size * 3 }} aria-hidden>
          {(['seven', 'seven', 'seven'] as const).map((s, i) => (
            <span key={i} className="flex-1 aspect-[3/4] rounded-xl bg-gradient-to-b from-[#d6c6a1] via-[#fffaf0] to-[#d6c6a1] flex items-center justify-center">
              <SlotSymbolIcon symbol={s} className="w-[72%] h-[72%]" />
            </span>
          ))}
        </div>
      );
  }
});

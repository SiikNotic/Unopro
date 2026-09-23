import { Bot, User, Users } from 'lucide-react';
import type { Player } from '@/game/engine';
import type { Seat } from '@/game/table/seating';
import { seatOrientation } from '@/game/table/seating';
import { useI18n } from '@/i18n';
import { GameCard } from './GameCard';

interface OpponentSeatProps {
  player: Player;
  seat: Seat;
  name: string;
  active: boolean;
  hasUno: boolean;
  compact: boolean;
  register: (key: string) => (el: HTMLElement | null) => void;
}

const AVATAR_GRADIENTS = [
  'from-fuchsia-500 to-indigo-600',
  'from-amber-400 to-rose-600',
  'from-teal-400 to-sky-600',
  'from-lime-400 to-emerald-600',
  'from-orange-400 to-red-600',
];

/** An opponent (or teammate): avatar, name, card count and face-down cards only — never the faces. */
export function OpponentSeat({ player, seat, name, active, hasUno, compact, register }: OpponentSeatProps) {
  const { t } = useI18n();
  const vertical = seatOrientation(seat.position) === 'vertical';
  const count = player.cardsRemaining;
  const shown = Math.min(count, vertical ? (compact ? 4 : 6) : compact ? 6 : 9);
  const miniWidth = compact ? 22 : 30;
  const gradient = AVATAR_GRADIENTS[player.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  const Icon = player.type === 'BOT' ? Bot : User;
  const teammate = seat.relation === 'teammate';

  return (
    <div
      ref={register(`seat:${player.id}`)}
      className={`relative flex items-center gap-1.5 rounded-2xl px-2 py-1.5 transition-all duration-300 ${
        vertical ? 'flex-col w-[68px] sm:w-[96px]' : 'flex-row'
      } ${active ? 'seat-active bg-brand-500/15' : teammate ? 'seat-teammate bg-gold-500/10' : 'bg-black/25'}`}
      aria-label={`${name}, ${t('table.cardsCount', { count })}${active ? `, ${t('table.theirTurn')}` : ''}`}
    >
      <div className="relative shrink-0">
        <div
          className={`flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} ${
            compact ? 'w-9 h-9' : 'w-11 h-11'
          } border-2 ${teammate ? 'border-gold-400' : 'border-white/30'} shadow-lg`}
        >
          <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
        <span className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-ink-950 border border-white/20 text-[11px] font-bold flex items-center justify-center">
          {count}
        </span>
        {hasUno && (
          <span className="absolute -top-2 -left-2 rounded-full bg-gold-400 px-1.5 text-[10px] font-extrabold text-ink-950 animate-pop">
            {t('table.uno')}
          </span>
        )}
      </div>

      <div className={`min-w-0 ${vertical ? 'text-center w-full' : ''}`}>
        <div className="text-xs sm:text-sm font-semibold truncate leading-tight">{name}</div>
        {teammate && (
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-gold-400 font-semibold">
            <Users className="w-3 h-3" />
            <span className="truncate">{t('table.teammate')}</span>
          </div>
        )}
        {!compact && !vertical && <div className="text-[11px] text-ink-400">{t('table.cardsCount', { count })}</div>}
      </div>

      <div
        className={`flex ${vertical ? 'flex-col items-center' : 'items-center'} ${vertical ? '' : 'ml-1'}`}
        aria-hidden
        style={{ '--cw': `${miniWidth}px` } as React.CSSProperties}
      >
        {Array.from({ length: shown }, (_, i) => (
          <GameCard
            key={i}
            faceDown
            style={{
              marginLeft: !vertical && i > 0 ? -miniWidth * 0.62 : 0,
              marginTop: vertical && i > 0 ? -miniWidth * 1.2 : 0,
              transform: vertical ? `rotate(90deg)` : `rotate(${(i - (shown - 1) / 2) * 5}deg)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

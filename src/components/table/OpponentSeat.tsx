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
  score: number | null;
  active: boolean;
  hasUno: boolean;
  compact: boolean;
  register: (key: string) => (el: HTMLElement | null) => void;
}

const AVATAR_GRADIENTS = [
  'from-fuchsia-500 to-indigo-700',
  'from-amber-400 to-rose-600',
  'from-sky-400 to-blue-700',
  'from-lime-400 to-emerald-700',
  'from-orange-400 to-red-700',
];

/** A player sitting at the rim: avatar, name, count and face-down cards only — never the faces. */
export function OpponentSeat({ player, seat, name, score, active, hasUno, compact, register }: OpponentSeatProps) {
  const { t } = useI18n();
  const vertical = seatOrientation(seat.position) === 'vertical';
  const count = player.cardsRemaining;
  const shown = Math.min(count, vertical ? (compact ? 4 : 5) : compact ? 5 : 8);
  const mini = compact ? 20 : 28;
  const gradient = AVATAR_GRADIENTS[player.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  const Icon = player.type === 'BOT' ? Bot : User;
  const teammate = seat.relation === 'teammate';

  const fan = (
    <div className="flex items-end justify-center" aria-hidden style={{ '--cw': `${mini}px`, height: mini * 1.5 + 4 } as React.CSSProperties}>
      {Array.from({ length: shown }, (_, i) => (
        <GameCard
          key={i}
          faceDown
          style={{
            marginLeft: i > 0 ? -mini * 0.66 : 0,
            transform: `rotate(${(i - (shown - 1) / 2) * 6}deg) translateY(${Math.abs(i - (shown - 1) / 2) * 1.5}px)`,
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={register(`seat:${player.id}`)}
      className={`seat-plate relative flex items-center rounded-2xl ${vertical ? `flex-col gap-1 px-1.5 py-1.5 ${compact ? 'w-[84px]' : 'w-[96px]'}` : 'flex-row gap-2 pl-1.5 pr-3 py-1.5'} ${
        active ? 'seat-plate-active' : ''
      } ${teammate ? 'seat-mate' : ''}`}
      aria-label={`${name}${teammate ? ` (${t('table.teammate')})` : ''}: ${t('table.cardsCount', { count })}${active ? `, ${t('table.theirTurn')}` : ''}`}
    >
      <div className="relative shrink-0">
        <div className={`seat-avatar flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} ${compact ? 'w-9 h-9' : 'w-11 h-11'} shadow-lg`}>
          <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
        {teammate && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-gold-400 text-ink-950 flex items-center justify-center shadow" title={t('table.teammate')}>
            <Users className="w-2.5 h-2.5" strokeWidth={3} />
          </span>
        )}
        <span className="absolute -bottom-1 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#f3ecdc] text-ink-950 text-[11px] font-extrabold flex items-center justify-center shadow tabular-nums">
          {count}
        </span>
        {hasUno && (
          <span key={`uno-${count}`} className="absolute -top-2.5 -right-3 rounded-full bg-gradient-to-br from-gold-400 to-rose-600 px-1.5 py-px text-[10px] font-extrabold text-ink-950 shadow animate-pop">
            {t('table.uno')}
          </span>
        )}
      </div>

      <div className={`min-w-0 ${vertical ? 'text-center w-full' : ''}`}>
        <div className="text-xs sm:text-sm font-semibold truncate leading-tight">{name}</div>
        {score !== null && !compact && <div className="text-[11px] text-ink-400 tabular-nums">{t('table.pointsShort', { points: score })}</div>}
      </div>

      {!vertical && fan}
      {vertical && <div className="mt-0.5">{fan}</div>}
    </div>
  );
}

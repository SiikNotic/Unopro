// The poker table: seats around an oval (seating.ts), the board, the pot, bets, the dealer button.
// Seats and cards are memoised; chips and cards move with transforms only.
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Bot, Crown, UserRound } from 'lucide-react';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { Chip } from '@/components/casino/chips';
import { useI18n } from '@/i18n';
import type { Display, SeatDisplay } from './usePokerGame';
import { HUMAN } from './usePokerGame';
import { CENTER, seatPositions, toward } from './seating';
import type { Point } from './seating';

const pct = (p: Point): CSSProperties => ({ left: `${p.x}%`, top: `${p.y}%` });
/** Seat plates are up to ~124px wide: keep side seats inside the table on narrow phones. */
const SEAT_HALF = 62;
const clampX = (x: number, w: number) => Math.min(w - SEAT_HALF, Math.max(SEAT_HALF, (x / 100) * w));
/** Offset (px) that takes something from `from` to `to`, for transforms. */
const delta = (from: Point, to: Point, w: number, h: number) => ({ x: ((to.x - from.x) / 100) * w, y: ((to.y - from.y) / 100) * h });

function chipFace(amount: number) {
  return amount >= 1000 ? 1000 : amount >= 500 ? 500 : amount >= 100 ? 100 : amount >= 25 ? 25 : 5;
}

const Seat = memo(function Seat({ seat, pos, active, dealer, cardW, handNo, deckFrom, index, best, tableW }: { seat: SeatDisplay; pos: Point; active: boolean; dealer: boolean; cardW: number; handNo: number; deckFrom: { x: number; y: number }; index: number; best: string[] | null; tableW: number }) {
  const { t } = useI18n();
  const you = seat.id === HUMAN;
  const w = you ? cardW * 1.55 : cardW;
  const label = seat.out ? t('poker.out') : seat.folded ? t('poker.act.fold') : seat.allIn ? t('poker.act.allIn') : seat.action ? t(`poker.act.${seat.action.type}`) : null;
  return (
    <div className={`pk-seat ${you ? 'is-you' : ''} ${active ? 'is-active' : ''} ${seat.folded || seat.out ? 'is-folded' : ''} ${seat.winner ? 'is-winner' : ''}`} style={{ ...pct(pos), left: clampX(pos.x, tableW) }}>
      <div className="pk-cards" style={{ '--pk-cw': `${w}px` } as CSSProperties}>
        {seat.cards === null
          ? [0, 1].map((i) => (
              <span key={`${handNo}-${i}`} className="pk-card pk-deal" style={{ '--dx': `${deckFrom.x}px`, '--dy': `${deckFrom.y}px`, animationDelay: `${(i * 6 + index) * 45}ms` } as CSSProperties}>
                <PlayingCardView card={{ id: 'x', rank: 'A', suit: 'S' }} faceDown width={w} />
              </span>
            ))
          : seat.cards.map((c, i) => (
              <span key={`${handNo}-${c.id}`} className={`pk-card ${you ? 'pk-deal' : 'pk-flip'} ${best && !best.includes(c.id) ? 'is-dim' : ''} ${best?.includes(c.id) ? 'is-best' : ''}`} style={{ '--dx': `${deckFrom.x}px`, '--dy': `${deckFrom.y}px`, animationDelay: you ? `${(i * 6 + index) * 45}ms` : '0ms' } as CSSProperties}>
                <PlayingCardView card={c} width={w} />
              </span>
            ))}
      </div>
      <div className="pk-plate">
        <span className="pk-avatar" aria-hidden>
          {you ? <UserRound className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </span>
        <span className="min-w-0">
          <span className="pk-name">{you ? t('games.you') : seat.name}</span>
          <span className="pk-stack">{seat.stack.toLocaleString()}</span>
        </span>
        {dealer && <span className="pk-dealer" aria-label={t('poker.dealer')}>D</span>}
        {seat.winner && <Crown className="pk-crown" aria-hidden />}
      </div>
      {label && <span className={`pk-tag ${seat.allIn ? 'is-allin' : ''}`}>{label}</span>}
    </div>
  );
});

export function PokerTable({ display, width, height, portrait }: { display: Display; width: number; height: number; portrait: boolean }) {
  const { t } = useI18n();
  const positions = seatPositions(display.seats.length, portrait);
  const boardW = Math.min(64, width * (portrait ? 0.128 : 0.085));
  const seatCardW = Math.min(46, width * (portrait ? 0.105 : 0.05));
  const potPoint: Point = { x: CENTER.x, y: CENTER.y - (portrait ? 13 : 16) };
  const deck: Point = { x: 50, y: 30 };
  const best = display.result?.showdown ? display.result.pots[0]?.cards ?? null : null;
  const winners = display.paying ?? [];
  const winnerPos = winners.length ? positions[display.seats.findIndex((s) => s.id === winners[0])] : null;
  return (
    <div className={`pk-table ${portrait ? 'is-portrait' : ''}`} style={{ width, height }}>
      <div className="pk-felt" aria-hidden>
        <span className="pk-inlay" />
        <span className="pk-brand">Carta Casino</span>
      </div>

      {/* Pot */}
      <div className={`pk-pot ${display.paying && display.pot === 0 ? 'is-paid' : ''}`} style={{ ...pct(potPoint), ...(winnerPos && display.pot === 0 ? { transform: `translate(-50%, -50%) translate(${delta(potPoint, winnerPos, width, height).x}px, ${delta(potPoint, winnerPos, width, height).y}px) scale(0.6)` } : {}) }} aria-live="polite">
        {display.pot > 0 && (
          <>
            <span className="pk-pot-chips" aria-hidden>
              <Chip value={chipFace(display.pot)} size={26} label="" />
              <Chip value={chipFace(display.pot / 3)} size={22} label="" />
            </span>
            <span className="pk-pot-amount">{t('poker.pot', { n: display.pot.toLocaleString() })}</span>
          </>
        )}
      </div>

      {/* Board */}
      <div className="pk-board" style={{ ...pct(CENTER), '--pk-bw': `${boardW}px` } as CSSProperties} aria-label={t('poker.board')}>
        {Array.from({ length: 5 }, (_, i) => {
          const c = display.board[i];
          return (
            <span key={i} className="pk-slot">
              {c && (
                <span key={`${display.handNo}-${c.id}`} className={`pk-card pk-flip ${best && !best.includes(c.id) ? 'is-dim' : ''} ${best?.includes(c.id) ? 'is-best' : ''}`}>
                  <PlayingCardView card={c} width={boardW} />
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Bets in front of each seat (they slide to the pot when a street ends) */}
      {display.seats.map((s, i) => {
        if (s.bet <= 0) return null;
        const at = toward(positions[i], portrait ? 0.4 : 0.36);
        const d = delta(at, potPoint, width, height);
        return (
          <span key={`bet-${s.id}`} className={`pk-bet ${display.collecting ? 'is-collecting' : ''}`} style={{ ...pct(at), '--to-x': `${d.x}px`, '--to-y': `${d.y}px` } as CSSProperties}>
            <Chip value={chipFace(s.bet)} size={20} label="" />
            <b>{s.bet.toLocaleString()}</b>
          </span>
        );
      })}

      {display.seats.map((s, i) => {
        const d = delta(positions[i], deck, width, height);
        return <Seat key={s.id} seat={s} pos={positions[i]} index={i} active={display.phase === 'betting' && display.toAct === i} dealer={display.dealer === i} cardW={seatCardW} handNo={display.handNo} deckFrom={d} best={s.winner ? best : null} tableW={width} />;
      })}

      {display.result && display.paying && (
        <div className="pk-banner" key={display.handNo}>
          {display.result.pots
            .filter((p, k) => k === 0 || p.winners.join() !== display.result!.pots[0].winners.join())
            .map((p, k) => (
              <p key={k}>
                <b>{p.winners.map((w) => (w === HUMAN ? t('games.you') : display.seats.find((s) => s.id === w)?.name)).join(' · ')}</b> {t(p.winners.length > 1 ? 'poker.splits' : 'poker.wins', { n: p.amount.toLocaleString() })}
                {p.category && <span> · {t(`poker.hands.${p.category}`)}</span>}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

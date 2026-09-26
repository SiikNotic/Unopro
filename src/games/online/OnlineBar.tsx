import { useEffect, useRef, useState } from 'react';
import { Coins, Radio, Timer, WifiOff } from 'lucide-react';
import { formatChips } from '@/casino/chipValues';
import { useI18n } from '@/i18n';
import type { LinkState } from './client';
import type { RoomErrorCode, RoomView } from './protocol';
import './online.css';

/**
 * Connection state of an online match, your remaining time when it's your move, and in a staked room the
 * pot (and what you won once the server paid it). `notice` is a refusal to show (e.g. a rematch nobody could pay).
 */
export function OnlineBar({ view, link, error, myTurn, notice = null }: { view: RoomView; link: LinkState; error: RoomErrorCode | null; myTurn: boolean; notice?: string | null }) {
  const { t } = useI18n();
  // Server time ≈ local time + offset, measured when the view arrived.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = view.serverNow - Date.now();
  }, [view.serverNow]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!myTurn || !view.turnDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [myTurn, view.turnDeadline]);
  const left = myTurn && view.turnDeadline ? Math.max(0, Math.ceil((view.turnDeadline - (now + offset.current)) / 1000)) : null;
  // No Realtime push (blocked network, server hiccup): still in sync through the periodic tick.
  const offline = error === 'busy';
  const polling = !offline && link === 'polling';
  const pot = view.pot;
  const won = pot?.settled && pot.winners.includes(view.you);
  return (
    <>
      <div className="ol-bar" role="status" aria-live="polite">
        <span className={`ol-dot ${offline ? 'is-off' : link === 'live' ? 'is-live' : ''}`} aria-hidden />
        {offline ? <WifiOff className="w-3.5 h-3.5" aria-hidden /> : <Radio className="w-3.5 h-3.5" aria-hidden />}
        <span className="truncate">
          {t('online.room', { code: view.code })} · {offline ? t('online.reconnecting') : link === 'live' ? t('online.live') : polling ? t('online.polling') : t('online.connecting')}
        </span>
        {pot && (
          <span className={`ol-pot ${won ? 'is-won' : ''}`} title={t('online.potTitle', { stake: formatChips(pot.stake) })}>
            <Coins className="w-3.5 h-3.5" aria-hidden />
            {pot.settled ? (won ? t('online.potWon', { prize: formatChips(pot.prize) }) : t('online.potLost')) : t('online.pot', { total: formatChips(pot.total) })}
          </span>
        )}
        {left !== null && left <= 30 && (
          <span className={`ol-timer ${left <= 10 ? 'is-hot' : ''}`}>
            <Timer className="w-3.5 h-3.5" aria-hidden /> {t('online.timeLeft', { s: left })}
          </span>
        )}
      </div>
      {notice && (
        <p className="ol-notice" role="alert">
          {notice}
        </p>
      )}
    </>
  );
}

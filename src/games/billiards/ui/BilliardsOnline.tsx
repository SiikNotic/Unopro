// An online 8-Ball match (1 vs 1). The room server holds the table and decides every shot; this screen shows
// the view it pushes (Realtime, with the tick as fallback), sends your shot, and plays back each new shot from
// the exact start and input the server used, then settles on the server's positions. Reconnecting is just
// opening the room again: the server sends the current table.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, RotateCcw, Undo2, WifiOff } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import { OnlineGate } from '@/games/online/OnlineGate';
import { roomErrorText } from '@/games/online/errors';
import type { Shot } from '../rules';
import { poolSounds } from '../sounds';
import { EndPanel, GameView } from './GameView';
import type { PublicState } from './GameView';
import type { Replay } from './PoolTable';
import { endReason, shotMessage } from './messages';

export function BilliardsOnline({ code }: { code: string }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const room = useOnlineRoom(code);
  const v = room.view;
  const live = v?.billiards?.state ?? null;
  const [shown, setShown] = useState<PublicState | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const pendingNext = useRef<PublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const ended = useRef<string | null>(null);

  const say = useCallback((msg: string | null) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    if (msg) toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // A new server state: play the shot back if it is the next one, otherwise jump straight to it.
  useEffect(() => {
    if (!live) return;
    const base = pendingNext.current ?? shown;
    if (!base || live.match !== base.match || live.shots < base.shots) {
      pendingNext.current = null;
      setReplay(null);
      setShown(live);
      return;
    }
    if (live.shots === base.shots) {
      // Same shot count: the shot clock, a forfeit, a rejoin... show it (unless a playback is running).
      if (!replay) setShown(live);
      else pendingNext.current = live;
      return;
    }
    const last = live.last;
    if (live.shots === base.shots + 1 && last && last.no === live.shots && !replay) {
      pendingNext.current = live;
      setReplay({ key: `${live.match}-${last.no}`, before: last.before, input: last.input });
    } else if (!replay) {
      setShown(live);
    } else {
      pendingNext.current = live;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const onReplayDone = useCallback(() => {
    const next = pendingNext.current;
    pendingNext.current = null;
    setReplay(null);
    if (next) {
      setShown(next);
      if (next.last?.foul) poolSounds.foul();
      say(shotMessage(t, next));
    }
  }, [say, t]);

  // Still in the lobby (opened from a link): back to the room screen.
  useEffect(() => {
    if (v?.status === 'lobby') navigate('room', { game: 'billiards', room: code }, { replace: true });
  }, [v?.status, code, navigate]);

  const me = v?.you === 's1' ? 1 : 0;
  // End sounds, once per game.
  useEffect(() => {
    if (!shown || shown.phase !== 'over' || replay) return;
    const key = `${shown.match}`;
    if (ended.current === key) return;
    ended.current = key;
    if (shown.winner === me) poolSounds.win();
    else poolSounds.lose();
  }, [shown, replay, me]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const exit = async () => {
    await room.send({ op: 'leave' });
    navigate('billiards', {}, { replace: true });
  };

  if (!v || v.status !== 'playing' || !v.billiards || !shown) return <OnlineGate view={v} error={room.error} onExit={() => navigate('billiards', {}, { replace: true })} />;

  const shoot = async (shot: Shot) => {
    setBusy(true);
    const res = await room.act({ type: 'SHOOT', no: shown.shots + 1, shot });
    setBusy(false);
    if (!res.ok) say(res.code === 'rule' ? t(`billiards.errors.${res.detail ?? 'rule'}`) : roomErrorText(t, res));
  };
  // Server clock → local clock for the shot timer.
  const offset = v.serverNow - Date.now();
  const deadline = v.turnDeadline ? v.turnDeadline - offset : null;
  const away = v.billiards.away.map((s) => (s === 's1' ? 1 : 0) as 0 | 1);
  const opponentHere = v.members.length === 2;
  const over = shown.phase === 'over' && !replay;
  const won = shown.winner === me;

  return (
    <GameView
      state={shown}
      me={me}
      canAct={!busy && !replay && room.link !== 'connecting'}
      replay={replay}
      onReplayDone={onReplayDone}
      onShoot={(s) => void shoot(s)}
      deadline={shown.phase === 'over' ? null : deadline}
      away={away}
      toast={toast ?? (away.includes(me === 0 ? 1 : 0) ? t('billiards.opponentAway') : null)}
      onBack={() => (shown.phase === 'over' ? void exit() : setConfirmExit(true))}
    >
      {over && (
        <EndPanel
          win={won}
          title={t(won ? 'billiards.end.victory' : 'billiards.end.defeat')}
          winner={t('billiards.end.winner', { name: shown.players[shown.winner ?? 0].name })}
          reason={endReason(t, shown)}
          players={
            <div className="bl-end-players">
              {shown.players.map((p, i) => (
                <div key={i} className={i === shown.winner ? 'is-winner' : ''}>
                  <b>{p.name}</b>
                  <br />
                  {t('billiards.end.line', { potted: p.potted, fouls: p.fouls })}
                </div>
              ))}
            </div>
          }
          actions={
            <>
              {notice && <p className="ms-note !text-[#ffb3b3]">{notice}</p>}
              <button
                type="button"
                className="cz-btn cz-btn-primary cz-btn-game w-full"
                disabled={!opponentHere}
                onClick={async () => setNotice(roomErrorText(t, await room.send({ op: 'rematch' })))}
              >
                <RotateCcw className="w-5 h-5" /> {t('billiards.end.revenge')}
              </button>
              {!opponentHere && (
                <p className="ms-note inline-flex items-center gap-1 justify-center">
                  <WifiOff className="w-4 h-4" aria-hidden /> {t('billiards.opponentLeft')}
                </p>
              )}
              <button type="button" className="cz-btn cz-btn-secondary w-full" onClick={() => void exit()}>
                <Undo2 className="w-5 h-5" /> {t('billiards.end.back')}
              </button>
            </>
          }
        />
      )}
      {confirmExit && (
        <EndPanel
          win={false}
          title={t('billiards.leave.title')}
          winner=""
          reason={t('billiards.leave.bodyOnline')}
          actions={
            <>
              <button type="button" className="cz-btn cz-btn-primary w-full" onClick={() => setConfirmExit(false)}>
                {t('billiards.leave.stay')}
              </button>
              <button type="button" className="cz-btn cz-btn-secondary w-full" onClick={() => void exit()}>
                <LogOut className="w-5 h-5" /> {t('billiards.leave.concede')}
              </button>
            </>
          }
        />
      )}
    </GameView>
  );
}

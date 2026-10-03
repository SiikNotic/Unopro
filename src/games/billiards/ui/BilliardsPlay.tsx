// 8-Ball against the computer. The whole game runs here with the same rules and physics as online: each shot
// (yours or the bot's) is applied by the rules, then played back on the table; the new position is shown when
// the balls stop. The bot thinks with the real simulation (ai.ts) and takes a short, natural pause.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { useProfileName } from '@/settings/profile';
import { newMatchSeed } from '@/games/shared/rng';
import { applyShot, createBilliards, rematchBilliards } from '../rules';
import type { BilliardsState, Shot } from '../rules';
import { planShot } from '../ai';
import { loadLevel } from './level';
import { recordBotGame } from '../api';
import { poolSounds } from '../sounds';
import { EndPanel, GameView } from './GameView';
import type { Replay } from './PoolTable';
import { endReason, shotMessage } from './messages';


interface Pending {
  next: BilliardsState;
  replay: Replay;
}

export function BilliardsPlay() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const [profileName] = useProfileName();
  const level = loadLevel();
  const myName = (account.status === 'user' ? account.profile?.username : null) || profileName || t('games.you');
  const newGame = useCallback(
    () =>
      createBilliards(
        [
          { id: 'me', name: myName.slice(0, 16), kind: 'human' },
          { id: 'bot', name: `BOT · ${t(`billiards.level.${level}`)}`, kind: 'bot' },
        ],
        newMatchSeed(),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [state, setState] = useState<BilliardsState>(newGame);
  const [pending, setPending] = useState<Pending | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const recorded = useRef<number | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const play = useCallback((from: BilliardsState, shot: Shot) => {
    const res = applyShot(from, shot);
    if (!res.ok || !res.state.last) return false;
    const last = res.state.last;
    setPending({ next: res.state, replay: { key: `${from.match}-${last.no}`, before: last.before, input: last.input } });
    return true;
  }, []);

  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const onReplayDone = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setPending(null);
    setState(p.next);
    if (p.next.last?.foul) poolSounds.foul();
    window.clearTimeout(toastTimer.current);
    setToast(shotMessage(t, p.next));
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, [t]);

  // The bot's turn: think, then shoot.
  useEffect(() => {
    if (pending || state.phase === 'over' || state.players[state.turn].kind !== 'bot') return;
    setThinking(true);
    const plan = planShot(state, level, state.seed + state.shots * 7919);
    const id = window.setTimeout(() => {
      setThinking(false);
      play(state, plan.shot);
    }, plan.thinkMs);
    return () => window.clearTimeout(id);
  }, [state, pending, level, play]);

  // The end: sounds, and statistics for signed-in players (once per game).
  useEffect(() => {
    if (state.phase !== 'over' || recorded.current === state.match) return;
    recorded.current = state.match;
    const won = state.winner === 0;
    if (won) poolSounds.win();
    else poolSounds.lose();
    if (account.status === 'user') void recordBotGame(level, won, state.players[0].potted, state.players[0].fouls, Math.max(1, Math.ceil(state.shots / 2)));
  }, [state, level, account.status]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const restart = (rematch: boolean) => {
    setPending(null);
    setToast(null);
    setState(rematch ? rematchBilliards(state, newMatchSeed()) : newGame());
  };
  const exit = () => navigate('billiards', {}, { replace: true });

  const over = state.phase === 'over' && !pending;
  const won = state.winner === 0;
  return (
    <GameView
      state={state}
      me={0}
      canAct={!pending && !thinking}
      replay={pending?.replay ?? null}
      onReplayDone={onReplayDone}
      onShoot={(shot) => play(state, shot)}
      thinking={thinking}
      toast={toast}
      onBack={() => (state.phase === 'over' || state.shots === 0 ? exit() : setConfirmExit(true))}
    >
      {over && (
        <EndPanel
          win={won}
          title={t(won ? 'billiards.end.victory' : 'billiards.end.defeat')}
          winner={t('billiards.end.winner', { name: state.players[state.winner ?? 0].name })}
          reason={endReason(t, state)}
          actions={
            <>
              <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full" onClick={() => restart(!won)}>
                <RotateCcw className="w-5 h-5" /> {t(won ? 'billiards.end.again' : 'billiards.end.revenge')}
              </button>
              <button type="button" className="cz-btn cz-btn-secondary w-full" onClick={exit}>
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
          reason={t('billiards.leave.body')}
          actions={
            <>
              <button type="button" className="cz-btn cz-btn-primary w-full" onClick={() => setConfirmExit(false)}>
                {t('billiards.leave.stay')}
              </button>
              <button type="button" className="cz-btn cz-btn-secondary w-full" onClick={exit}>
                {t('billiards.leave.go')}
              </button>
            </>
          }
        />
      )}
    </GameView>
  );
}

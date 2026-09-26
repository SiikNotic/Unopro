import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { roomErrorText } from '@/games/online/errors';
import { useNavigation } from '@/components/Navigation';
import { BINGO_SCENES, loadBingoSetup, pickScene } from '@/games/shared/setup';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import { OnlineBar } from '@/games/online/OnlineBar';
import { OnlineGate } from '@/games/online/OnlineGate';
import type { BingoEvent } from '../engine';
import { BingoTable } from './BingoTable';

/** An online bingo round: the room server calls the balls and judges every BINGO. */
export function BingoOnline({ code }: { code: string }) {
  const { navigate } = useNavigation();
  const room = useOnlineRoom(code);
  const setup = useMemo(() => loadBingoSetup(), []);
  const scene = useMemo(() => pickScene(setup.scene, BINGO_SCENES, 'games.bingo.lastScene'), [setup.scene]);
  const v = room.view;
  const { t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);
  // A new match of a staked room takes new stakes: say why if the server refuses it.
  const rematch = async () => setNotice(roomErrorText(t, await room.send({ op: 'rematch' })));
  useEffect(() => {
    if (v?.status === 'lobby') navigate('room', { game: 'bingo', room: code }, { replace: true });
  }, [v?.status, code, navigate]);
  const leave = async () => {
    await room.send({ op: 'leave' });
    navigate('home', {}, { replace: true });
  };
  if (!v || !v.bingo || v.status !== 'playing') return <OnlineGate view={v} error={room.error} onExit={() => navigate('home', {}, { replace: true })} />;
  const host = v.members.find((m) => m.seat === v.you)?.host ?? false;
  return (
    <BingoTable
      session={{
        view: v.bingo,
        events: v.events as BingoEvent[],
        version: room.seq,
        act: async (action) => {
          const r = await room.act(action);
          return { ok: r.ok, error: r.detail };
        },
        scene,
        autoMark: setup.autoMark,
        paused: null,
        // A staked round is a whole match: the next one is the host's rematch (new stakes).
        canNextRound: !v.pot,
        onRematch: host ? () => void rematch() : null,
        onExit: leave,
        onBack: leave,
        banner: <OnlineBar view={v} link={room.link} error={room.error} myTurn={false} notice={notice} />,
      }}
    />
  );
}

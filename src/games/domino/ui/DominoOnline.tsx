import { useEffect, useMemo } from 'react';
import { useNavigation } from '@/components/Navigation';
import { DOMINO_SCENES, loadDominoSetup, pickScene } from '@/games/shared/setup';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import { OnlineBar } from '@/games/online/OnlineBar';
import { OnlineGate } from '@/games/online/OnlineGate';
import type { DominoEvent } from '../engine';
import { DominoTable } from './DominoTable';

/** An online Domino match: the room server holds the state; this screen shows your view and sends your moves. */
export function DominoOnline({ code }: { code: string }) {
  const { navigate } = useNavigation();
  const room = useOnlineRoom(code);
  const scene = useMemo(() => pickScene(loadDominoSetup().scene, DOMINO_SCENES, 'games.domino.lastScene'), []);
  const v = room.view;
  // Still in the lobby (e.g. opened from a link): go to the room screen.
  useEffect(() => {
    if (v?.status === 'lobby') navigate('room', { game: 'domino', room: code }, { replace: true });
  }, [v?.status, code, navigate]);
  const leave = async () => {
    await room.send({ op: 'leave' });
    navigate('home', {}, { replace: true });
  };
  if (!v || !v.domino || v.status !== 'playing') return <OnlineGate view={v} error={room.error} onExit={() => navigate('home', {}, { replace: true })} />;
  const d = v.domino;
  const host = v.members.find((m) => m.seat === v.you)?.host ?? false;
  return (
    <DominoTable
      session={{
        view: d,
        events: v.events as DominoEvent[],
        version: room.seq,
        act: async (action) => (await room.act(action)).ok,
        mine: [v.you],
        scene,
        curtain: null,
        hideHandWhenIdle: false,
        onRematch: host ? () => void room.send({ op: 'rematch' }) : null,
        onExit: leave,
        onBack: leave,
        banner: <OnlineBar view={v} link={room.link} error={room.error} myTurn={d.status === 'playing' && d.currentId === v.you} />,
      }}
    />
  );
}

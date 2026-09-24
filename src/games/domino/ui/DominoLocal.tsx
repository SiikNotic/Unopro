import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { newMatchSeed } from '@/games/shared/rng';
import { useLocalMatch } from '@/games/shared/useLocalMatch';
import { DOMINO_SCENES, loadDominoSetup, pickScene } from '@/games/shared/setup';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import { createDomino, dominoRules, rematch } from '../engine';
import type { DominoAction, DominoState, DominoView } from '../engine';
import { dominoBotDriver } from '../bots/dominoBot';
import { DominoTable } from './DominoTable';

/** A match run on this device: you, bots, and possibly other people passing the device. */
export function DominoLocal() {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const setup = useMemo(() => loadDominoSetup(), []);
  const scene = useMemo(() => pickScene(setup.scene, DOMINO_SCENES, 'games.domino.lastScene'), [setup.scene]);
  const seats = useMemo(() => {
    let bot = 0;
    let human = 1;
    return Array.from({ length: setup.seats }, (_, i) => {
      if (i === 0) return { id: 'you', name: t('games.you'), kind: 'human' as const };
      const kind = setup.others[i - 1] === 'local' ? ('human' as const) : ('bot' as const);
      return { id: `s${i}`, name: kind === 'human' ? t('games.player', { n: ++human }) : t('games.bot', { n: ++bot }), kind };
    });
  }, [setup, t]);
  const mine = useMemo(() => seats.filter((s) => s.kind === 'human').map((s) => s.id), [seats]);
  const hotSeat = mine.length > 1;

  const matchSeed = useRef(newMatchSeed());
  const drivers = useMemo(() => {
    const out: Record<string, SeatDriver<DominoView, DominoAction>> = {};
    seats.forEach((s, i) => {
      if (s.kind === 'bot') out[s.id] = dominoBotDriver(setup.difficulty, matchSeed.current + i);
    });
    return out;
  }, [seats, setup.difficulty]);

  const [paused, setPaused] = useState(false);
  const [viewer, setViewer] = useState('you');
  const actorsOf = useCallback((s: DominoState) => (s.status === 'playing' ? [s.players[s.current].id] : []), []);
  const match = useLocalMatch(dominoRules, () => createDomino({ seats, seed: matchSeed.current, targetScore: setup.target }), drivers, { paused, actorsOf });
  const state = match.state;
  const current = state.players[state.current];
  const curtain = hotSeat && state.status === 'playing' && current.kind === 'human' && current.id !== viewer ? { name: current.name, reveal: () => setViewer(current.id) } : null;

  return (
    <DominoTable
      session={{
        view: match.view(viewer),
        events: match.events,
        version: match.version,
        act: (action) => match.act(action.playerId, action).ok,
        mine,
        scene,
        curtain,
        hideHandWhenIdle: hotSeat,
        onRematch: () => {
          matchSeed.current = newMatchSeed();
          match.reset(rematch(state, matchSeed.current));
          setViewer('you');
        },
        onExit: () => navigate('dominoSetup', {}, { replace: true }),
        onBack: () => back('dominoSetup'),
        onSheet: setPaused,
      }}
    />
  );
}

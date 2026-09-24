import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { newMatchSeed } from '@/games/shared/rng';
import { useLocalMatch } from '@/games/shared/useLocalMatch';
import { BINGO_SCENES, loadBingoSetup, pickScene } from '@/games/shared/setup';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import { bingoRules, createBingo } from '../engine';
import type { BingoAction, BingoState, BingoView } from '../engine';
import { bingoBotDriver } from '../bots/bingoBot';
import { BingoTable } from './BingoTable';

/** Seconds between balls, per speed (the online server uses the same pace). */
const PACE_MS = { slow: 5200, normal: 3800, fast: 2600 } as const;
/** After the first valid BINGO, others have this long to shout theirs before the round closes. */
const CLAIM_WINDOW_MS = 1600;

/** A bingo round run on this device: this device is the caller; the rivals are bots. */
export function BingoLocal() {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const setup = useMemo(() => loadBingoSetup(), []);
  const scene = useMemo(() => pickScene(setup.scene, BINGO_SCENES, 'games.bingo.lastScene'), [setup.scene]);
  const seats = useMemo(
    () => Array.from({ length: setup.players }, (_, i) => (i === 0 ? { id: 'you', name: t('games.you'), kind: 'human' as const } : { id: `s${i}`, name: t('games.bot', { n: i }), kind: 'bot' as const })),
    [setup.players, t]
  );
  const matchSeed = useRef(newMatchSeed());
  const drivers = useMemo(() => {
    const out: Record<string, SeatDriver<BingoView, BingoAction>> = {};
    seats.forEach((s, i) => {
      if (s.kind === 'bot') out[s.id] = bingoBotDriver(setup.difficulty, matchSeed.current + i);
    });
    return out;
  }, [seats, setup.difficulty]);

  const [paused, setPaused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const halted = paused || sheetOpen;
  const actorsOf = useCallback((s: BingoState) => (s.status === 'round_over' ? [] : s.players.map((p) => p.id)), []);
  const match = useLocalMatch(bingoRules, () => createBingo({ seats, seed: matchSeed.current }), drivers, { paused: halted, actorsOf });
  const state = match.state;

  // The house: calls balls at the chosen pace and closes the claim window.
  useEffect(() => {
    if (halted) return;
    let id = 0;
    if (state.status === 'closing') id = window.setTimeout(() => match.house({ type: 'CLOSE_ROUND' }), CLAIM_WINDOW_MS);
    else if (state.status === 'playing' && state.called.length < 75) id = window.setTimeout(() => match.house({ type: 'CALL_NUMBER' }), state.called.length === 0 ? 1200 : PACE_MS[setup.speed]);
    else if (state.status === 'playing') id = window.setTimeout(() => match.house({ type: 'CLOSE_ROUND' }), 10000);
    return () => window.clearTimeout(id);
  }, [state.status, state.called.length, halted, setup.speed, match]);

  return (
    <BingoTable
      session={{
        view: match.view('you'),
        events: match.events,
        version: match.version,
        act: (action) => match.act('you', action),
        scene,
        autoMark: setup.autoMark,
        paused,
        onPause: setPaused,
        onSheet: setSheetOpen,
        onRematch: () => {
          matchSeed.current = newMatchSeed();
          match.reset(createBingo({ seats, seed: matchSeed.current }));
        },
        onExit: () => navigate('bingoSetup', {}, { replace: true }),
        onBack: () => back('bingoSetup'),
      }}
    />
  );
}

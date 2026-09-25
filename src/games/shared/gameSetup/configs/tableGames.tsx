// Setup of Domino and Bingo (local match against bots / people on this device, or an online room).
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { BINGO_SCENES, BINGO_SPEEDS, DIFFICULTIES, DOMINO_SCENES, loadBingoSetup, loadDominoSetup, saveBingoSetup, saveDominoSetup } from '../../setup';
import type { BingoSetup, DominoSetup } from '../../setup';
import { GameSceneBackground } from '../../scenes/GameScenes';
import { BingoArt, DominoArt } from '../../ui/GameArt';
import { onlineConfig } from '@/games/online/client';
import type { GameSetupConfig, PlayMode, SeatModel, Selector, SetupModel } from '../types';

/** Local / online selector shared by the games that have both. */
export function useModeSelector(): Selector<PlayMode> {
  const { t } = useI18n();
  const { params } = useNavigation();
  const [mode, setMode] = useState<PlayMode>(params.online ? 'online' : 'local');
  return {
    value: mode,
    onChange: setMode,
    options: [
      { value: 'local', label: t('setup.modes.local'), hint: t('setup.modes.localHint') },
      { value: 'online', label: t('setup.modes.online'), hint: t('setup.modes.onlineHint') },
    ],
  };
}

export function useDifficultyChoices() {
  const { t } = useI18n();
  return DIFFICULTIES.map((d) => ({ value: d, label: t(`settings.levels.${d}.name`) }));
}

/** Online room actions: the room screen creates, finds or joins (it checks names and accounts). */
export function useOnlineActions(game: 'domino' | 'bingo' | 'carta' | 'blackjack' | 'roulette', startLabel: string): Pick<SetupModel, 'start' | 'secondary' | 'note'> {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  return {
    start: { label: startLabel, onClick: () => navigate('room', { game }) },
    secondary: [{ label: t('room.join'), icon: <KeyRound className="w-4 h-4" aria-hidden />, onClick: () => navigate('room', { game, join: true }) }],
    note: onlineConfig() ? undefined : t('setup.onlineNote'),
  };
}

export function useDominoSetup(): GameSetupConfig {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const [s, setS] = useState<DominoSetup>(loadDominoSetup);
  // Saved on every change: an online room created from here uses the same difficulty and target.
  const update = (patch: Partial<DominoSetup>) =>
    setS((d) => {
      const next = { ...d, ...patch };
      saveDominoSetup(next);
      return next;
    });
  const mode = useModeSelector();
  const difficulties = useDifficultyChoices();
  const online = useOnlineActions('domino', t('setup.openRoom'));
  const local = mode.value === 'local';

  const seats: SeatModel[] = Array.from({ length: s.seats }, (_, i) => {
    if (i === 0) return { kind: 'you', label: t('games.you') };
    const person = s.others[i - 1] === 'local';
    const who = person ? t('setup.local') : t('setup.bot');
    return {
      kind: person ? 'local' : 'bot',
      label: who,
      sub: t('setup.tapToChange'),
      toggleLabel: t('setup.seatToggle', { n: i + 1, who }),
      onToggle: () => update({ others: s.others.map((o, j) => (j === i - 1 ? (o === 'bot' ? 'local' : 'bot') : o)) }),
    };
  });
  const people = s.others.slice(0, s.seats - 1).filter((o) => o === 'local').length;

  const model: SetupModel = {
    mode,
    ...(local
      ? {
          playerCount: { value: s.seats, options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })), onChange: (n) => update({ seats: n as DominoSetup['seats'] }) },
          seats,
          seatNote: people > 0 ? t('setup.hotSeatNote') : undefined,
        }
      : {}),
    difficulty: { value: s.difficulty, options: difficulties, onChange: (d) => update({ difficulty: d as DominoSetup['difficulty'] }) },
    rules: [{ kind: 'choice', id: 'target', label: t('setup.target'), value: s.target, options: [100, 200].map((n) => ({ value: n, label: t('setup.points', { n }) })), onChange: (v) => update({ target: v as 100 | 200 }) }],
    scenario: { value: s.scene, options: (['random', ...DOMINO_SCENES] as const).map((v) => ({ value: v, label: t(`scenes.${v}`) })), onChange: (v) => update({ scene: v as DominoSetup['scene'] }) },
    summary: local
      ? [t('setup.sum.players', { n: s.seats }), t(`settings.levels.${s.difficulty}.name`), t('setup.points', { n: s.target }), t(`scenes.${s.scene}`)]
      : [t('setup.modes.online'), t(`settings.levels.${s.difficulty}.name`), t('setup.points', { n: s.target }), t(`scenes.${s.scene}`)],
    ...(local ? { start: { label: t('setup.start'), onClick: () => navigate('domino') } } : online),
  };
  return {
    id: 'domino',
    theme: 'domino',
    name: t('hub.domino.name'),
    description: t('hub.domino.long'),
    art: <DominoArt size={30} />,
    back: 'home',
    background: <GameSceneBackground scene={s.scene === 'random' ? 'salon' : s.scene} />,
    model,
  };
}

export function useBingoSetup(): GameSetupConfig {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const [s, setS] = useState<BingoSetup>(loadBingoSetup);
  const update = (patch: Partial<BingoSetup>) =>
    setS((b) => {
      const next = { ...b, ...patch };
      saveBingoSetup(next);
      return next;
    });
  const mode = useModeSelector();
  const difficulties = useDifficultyChoices();
  const online = useOnlineActions('bingo', t('setup.openRoom'));
  const local = mode.value === 'local';

  const seats: SeatModel[] = Array.from({ length: s.players }, (_, i) => (i === 0 ? { kind: 'you', label: t('games.you') } : { kind: 'bot', label: t('setup.bot') }));
  const model: SetupModel = {
    mode,
    ...(local
      ? { playerCount: { value: s.players, options: [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), onChange: (n) => update({ players: n as BingoSetup['players'] }) }, seats }
      : {}),
    difficulty: { value: s.difficulty, options: difficulties, onChange: (d) => update({ difficulty: d as BingoSetup['difficulty'] }) },
    rules: [
      { kind: 'choice', id: 'speed', label: t('setup.speed'), value: s.speed, options: BINGO_SPEEDS.map((v) => ({ value: v, label: t(`setup.speeds.${v}`) })), onChange: (v) => update({ speed: v as BingoSetup['speed'] }) },
      { kind: 'toggle', id: 'autoMark', label: t('setup.autoMark'), checked: s.autoMark, onChange: (autoMark: boolean) => update({ autoMark }) },
    ],
    scenario: { value: s.scene, options: (['random', ...BINGO_SCENES] as const).map((v) => ({ value: v, label: t(`scenes.${v}`) })), onChange: (v) => update({ scene: v as BingoSetup['scene'] }) },
    summary: local
      ? [t('setup.sum.players', { n: s.players }), t(`settings.levels.${s.difficulty}.name`), t(`setup.speeds.${s.speed}`), t(`scenes.${s.scene}`)]
      : [t('setup.modes.online'), t(`settings.levels.${s.difficulty}.name`), t(`setup.speeds.${s.speed}`), t(`scenes.${s.scene}`)],
    ...(local ? { start: { label: t('setup.start'), onClick: () => navigate('bingo') } } : online),
  };
  return {
    id: 'bingo',
    theme: 'bingo',
    name: t('hub.bingo.name'),
    description: t('hub.bingo.long'),
    art: <BingoArt size={30} />,
    back: 'home',
    background: <GameSceneBackground scene={s.scene === 'random' ? 'party' : s.scene} />,
    model,
  };
}

// Setup of Poker (Texas Hold'em) against bots on this device, with practice chips only (they never touch
// the account coins). Online poker tables are not available yet, so there is no online mode here.
import { useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { CASINO_SCENES, loadPokerSetup, POKER_BLINDS, POKER_PLAYERS, POKER_STACKS, savePokerSetup } from '../../setup';
import type { PokerSetup } from '../../setup';
import type { GameSetupConfig, SeatModel, SetupModel } from '../types';
import { useDifficultyChoices } from './tableGames';

export function usePokerSetup(): GameSetupConfig {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const [s, setS] = useState<PokerSetup>(loadPokerSetup);
  const update = (patch: Partial<PokerSetup>) =>
    setS((cur) => {
      const next = { ...cur, ...patch };
      savePokerSetup(next);
      return next;
    });
  const difficulties = useDifficultyChoices();
  const seats: SeatModel[] = Array.from({ length: s.players }, (_, i) => (i === 0 ? { kind: 'you', label: t('games.you') } : { kind: 'bot', label: t('table.botName', { n: i }) }));
  const model: SetupModel = {
    playerCount: { value: s.players, options: POKER_PLAYERS.map((n) => ({ value: n, label: String(n) })), onChange: (n) => update({ players: n as PokerSetup['players'] }) },
    seats,
    seatNote: t('poker.setup.seatNote'),
    difficulty: { value: s.difficulty, options: difficulties, onChange: (d) => update({ difficulty: d as PokerSetup['difficulty'] }) },
    rules: [
      { kind: 'choice', id: 'stack', label: t('poker.setup.stack'), value: s.stack, options: POKER_STACKS.map((v) => ({ value: v, label: v.toLocaleString() })), onChange: (v) => update({ stack: v as PokerSetup['stack'] }) },
      { kind: 'choice', id: 'blinds', label: t('poker.setup.blinds'), value: s.blinds, options: POKER_BLINDS.map((v) => ({ value: v, label: v })), onChange: (v) => update({ blinds: v as PokerSetup['blinds'] }) },
      { kind: 'info', id: 'rules', label: t('poker.setup.rules'), items: (t('poker.setup.rulesItems') as string).split('|') },
    ],
    scenario: { value: s.scene, options: (['random', ...CASINO_SCENES] as const).map((v) => ({ value: v, label: t(`scenarios.${v}`) })), onChange: (v) => update({ scene: v as PokerSetup['scene'] }) },
    summary: [t('setup.sum.players', { n: s.players }), t(`settings.levels.${s.difficulty}.name`), t('poker.setup.sumStack', { n: s.stack.toLocaleString() }), t('poker.setup.sumBlinds', { b: s.blinds })],
    start: { label: t('setup.start'), onClick: () => navigate('poker') },
    note: t('poker.setup.practiceNote'),
  };
  return {
    id: 'poker',
    theme: 'casino',
    name: t('poker.name'),
    description: t('poker.description'),
    art: (
      <span className="relative inline-block" style={{ width: 96, height: 72 }}>
        <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={46} className="absolute left-1 top-1 -rotate-12" />
        <PlayingCardView card={{ id: 'k', rank: 'A', suit: 'H' }} width={46} className="absolute left-10 top-0 rotate-6" />
      </span>
    ),
    back: 'home',
    background: <SceneBackground scenario={s.scene === 'random' ? 'lounge' : s.scene} />,
    model,
  };
}

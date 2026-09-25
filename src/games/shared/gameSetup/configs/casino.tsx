// Setup of Blackjack and Roulette: play alone against the house on this device, or sit at an online table
// with other players (account coins). Only the options these games really have: the table and the scene;
// their rules are fixed and shown for information.
import { useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { GameArt } from '@/components/lobby/lobbyArt';
import { onlineConfig } from '@/games/online/client';
import { SEAT_RANGE } from '@/games/online/protocol';
import { BJ_LIMITS } from '@/casino/table/blackjackTable';
import { RT_LIMITS } from '@/casino/table/rouletteTable';
import { CASINO_SCENES, DEFAULT_CASINO, loadCasinoSetup, saveCasinoSetup } from '../../setup';
import type { CasinoGame, CasinoSetup } from '../../setup';
import type { GameSetupConfig, SeatModel, SetupModel } from '../types';
import { useOnlineActions } from './tableGames';

export function useCasinoSetup(game: CasinoGame): GameSetupConfig {
  const { t } = useI18n();
  const { navigate, params } = useNavigation();
  const [s, setS] = useState<CasinoSetup>(() => loadCasinoSetup(game));
  const hasOnline = onlineConfig() !== null;
  const [mode, setMode] = useState<'solo' | 'online'>(hasOnline && params.online ? 'online' : 'solo');
  const online = useOnlineActions(game, t('setup.findTable'));
  const max = SEAT_RANGE[game].max;
  const solo = mode === 'solo';

  const seats: SeatModel[] = solo
    ? [
        { kind: 'you', label: t('games.you') },
        { kind: 'dealer', label: t(game === 'blackjack' ? 'setup.dealer' : 'setup.croupier'), sub: t('setup.house') },
      ]
    : [{ kind: 'you', label: t('games.you') }, ...Array.from({ length: max - 1 }, () => ({ kind: 'open' as const, label: t('setup.empty'), sub: t('setup.otherPlayer') }))];

  const rulesKey = `setup.casinoRules.${game}.${solo ? 'solo' : 'online'}`;
  const items = (t(rulesKey, { min: BJ_LIMITS.min, max: game === 'blackjack' ? BJ_LIMITS.max : RT_LIMITS.maxPerRound }) as string).split('|');

  const model: SetupModel = {
    ...(hasOnline
      ? {
          mode: {
            value: mode === 'solo' ? 'local' : 'online',
            onChange: (v) => setMode(v === 'local' ? 'solo' : 'online'),
            options: [
              { value: 'local', label: t('setup.modes.solo'), hint: t('setup.modes.soloHint') },
              { value: 'online', label: t('setup.modes.table'), hint: t('setup.sum.upTo', { n: max }) },
            ],
          },
        }
      : {}),
    seats,
    seatNote: solo ? undefined : t('setup.tableNote'),
    rules: [{ kind: 'info', id: 'rules', label: t('setup.houseRules'), items }],
    scenario: {
      value: s.scene,
      options: (['random', ...CASINO_SCENES] as const).map((v) => ({ value: v, label: t(`scenarios.${v}`) + (v === DEFAULT_CASINO[game].scene ? ` · ${t('setup.classic')}` : '') })),
      onChange: (v) =>
        setS(() => {
          const next = { scene: v as CasinoSetup['scene'] };
          saveCasinoSetup(game, next);
          return next;
        }),
    },
    summary: [solo ? t('setup.modes.solo') : t('setup.modes.table'), solo ? t('setup.sum.players', { n: 1 }) : t('setup.sum.upTo', { n: max }), t(`scenarios.${s.scene}`)],
    ...(solo ? { start: { label: t('setup.start'), onClick: () => navigate(game) } } : online),
  };

  return {
    id: game,
    theme: 'casino',
    name: t(`casino.${game}.name`),
    description: t(`casino.${game}.description`),
    art: <GameArt game={game} size={30} />,
    back: 'home',
    background: <SceneBackground scenario={s.scene === 'random' ? (game === 'blackjack' ? 'lounge' : 'city') : s.scene} />,
    model,
  };
}

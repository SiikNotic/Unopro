// Setup of Carta: against bots on this device (format, seats, rules the engine supports) or online rooms.
import { useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { SceneBackground } from '@/components/scene/SceneBackground';
import { GameArt } from '@/components/lobby/lobbyArt';
import { SCENARIO_IDS } from '@/game/scenarios/scenarios';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import type { BotDifficulty } from '@/game/bots';
import { onlineConfig } from '@/games/online/client';
import { CARTA_PLAYERS, cartaTeamOf, loadCartaSetup, saveCartaSetup } from '../../setup';
import type { CartaFormat, CartaSetup } from '../../setup';
import type { GameSetupConfig, SeatModel, SetupModel } from '../types';
import { useDifficultyChoices, useModeSelector, useOnlineActions } from './tableGames';

export function useCartaSetup(): GameSetupConfig {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const [s, setS] = useState<CartaSetup>(loadCartaSetup);
  const update = (patch: Partial<CartaSetup>) =>
    setS((c) => {
      const next = { ...c, ...patch };
      saveCartaSetup(next);
      return next;
    });
  const modeSel = useModeSelector();
  const hasOnline = onlineConfig() !== null;
  const local = !hasOnline || modeSel.value === 'local';
  const difficulties = useDifficultyChoices();
  const online = useOnlineActions('carta', t('setup.findTable'));
  const teams = s.format === 'teams';

  const seats: SeatModel[] = Array.from({ length: s.players }, (_, i) => {
    const team = teams ? cartaTeamOf(i) : undefined;
    if (i === 0) return { kind: 'you', label: t('games.you'), team };
    return { kind: 'bot', label: t('table.botName', { n: i }), team, sub: teams && team === 'A' ? t('setup.partner') : undefined };
  });

  const setFormat = (f: string) => {
    const format = f as CartaFormat;
    const players = CARTA_PLAYERS[format].includes(s.players) ? s.players : 4;
    update({ format, players });
  };

  // Difficulty and scenario are the same preferences the Settings screen edits (PlayScreen reads them).
  const difficulty = { value: preferences.difficulty, options: difficulties, onChange: (d: string) => setPreference('difficulty', d as BotDifficulty) };
  const scenario = {
    value: preferences.scenario,
    options: (['random', ...SCENARIO_IDS] as const).map((v) => ({ value: v, label: t(`scenarios.${v}`) })),
    onChange: (v: string) => setPreference('scenario', v as ScenarioId | 'random'),
  };

  const model: SetupModel = local
    ? {
        mode: hasOnline ? modeSel : undefined,
        format: {
          value: s.format,
          options: [
            { value: 'classic', label: t('gameModes.classic.name'), hint: t('setup.formats.classic') },
            { value: 'teams', label: t('gameModes.teams.name'), hint: t('setup.formats.teams') },
          ],
          onChange: setFormat,
        },
        playerCount: { value: s.players, options: CARTA_PLAYERS[s.format].map((n) => ({ value: n, label: String(n) })), onChange: (n) => update({ players: n as CartaSetup['players'] }) },
        seats,
        seatNote: teams ? t('setup.teamsNote') : undefined,
        difficulty,
        rules: [
          { kind: 'choice', id: 'target', label: t('setup.target'), value: s.target, options: [250, 500].map((n) => ({ value: n, label: t('setup.points', { n }) })), onChange: (v) => update({ target: v as CartaSetup['target'] }) },
          { kind: 'toggle', id: 'stacking', label: t('setup.cartaRules.stacking'), hint: t('setup.cartaRules.stackingHint'), checked: s.stacking, onChange: (stacking) => update({ stacking }) },
          { kind: 'toggle', id: 'drawUntil', label: t('setup.cartaRules.drawUntil'), hint: t('setup.cartaRules.drawUntilHint'), checked: s.drawUntilPlayable, onChange: (drawUntilPlayable) => update({ drawUntilPlayable }) },
        ],
        scenario,
        summary: [
          teams ? t('gameModes.teams.name') : t('gameModes.classic.name'),
          t('setup.sum.players', { n: s.players }),
          t(`settings.levels.${preferences.difficulty}.name`),
          t('setup.points', { n: s.target }),
        ],
        start: { label: t('setup.start'), onClick: () => navigate('play', { mode: s.format }) },
      }
    : {
        mode: modeSel,
        seats: [{ kind: 'you', label: t('games.you') }, ...Array.from({ length: 5 }, () => ({ kind: 'open' as const, label: t('setup.empty'), sub: t('setup.orBot') }))],
        seatNote: t('setup.cartaOnlineNote'),
        difficulty,
        scenario,
        summary: [t('setup.modes.online'), t('setup.sum.upTo', { n: 6 }), t(`settings.levels.${preferences.difficulty}.name`)],
        ...online,
      };

  return {
    id: 'carta',
    theme: 'carta',
    name: t('hub.carta.name'),
    description: t('hub.carta.desc'),
    art: <GameArt game="carta" size={30} />,
    back: 'home',
    background: <SceneBackground scenario={preferences.scenario === 'random' ? 'lounge' : preferences.scenario} />,
    model,
  };
}

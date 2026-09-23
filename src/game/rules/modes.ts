import type { GameMode } from '@/game/engine/types';

export const GAME_MODES: GameMode[] = [
  {
    id: 'classic',
    nameKey: 'gameModes.classic.name',
    descriptionKey: 'gameModes.classic.description',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: true,
    icon: 'cards',
  },
  {
    id: 'teams',
    nameKey: 'gameModes.teams.name',
    descriptionKey: 'gameModes.teams.description',
    minPlayers: 4,
    maxPlayers: 10,
    enabled: false,
    icon: 'users',
  },
  {
    id: 'tournament',
    nameKey: 'gameModes.tournament.name',
    descriptionKey: 'gameModes.tournament.description',
    minPlayers: 4,
    maxPlayers: 16,
    enabled: false,
    icon: 'trophy',
  },
  {
    id: 'custom',
    nameKey: 'gameModes.custom.name',
    descriptionKey: 'gameModes.custom.description',
    minPlayers: 2,
    maxPlayers: 10,
    enabled: false,
    icon: 'sliders',
  },
];

// The painted scenario backdrops (the lounge is the same room as Domino's lounge).
import type { ScenarioId } from '@/game/scenarios/scenarios';
import lounge from '@/games/shared/scenes/art/lounge.webp';
import sky from './art/sky.webp';
import volcano from './art/volcano.webp';
import ocean from './art/ocean.webp';
import space from './art/space.webp';
import forest from './art/forest.webp';
import city from './art/city.webp';

export const SCENARIO_ART: Record<ScenarioId, string> = { sky, volcano, ocean, space, forest, city, lounge };

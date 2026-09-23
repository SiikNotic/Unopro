import { memo, useMemo } from 'react';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { isLiteDevice } from './particles';
import { CityScene, ForestScene, LoungeScene, OceanScene, SkyScene, SpaceScene, VolcanoScene } from './Scenes';
import './scene.css';

const SCENES: Record<ScenarioId, (props: { lite: boolean }) => JSX.Element> = {
  sky: SkyScene,
  volcano: VolcanoScene,
  ocean: OceanScene,
  space: SpaceScene,
  forest: ForestScene,
  city: CityScene,
  lounge: LoungeScene,
};

/** Full-screen animated backdrop for the current scenario. Purely decorative. */
export const SceneBackground = memo(function SceneBackground({ scenario }: { scenario: ScenarioId }) {
  const lite = useMemo(() => isLiteDevice(), []);
  const Scene = SCENES[scenario];
  return (
    <div className={`scene absolute inset-0 overflow-hidden pointer-events-none ${lite ? 'scene-lite' : ''}`} data-scene={scenario} aria-hidden>
      <Scene lite={lite} />
      {/* vignette keeps the table the brightest thing on screen */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 55%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  );
});

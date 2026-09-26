// Scenario backdrops: the owner's painted scenes at full quality, each with a few particles on top. Only
// transform/opacity are animated; particle counts are small and fixed.
import type { CSSProperties } from 'react';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import lounge from '@/games/shared/scenes/art/lounge.webp';
import { makeParticles } from './particles';
import type { Particle } from './particles';
import sky from './art/sky.webp';
import volcano from './art/volcano.webp';
import ocean from './art/ocean.webp';
import space from './art/space.webp';
import forest from './art/forest.webp';
import city from './art/city.webp';

type MoteOpts = Parameters<typeof makeParticles>[2];

const px = (p: Particle): CSSProperties =>
  ({
    left: `${p.left}%`,
    top: `${p.top}%`,
    width: p.size,
    height: p.size,
    animationDelay: `${p.delay}s`,
    animationDuration: `${p.duration}s`,
    '--drift': `${p.drift}px`,
  }) as CSSProperties;

function Motes({ count, seed, className, lite, opts }: { count: number; seed: number; className: string; lite: boolean; opts?: MoteOpts }) {
  return (
    <>
      {makeParticles(lite ? Math.ceil(count / 2) : count, seed, opts).map((p, i) => (
        <span key={i} className={`scene-particle ${className}`} style={px(p)} />
      ))}
    </>
  );
}

// The lounge is the same room as Domino's lounge.
const ART: Record<ScenarioId, string> = { sky, volcano, ocean, space, forest, city, lounge };

const MOTES: Record<ScenarioId, { count: number; seed: number; className: string; opts: MoteOpts }> = {
  sky: { count: 10, seed: 11, className: 'scene-rise bg-white/80', opts: { minSize: 2, maxSize: 4, minDur: 14, maxDur: 24 } },
  volcano: { count: 14, seed: 22, className: 'scene-ember', opts: { minSize: 2, maxSize: 4, minDur: 6, maxDur: 11 } },
  ocean: { count: 10, seed: 33, className: 'scene-rise bg-white/50', opts: { minSize: 3, maxSize: 6, minDur: 10, maxDur: 18 } },
  space: { count: 12, seed: 44, className: 'scene-glint', opts: { minSize: 2, maxSize: 3, minDur: 3, maxDur: 6 } },
  forest: { count: 12, seed: 66, className: 'scene-firefly', opts: { minSize: 3, maxSize: 5, minDur: 6, maxDur: 12 } },
  city: { count: 8, seed: 77, className: 'scene-rise bg-pink-200/60', opts: { minSize: 2, maxSize: 3, minDur: 14, maxDur: 22 } },
  lounge: { count: 12, seed: 88, className: 'scene-rise bg-amber-100/50', opts: { minSize: 2, maxSize: 3, minDur: 16, maxDur: 28 } },
};

export function PaintedScenario({ scenario, lite }: { scenario: ScenarioId; lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: `url(${ART[scenario]}) 50% 45% / cover no-repeat, #0b0b14` }} />
      <Motes {...MOTES[scenario]} lite={lite} />
    </>
  );
}

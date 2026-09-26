// Backdrops for Domino and Bingo: the owner's painted rooms plus a few particles, on the same scene system as
// Carta (scene.css): only transform/opacity animate, particle counts are small and fixed, and everything stops
// with reduced motion or the Animations setting. A vignette keeps the table/board the brightest thing on screen.
import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { isLiteDevice, makeParticles } from '@/components/scene/particles';
import type { GameScene } from '../setup';
import salon from './art/salon.webp';
import cafe from './art/cafe.webp';
import terrace from './art/terrace.webp';
import lounge from './art/lounge.webp';
import woodhouse from './art/woodhouse.webp';
import hall from './art/hall.webp';
import theater from './art/theater.webp';
import party from './art/party.webp';
import casino from './art/casino.webp';
import future from './art/future.webp';
import '@/components/scene/scene.css';
import './gameScenes.css';

function Motes({ count, seed, className, lite, size = [2, 4], dur = [10, 18] }: { count: number; seed: number; className: string; lite: boolean; size?: [number, number]; dur?: [number, number] }) {
  const list = useMemo(() => makeParticles(lite ? Math.ceil(count / 2) : count, seed, { minSize: size[0], maxSize: size[1], minDur: dur[0], maxDur: dur[1] }), [count, seed, lite, size, dur]);
  return (
    <>
      {list.map((p, i) => (
        <span
          key={i}
          className={`scene-particle ${className}`}
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, '--drift': `${p.drift}px` } as CSSProperties}
        />
      ))}
    </>
  );
}

/** The owner's painted rooms, full quality, each with a few particles on top.
 * Domino: salon, café, terrace, lounge, old wooden house. Bingo: hall, theatre, party, casino floor, future lounge. */
const SCENE_ART: Record<GameScene, string> = { salon, cafe, terrace, lounge, woodhouse, hall, theater, party, casino, future };

type MotesProps = Omit<Parameters<typeof Motes>[0], 'lite'>;
const dust = (seed: number): MotesProps => ({ count: 8, seed, className: 'scene-rise gs-dust', dur: [18, 30] });
const SCENE_MOTES: Record<GameScene, MotesProps> = {
  salon: dust(101),
  cafe: dust(202),
  terrace: dust(404),
  lounge: dust(505),
  woodhouse: dust(303),
  hall: dust(909),
  theater: dust(505),
  party: { count: 14, seed: 606, className: 'scene-rise gs-confetti', size: [3, 7], dur: [10, 18] },
  casino: { count: 10, seed: 707, className: 'scene-glint gs-bokeh', size: [6, 14], dur: [4, 8] },
  future: { count: 10, seed: 808, className: 'scene-glint', size: [2, 3], dur: [3, 6] },
};

function PaintedScene({ scene, lite }: { scene: GameScene; lite: boolean }) {
  return (
    <>
      <div className="gs-photo" style={{ '--gs-photo': `url(${SCENE_ART[scene]})` } as CSSProperties} />
      <Motes {...SCENE_MOTES[scene]} lite={lite} />
    </>
  );
}

export const GameSceneBackground = memo(function GameSceneBackground({ scene }: { scene: GameScene }) {
  const lite = useMemo(() => isLiteDevice(), []);
  return (
    <div className={`scene fixed inset-0 overflow-hidden pointer-events-none ${lite ? 'scene-lite' : ''}`} data-scene={scene} aria-hidden>
      <PaintedScene scene={scene} lite={lite} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 55%, transparent 35%, rgba(0,0,0,0.6) 100%)' }} />
    </div>
  );
});

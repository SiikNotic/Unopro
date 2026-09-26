// Animated backdrops for Domino and Bingo, built on the same scene system as Carta (scene.css): only
// transform/opacity animate, particle counts are small and fixed, and everything stops with reduced motion
// or the Animations setting. They stay dim: the table/board is always the brightest thing on screen.
import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { isLiteDevice, makeParticles } from '@/components/scene/particles';
import type { DominoScene, GameScene } from '../setup';
import salon from './art/salon.webp';
import cafe from './art/cafe.webp';
import terrace from './art/terrace.webp';
import lounge from './art/lounge.webp';
import woodhouse from './art/woodhouse.webp';
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

/** Domino — the owner's painted rooms (salon, café, terrace, lounge, old wooden house), full quality, with a little
 * floating dust on top. */
const DOMINO_ART: Record<DominoScene, string> = { salon, cafe, terrace, lounge, woodhouse };

function dominoScene(scene: DominoScene, seed: number) {
  return function DominoPhoto({ lite }: { lite: boolean }) {
    return (
      <>
        <div className="gs-photo" style={{ '--gs-photo': `url(${DOMINO_ART[scene]})` } as CSSProperties} />
        <Motes count={8} seed={seed} className="scene-rise gs-dust" lite={lite} dur={[18, 30]} />
      </>
    );
  };
}

/** Bingo — modern hall: a huge dim LED board, sweeping ceiling spots. */
function Hall({ lite }: { lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 50% 0%, #1b2a6b 0%, #0b1030 55%, #05060f 100%)' }} />
      <div className="absolute inset-x-[6%] top-[4%] h-[26%] gs-ledboard" />
      {[18, 50, 82].map((x, i) => (
        <span key={x} className="gs-spot" style={{ left: `${x}%`, animationDelay: `${-i * 2.5}s` }} />
      ))}
      <Motes count={12} seed={404} className="scene-rise gs-confetti" lite={lite} size={[3, 6]} dur={[12, 20]} />
    </>
  );
}

/** Bingo — theatre: velvet curtains, a proscenium, one spotlight. */
function Theater({ lite }: { lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 55% at 50% 30%, #3a0c14 0%, #16040a 70%)' }} />
      <div className="gs-curtain left" />
      <div className="gs-curtain right" />
      <div className="absolute inset-x-0 top-0 h-[10%] gs-valance" />
      <span className="gs-stagespot scene-pulse" />
      <Motes count={8} seed={505} className="scene-rise gs-dust" lite={lite} dur={[16, 26]} />
    </>
  );
}

/** Bingo — party: bunting, balloons, confetti. */
function Party({ lite }: { lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 70% at 50% 10%, #5a2a8a 0%, #2a1050 50%, #12061f 100%)' }} />
      <svg className="absolute inset-x-0 top-[3%] w-full h-[12%] scene-sway" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 4 Q200 30 400 4" stroke="#f5e6c8" strokeWidth="1" fill="none" opacity="0.7" />
        {Array.from({ length: 16 }, (_, i) => {
          const x = 12 + i * 24.5;
          const y = 4 + 26 * Math.sin((Math.PI * x) / 400) * 0.95;
          return <path key={i} d={`M${x - 8} ${y} L${x + 8} ${y} L${x} ${y + 14} Z`} fill={['#ff5f7e', '#ffd166', '#4dd6c1', '#7aa2ff'][i % 4]} opacity="0.85" />;
        })}
      </svg>
      {[
        { x: 6, c: '#ff5f7e', d: 0 },
        { x: 90, c: '#4dd6c1', d: -3 },
        { x: 82, c: '#ffd166', d: -6 },
      ].map((b) => (
        <span key={b.x} className="gs-balloon scene-bob" style={{ left: `${b.x}%`, '--c': b.c, animationDelay: `${b.d}s` } as CSSProperties} />
      ))}
      <Motes count={14} seed={606} className="scene-rise gs-confetti" lite={lite} size={[3, 7]} dur={[10, 18]} />
    </>
  );
}

/** Bingo — casino floor: a marquee of chasing bulbs over deep red and gold bokeh. */
function Casino({ lite }: { lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 50% 0%, #4a0d1c 0%, #1c050c 60%, #0b0206 100%)' }} />
      <div className="gs-marquee">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i % 3) * 0.4}s` }} />
        ))}
      </div>
      <Motes count={10} seed={707} className="scene-glint gs-bokeh" lite={lite} size={[6, 14]} dur={[4, 8]} />
    </>
  );
}

/** Bingo — future lounge: a neon floor grid rolling toward you, a horizon glow. */
function Future({ lite }: { lite: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #05020f 0%, #160a3a 48%, #2b0f4f 55%, #07041a 100%)' }} />
      <div className="absolute inset-x-0 top-[50%] h-[3px] scene-pulse" style={{ background: 'linear-gradient(90deg, transparent, #35e0ff, #ff3dcb, transparent)', boxShadow: '0 0 30px 6px rgba(53,224,255,0.35)' }} />
      <div className="gs-grid">
        <i />
      </div>
      <Motes count={10} seed={808} className="scene-glint" lite={lite} size={[2, 3]} dur={[3, 6]} />
    </>
  );
}

const SCENES: Record<GameScene, (p: { lite: boolean }) => JSX.Element> = {
  salon: dominoScene('salon', 101),
  cafe: dominoScene('cafe', 202),
  terrace: dominoScene('terrace', 404),
  lounge: dominoScene('lounge', 505),
  woodhouse: dominoScene('woodhouse', 303),
  hall: Hall,
  theater: Theater,
  party: Party,
  casino: Casino,
  future: Future,
};

export const GameSceneBackground = memo(function GameSceneBackground({ scene }: { scene: GameScene }) {
  const lite = useMemo(() => isLiteDevice(), []);
  const Scene = SCENES[scene];
  return (
    <div className={`scene fixed inset-0 overflow-hidden pointer-events-none ${lite ? 'scene-lite' : ''}`} data-scene={scene} aria-hidden>
      <Scene lite={lite} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 55%, transparent 35%, rgba(0,0,0,0.6) 100%)' }} />
    </div>
  );
});

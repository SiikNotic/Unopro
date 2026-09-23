// Animated scenario backdrops. Only transform/opacity are animated; particle counts are small and fixed.
import type { CSSProperties } from 'react';
import { makeParticles, starField } from './particles';
import type { Particle } from './particles';

interface SceneProps {
  lite: boolean;
}

const px = (p: Particle, extra: CSSProperties = {}): CSSProperties =>
  ({
    left: `${p.left}%`,
    top: `${p.top}%`,
    width: p.size,
    height: p.size,
    animationDelay: `${p.delay}s`,
    animationDuration: `${p.duration}s`,
    '--drift': `${p.drift}px`,
    ...extra,
  }) as CSSProperties;

function Motes({ count, seed, className, lite, opts }: { count: number; seed: number; className: string; lite: boolean; opts?: Parameters<typeof makeParticles>[2] }) {
  return (
    <>
      {makeParticles(lite ? Math.ceil(count / 2) : count, seed, opts).map((p, i) => (
        <span key={i} className={`scene-particle ${className}`} style={px(p)} />
      ))}
    </>
  );
}

function CloudRow({ className, duration, opacity, lite }: { className: string; duration: number; opacity: number; lite: boolean }) {
  return (
    <div className={`scene-drift ${className}`} style={{ animationDuration: `${duration}s`, opacity }}>
      {[0, 1].map((copy) => (
        <div key={copy} className="scene-cloud-strip">
          {[8, 30, 55, 78].map((x, i) => (
            <span key={i} className={`scene-cloud ${lite ? '' : 'scene-soft'}`} style={{ left: `${x}%`, transform: `scale(${0.7 + ((i * 37) % 5) / 10})` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkyScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #3f8fd6 0%, #86c3ef 42%, #fbe0bf 78%, #f6c6a4 100%)' }} />
      <div className="absolute right-[8%] top-[6%] w-[38vmin] h-[38vmin] rounded-full scene-pulse" style={{ background: 'radial-gradient(circle, rgba(255,250,225,0.95) 0 16%, rgba(255,236,190,0.45) 30%, transparent 68%)' }} />
      <CloudRow className="top-[8%] h-[18%]" duration={160} opacity={0.55} lite={lite} />
      <CloudRow className="top-[24%] h-[22%]" duration={110} opacity={0.75} lite={lite} />
      <div className="absolute inset-x-[-10%] bottom-[-6%] h-[42%] scene-bob" style={{ background: 'radial-gradient(60% 55% at 20% 60%, #fff 0 45%, transparent 70%), radial-gradient(50% 60% at 55% 70%, #fff 0 45%, transparent 72%), radial-gradient(55% 55% at 88% 60%, #fdf7f0 0 45%, transparent 70%), linear-gradient(transparent 40%, #fff 75%)' }} />
      <CloudRow className="bottom-[14%] h-[20%]" duration={80} opacity={0.9} lite={lite} />
      <Motes count={10} seed={11} className="scene-rise bg-white/80" lite={lite} opts={{ minSize: 2, maxSize: 4, minDur: 14, maxDur: 24 }} />
    </>
  );
}

export function VolcanoScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #160505 0%, #3a0d08 calc(var(--horizon) * 0.6), #6e1c0c var(--horizon), #1f0705 calc(var(--horizon) + 2%), #140403 100%)' }} />
      {/* smoke from the crater */}
      {[0, 1, 2, 3].slice(0, lite ? 2 : 4).map((i) => (
        <span key={i} className={`scene-smoke scene-smoke-band ${lite ? '' : 'scene-soft-lg'}`} style={{ animationDelay: `${-i * 4}s`, left: `${46 + i * 2}%` }} />
      ))}
      <svg className="scene-band-fill" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lava" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffd35a" />
            <stop offset="0.5" stopColor="#ff6a1a" />
            <stop offset="1" stopColor="#b3200a" />
          </linearGradient>
        </defs>
        <path d="M0 140 L0 118 L70 96 L130 92 L170 40 L188 18 L212 18 L232 42 L285 92 L345 98 L400 112 L400 140 Z" fill="#1a0b08" />
        <path className="scene-lava" d="M196 20 C194 44 206 58 198 80 C192 98 206 114 200 136 L206 136 C212 112 200 98 206 80 C214 58 202 42 206 20 Z" fill="url(#lava)" />
        <path className="scene-lava" style={{ animationDelay: '-1.5s' }} d="M214 26 C226 52 244 70 262 100 L268 100 C250 68 232 50 220 24 Z" fill="url(#lava)" />
        <ellipse cx="200" cy="19" rx="14" ry="3.5" fill="#ffb347" className="scene-lava" />
      </svg>
      {/* glowing cracks in the ground (visible around the table and behind the hand) */}
      <div className="absolute inset-x-0 bottom-0 h-[64%] scene-pulse" style={{ background: 'radial-gradient(70% 40% at 50% 100%, rgba(255,110,30,0.45), transparent 70%), repeating-linear-gradient(115deg, transparent 0 46px, rgba(255,120,40,0.18) 46px 48px, transparent 48px 120px)' }} />
      <Motes count={14} seed={22} className="scene-ember" lite={lite} opts={{ minSize: 2, maxSize: 4, minDur: 6, maxDur: 11 }} />
    </>
  );
}

export function OceanScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0c2748 0%, #2f6ea6 calc(var(--horizon) * 0.6), #f2c498 var(--horizon), #0e4566 calc(var(--horizon) + 0.3%), #062a44 60%, #031524 100%)' }} />
      <div className="absolute left-1/2 -translate-x-1/2 w-[16vmin] h-[16vmin] rounded-full" style={{ top: 'calc(var(--horizon) - 10vmin)', background: 'radial-gradient(circle, #fff3d6 0 45%, rgba(255,210,150,0.5) 60%, transparent 72%)' }} />
      <div className="absolute left-1/2 -translate-x-1/2 w-[12vmin] h-[60%] scene-pulse" style={{ top: 'var(--horizon)', background: 'linear-gradient(180deg, rgba(255,220,170,0.45), transparent)' }} />
      <svg className="absolute left-[4%] w-[24%] h-[4vmin]" style={{ top: 'calc(var(--horizon) - 4vmin)' }} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
        <path d="M0 20 C20 6 30 4 45 10 C60 2 78 6 100 20 Z" fill="#0a2236" />
      </svg>
      {[
        { top: 'calc(var(--horizon) + 3%)', dur: 30, op: 0.3 },
        { top: 'calc(var(--horizon) + 15%)', dur: 22, op: 0.35 },
        { top: '64%', dur: 16, op: 0.45 },
        { top: '82%', dur: 11, op: 0.55 },
      ].map((w, i) => (
        <div key={i} className="scene-drift absolute inset-x-0 h-[8%]" style={{ top: w.top, animationDuration: `${w.dur}s`, opacity: w.op }}>
          {[0, 1].map((copy) => (
            <svg key={copy} className="scene-wave" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden>
              <path d="M0 10 C25 2 25 18 50 10 C75 2 75 18 100 10 C125 2 125 18 150 10 C175 2 175 18 200 10" fill="none" stroke="rgba(190,235,255,0.8)" strokeWidth="1.2" />
            </svg>
          ))}
        </div>
      ))}
      <Motes count={10} seed={33} className="scene-glint" lite={lite} opts={{ minSize: 2, maxSize: 5, minDur: 3, maxDur: 6 }} />
    </>
  );
}

const STARS_FAR = starField(70, 44, 'rgba(255,255,255,0.7)');
const STARS_NEAR = starField(40, 55, '#fff');

export function SpaceScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 60% 40%, #1d1650 0%, #0a0822 55%, #030208 100%)' }} />
      <div className={`absolute left-[-10%] top-[-10%] w-[70vmax] h-[70vmax] rounded-full scene-spin ${lite ? '' : 'scene-soft-lg'}`} style={{ background: 'radial-gradient(circle at 40% 40%, rgba(214,60,190,0.35), transparent 60%), radial-gradient(circle at 70% 65%, rgba(60,170,230,0.3), transparent 55%)' }} />
      <div className="absolute inset-0 overflow-hidden">
        <span className="scene-stars scene-drift-slow" style={{ boxShadow: STARS_FAR, width: 1, height: 1 }} />
        {!lite && <span className="scene-stars scene-drift-slower scene-twinkle" style={{ boxShadow: STARS_NEAR, width: 2, height: 2 }} />}
      </div>
      <div className="absolute left-[4%] top-[5%] w-[26vmin] h-[26vmin] scene-bob">
        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 32% 30%, #ffd9a0, #e07a4a 40%, #6d2a3a 75%, #1b0c20 100%)', boxShadow: 'inset -14px -10px 30px rgba(0,0,0,0.55), 0 0 40px rgba(255,140,90,0.25)' }} />
        <div className="absolute left-[-30%] right-[-30%] top-[42%] h-[16%] rounded-[50%] border-[3px] border-[#f5d6a8]/60" style={{ transform: 'rotate(-14deg)' }} />
      </div>
      <span className="scene-shooting" />
    </>
  );
}

function Pines({ color, height, seed, className = '' }: { color: string; height: string; seed: number; className?: string }) {
  const trees = makeParticles(14, seed, { minSize: 30, maxSize: 60 });
  return (
    <svg className={`absolute inset-x-0 bottom-0 w-full ${className}`} style={{ height }} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
      {trees.map((t, i) => {
        const x = (i / trees.length) * 420 - 10 + (t.drift % 12);
        const h = t.size + 30;
        return <path key={i} d={`M${x} 100 L${x + h * 0.22} ${100 - h} L${x + h * 0.44} 100 Z`} fill={color} />;
      })}
      <rect x="0" y="92" width="400" height="8" fill={color} />
    </svg>
  );
}

function Trunks() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 800" preserveAspectRatio="none" aria-hidden>
      <path d="M0 0 H26 C22 260 30 520 22 800 H0 Z" fill="#071209" />
      <path d="M34 0 H46 C44 300 50 560 44 800 H36 C40 560 34 300 34 0 Z" fill="#0b1a0d" />
      <path d="M400 0 H372 C377 280 368 520 378 800 H400 Z" fill="#071209" />
      <path d="M362 0 H352 C355 260 350 540 356 800 H364 C360 540 364 260 362 0 Z" fill="#0b1a0d" />
    </svg>
  );
}

export function ForestScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0c2216 0%, #25482c calc(var(--horizon) - 4%), #1a3320 calc(var(--horizon) + 6%), #0d1a0f 100%)' }} />
      {[18, 42, 70].map((x, i) => (
        <span key={i} className="scene-ray" style={{ left: `${x}%`, animationDelay: `${-i * 3}s` }} />
      ))}
      <div className="scene-band">
        <Pines color="#1f3b25" height="70%" seed={61} />
        <Pines color="#132a18" height="52%" seed={62} className="scene-sway" />
      </div>
      <div className={`scene-drift absolute inset-x-0 h-[18%] ${lite ? '' : 'scene-soft-lg'}`} style={{ top: 'calc(var(--horizon) - 6%)', animationDuration: '70s', opacity: 0.3 }}>
        {[0, 1].map((c) => (
          <div key={c} className="scene-fog" />
        ))}
      </div>
      <Pines color="#0a170c" height="22%" seed={63} />
      <Trunks />
      <Motes count={12} seed={66} className="scene-firefly" lite={lite} opts={{ minSize: 3, maxSize: 5, minDur: 6, maxDur: 12 }} />
    </>
  );
}

function Skyline({ color, windowColor, height, seed, lit }: { color: string; windowColor: string; height: string; seed: number; lit: number }) {
  const blocks = makeParticles(16, seed, { minSize: 30, maxSize: 90 });
  let x = 0;
  return (
    <svg className="absolute inset-x-0 bottom-0 w-full" style={{ height }} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
      {blocks.map((b, i) => {
        const w = 18 + (b.drift + 30) / 3;
        const h = b.size;
        const bx = x;
        x += w + 2;
        const windows = [];
        for (let wy = 100 - h + 6; wy < 96; wy += 8) {
          for (let wx = bx + 3; wx < bx + w - 4; wx += 6) {
            if (((wx * 7 + wy * 13 + i) % 10) < lit) windows.push(<rect key={`${wx}-${wy}`} x={wx} y={wy} width="2.4" height="3.2" fill={windowColor} className={(wx + wy) % 5 === 0 ? 'scene-window' : undefined} />);
          }
        }
        return (
          <g key={i}>
            <rect x={bx} y={100 - h} width={w} height={h} fill={color} />
            {windows}
          </g>
        );
      })}
    </svg>
  );
}

export function CityScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #05040c 0%, #150d2c 45%, #3a1440 72%, #0a0610 100%)' }} />
      <div className="absolute right-[10%] top-[3%] w-[12vmin] h-[12vmin] rounded-full" style={{ background: 'radial-gradient(circle, #fff6e0 0 40%, rgba(255,240,210,0.3) 55%, transparent 70%)' }} />
      <div className="absolute inset-x-0 h-[18%] scene-pulse" style={{ top: 'calc(var(--horizon) - 18%)', background: 'radial-gradient(60% 60% at 50% 100%, rgba(255,80,180,0.35), transparent 70%)' }} />
      <div className="scene-band">
        <Skyline color="#221533" windowColor="rgba(255,200,120,0.55)" height="80%" seed={71} lit={2} />
        <Skyline color="#0d0916" windowColor="rgba(255,225,150,0.9)" height="58%" seed={72} lit={3} />
      </div>
      <div className="absolute inset-x-0 bottom-0" style={{ top: 'var(--horizon)', background: 'linear-gradient(180deg, #0d0916, #07050c 60%), repeating-linear-gradient(90deg, rgba(255,95,183,0.06) 0 2px, transparent 2px 60px)' }} />
      <div className="absolute inset-x-0 bottom-[6%] h-[2px] overflow-hidden">
        <span className="scene-car" />
        {!lite && <span className="scene-car" style={{ animationDelay: '-3s', background: 'linear-gradient(90deg, transparent, #ff4a6a)' }} />}
      </div>
      <Motes count={8} seed={77} className="scene-rise bg-pink-200/60" lite={lite} opts={{ minSize: 2, maxSize: 3, minDur: 14, maxDur: 22 }} />
    </>
  );
}

export function LoungeScene({ lite }: SceneProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 120%, #10151d, #07090d 70%)' }} />
      <div className="absolute inset-0 scene-pulse" style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,214,150,0.14), transparent 70%)' }} />
      <Motes count={12} seed={88} className="scene-rise bg-amber-100/50" lite={lite} opts={{ minSize: 2, maxSize: 3, minDur: 16, maxDur: 28 }} />
    </>
  );
}

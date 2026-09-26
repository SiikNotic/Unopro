// The race, on one canvas: a grandstand band (parallax), the turf with mowing stripes, rails and distance poles,
// the starting stalls, the finish line and post, dust, and the horses drawn by code (horseRig). The camera follows
// the leading group. Horse positions come only from the server's checkpoints; the loop runs only while there is
// something moving and stops with the tab hidden. Reduced motion: no dust, no camera shake, a gentler gallop.
import { memo, useEffect, useRef, useState } from 'react';
import { isLiteDevice } from '@/components/scene/particles';
import type { HorseState } from '../api';
import { progressAt } from '../fair';
import { lookOf } from '../stable';
import type { RacePhase } from '../useHorseRace';
import { horseSounds, startRaceSound } from '../sounds';
import { drawHorse, gaitOf } from './horseRig';

interface Props {
  race: HorseState['race'];
  phase: RacePhase;
  serverNow: () => number;
  mine: number | null;
  reduced: boolean;
  labels: { start: string; finish: string; go: string };
  /** The running order (horse numbers), reported a few times a second while racing. */
  onRanks?: (ranks: number[]) => void;
  /** Painted grandstand tile, when the asset exists. */
  grandstand?: string;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}

// A deterministic little RNG for the painted crowd (same crowd every time).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The grandstand band drawn once per size: arches, marble columns, a gold roof line, a blurred crowd, lights. */
function grandstandTile(h: number, dpr: number): HTMLCanvasElement {
  const w = 960;
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#120c10');
  bg.addColorStop(0.55, '#26161a');
  bg.addColorStop(1, '#3a2418');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const r = rng(7);
  // crowd: soft dots in rows, warm and dim
  const colors = ['#e8c46a', '#c8202f', '#f1e6cf', '#138a5a', '#6a2bb8', '#d9d2c4', '#1f58c8'];
  for (let row = 0; row < 7; row++) {
    const y = h * 0.34 + row * h * 0.085;
    for (let x = 0; x < w; x += 7) {
      g.globalAlpha = 0.18 + r() * 0.3;
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.beginPath();
      g.arc(x + r() * 5, y + r() * 4, 2 + r() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  // roof with a gold edge and arches
  const roof = g.createLinearGradient(0, 0, 0, h * 0.26);
  roof.addColorStop(0, '#0a0708');
  roof.addColorStop(1, '#1c1210');
  g.fillStyle = roof;
  g.fillRect(0, 0, w, h * 0.24);
  g.fillStyle = '#e8c46a';
  g.fillRect(0, h * 0.24, w, 2);
  for (let x = 0; x < w; x += 120) {
    g.strokeStyle = 'rgba(232,196,106,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x + 60, h * 0.24, 54, Math.PI, Math.PI * 2);
    g.stroke();
    // marble column
    const col = g.createLinearGradient(x, 0, x + 12, 0);
    col.addColorStop(0, '#9c958a');
    col.addColorStop(0.5, '#f3eee3');
    col.addColorStop(1, '#8a8378');
    g.fillStyle = col;
    g.fillRect(x - 6, h * 0.24, 12, h * 0.76);
    g.fillStyle = '#e8c46a';
    g.fillRect(x - 8, h * 0.24, 16, 3);
    // warm lamp
    const lamp = g.createRadialGradient(x + 60, h * 0.3, 0, x + 60, h * 0.3, 26);
    lamp.addColorStop(0, 'rgba(255,214,140,0.55)');
    lamp.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = lamp;
    g.fillRect(x + 30, h * 0.3 - 26, 60, 52);
  }
  // a dark rail wall at the bottom of the stand
  const wall = g.createLinearGradient(0, h * 0.86, 0, h);
  wall.addColorStop(0, '#1a1010');
  wall.addColorStop(1, '#0b0707');
  g.fillStyle = wall;
  g.fillRect(0, h * 0.86, w, h * 0.14);
  g.fillStyle = 'rgba(232,196,106,0.7)';
  g.fillRect(0, h * 0.86, w, 1.5);
  return c;
}

export const HorseTrack = memo(function HorseTrack({ race, phase, serverNow, mine, reduced, labels, onRanks, grandstand }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [count, setCount] = useState<string | null>(null);
  const cam = useRef<number | null>(null);
  const dust = useRef<Dust[]>([]);
  const tile = useRef<{ key: string; img: CanvasImageSource; w: number } | null>(null);
  const standImg = useRef<HTMLImageElement | null>(null);
  const lite = useRef(isLiteDevice());
  const crossed = useRef<{ race: number; start: boolean; finish: boolean }>({ race: 0, start: false, finish: false });
  const onRanksRef = useRef(onRanks);
  onRanksRef.current = onRanks;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!grandstand) return;
    const img = new Image();
    img.onload = () => {
      standImg.current = img;
      tile.current = null;
    };
    img.src = grandstand;
  }, [grandstand]);

  useEffect(() => {
    if (crossed.current.race !== race.id) crossed.current = { race: race.id, start: false, finish: false };
  }, [race.id]);

  // Countdown 3-2-1-GO (with beeps) in the last seconds before the gates open.
  useEffect(() => {
    if (phase !== 'countdown') {
      setCount(null);
      return;
    }
    let shown = '';
    const tick = () => {
      const left = race.startsAt - serverNow();
      const label = left > 2500 ? '3' : left > 1500 ? '2' : left > 500 ? '1' : labels.go;
      if (label !== shown) {
        shown = label;
        setCount(label);
        if (label !== labels.go) horseSounds.tick(label === '1');
      }
    };
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [phase, race.startsAt, serverNow, labels.go]);

  // The frame loop (static frame while betting; animated while counting down, racing and on the podium).
  useEffect(() => {
    const c = canvas.current;
    const { w, h } = size;
    if (!c || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    const portrait = h > w * 0.9;
    const standH = Math.round(h * (portrait ? 0.2 : 0.24));
    const trackTop = standH + 8;
    const trackBottom = h - Math.max(10, h * 0.05);
    const runners = race.runners;
    const n = runners.length;
    const laneH = (trackBottom - trackTop) / n;
    const unit = Math.min((laneH * 2.2) / 92, (w * (portrait ? 0.24 : 0.13)) / 112);
    const L = w * 8;
    const paths = new Map((race.paths ?? []).map((p) => [p.horse, p.cp]));
    const orderRank = new Map((race.order ?? []).map((hn, i) => [hn, i]));
    const gaits = new Map(runners.map((r) => [r.horse, gaitOf(r.horse)]));
    const tileKey = `${standH}-${dpr}-${standImg.current ? 'img' : 'proc'}`;
    if (!tile.current || tile.current.key !== tileKey) {
      if (standImg.current) {
        const img = standImg.current;
        tile.current = { key: tileKey, img, w: (img.width / img.height) * standH };
      } else {
        tile.current = { key: tileKey, img: grandstandTile(standH, dpr), w: 960 };
      }
    }
    let raf = 0;
    let last = performance.now();
    let lastRanks = '';
    let lastRankAt = 0;
    const sound = phase === 'racing' ? startRaceSound() : null;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = serverNow();
      const raceMs = t - race.startsAt;
      // positions (0 … 1 at the finish, a little beyond after it)
      const prog = runners.map((r) => {
        const cp = paths.get(r.horse);
        const p = phase === 'racing' || phase === 'result' ? (cp ? Math.min(1.07, progressAt(cp, raceMs)) : 0) : 0;
        return { horse: r.horse, p };
      });
      const ranked = [...prog].sort((a, b) => b.p - a.p || (orderRank.get(a.horse) ?? 9) - (orderRank.get(b.horse) ?? 9));
      const lead = ranked[0]?.p ?? 0;
      // camera: on the stalls before the start, on the leading group while racing, on the line at the end
      const front = ranked.slice(0, 3).reduce((a, b) => a + b.p, 0) / Math.max(1, Math.min(3, ranked.length));
      let target = phase === 'betting' || phase === 'countdown' ? w * 0.16 : front * L - w * 0.1;
      if (phase === 'result') target = L - w * 0.12;
      target = Math.max(w * 0.16, Math.min(L - w * 0.12, target));
      cam.current = cam.current === null ? target : cam.current + (target - cam.current) * (1 - Math.exp(-dt * (phase === 'racing' ? 3.2 : 2)));
      const camX = cam.current;
      const shake = !reduced && phase === 'racing' && lead < 1 ? Math.sin(now / 37) * 0.7 : 0;
      const sx = (X: number) => X - camX + w * 0.5;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.save();
      g.translate(0, shake);

      // grandstand band (parallax)
      const tl = tile.current!;
      const off = -((camX * 0.35) % tl.w);
      for (let x = off - tl.w; x < w + tl.w; x += tl.w) g.drawImage(tl.img, x, 0, tl.w, standH);

      // turf
      const turf = g.createLinearGradient(0, standH, 0, h);
      turf.addColorStop(0, '#1a5f37');
      turf.addColorStop(1, '#0f4526');
      g.fillStyle = turf;
      g.fillRect(0, standH, w, h - standH);
      const band = 150;
      const first = Math.floor((camX - w) / band);
      for (let k = first; k < first + Math.ceil(w / band) + 3; k++) {
        if (k % 2) continue;
        g.fillStyle = 'rgba(255,255,255,0.045)';
        g.fillRect(sx(k * band), trackTop, band, trackBottom - trackTop);
      }
      // lane lines
      g.strokeStyle = 'rgba(0,0,0,0.16)';
      g.lineWidth = 1;
      for (let i = 1; i < n; i++) {
        const y = trackTop + laneH * i;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      // far rail with posts, distance poles every eighth
      g.fillStyle = '#f3eee3';
      g.fillRect(0, trackTop - 5, w, 3);
      for (let X = Math.floor((camX - w) / 70) * 70; X < camX + w; X += 70) g.fillRect(sx(X) - 1, trackTop - 5, 2, 7);
      for (let e = 1; e < 8; e++) {
        const x = sx((L * e) / 8);
        if (x < -20 || x > w + 20) continue;
        g.fillStyle = '#e8c46a';
        g.fillRect(x - 2, trackTop - 28, 4, 26);
        g.fillStyle = e % 2 ? '#c8202f' : '#f3eee3';
        g.fillRect(x - 6, trackTop - 32, 12, 7);
      }

      // starting stalls (the gates swing open at the start)
      const gx = sx(0);
      if (gx > -80 && gx < w + 80) {
        const open = Math.max(0, Math.min(1, raceMs / 300));
        for (let i = 0; i < n; i++) {
          const top = trackTop + laneH * i + 2;
          g.fillStyle = 'rgba(8,40,24,0.9)';
          g.fillRect(gx - 6, top, 10, laneH - 4);
          g.fillStyle = '#e8c46a';
          g.fillRect(gx - 6, top, 10, 2);
          if (open < 1) {
            g.fillStyle = `rgba(20,70,44,${1 - open})`;
            g.fillRect(gx + 4, top + 3, Math.max(0, (1 - open) * laneH * 0.55), laneH - 10);
          }
        }
        g.fillStyle = 'rgba(232,196,106,0.9)';
        g.fillRect(gx - 8, trackTop - 8, 14, 5);
      }

      // finish line (gold and chequered) and post
      const fx = sx(L);
      if (fx > -60 && fx < w + 60) {
        const sq = 6;
        for (let y = trackTop, k = 0; y < trackBottom; y += sq, k++) {
          g.fillStyle = k % 2 ? '#111' : '#f5f2ea';
          g.fillRect(fx - sq, y, sq, sq);
          g.fillStyle = k % 2 ? '#f5f2ea' : '#111';
          g.fillRect(fx, y, sq, sq);
        }
        g.fillStyle = '#e8c46a';
        g.fillRect(fx - sq - 2, trackTop, 2, trackBottom - trackTop);
        const postH = Math.min(standH * 0.9, 90);
        g.fillStyle = '#141212';
        g.fillRect(fx - 3, trackTop - postH, 6, postH);
        g.fillStyle = '#e8c46a';
        for (let k = 1; k < 4; k++) g.fillRect(fx - 4, trackTop - (postH * k) / 4, 8, 2);
        g.beginPath();
        g.arc(fx, trackTop - postH - 10, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#141212';
        g.beginPath();
        g.arc(fx, trackTop - postH - 10, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f5f2ea';
        g.fillRect(fx - 9, trackTop - postH - 10, 9, 9);
        g.fillRect(fx, trackTop - postH - 19, 9, 9);
      }

      // SALIDA / META banners on the far rail
      const banner = (X: number, text: string) => {
        const x = sx(X);
        if (x < -120 || x > w + 120) return;
        g.font = `800 ${Math.max(10, Math.min(14, w / 50))}px system-ui, sans-serif`;
        const tw = g.measureText(text).width + 16;
        g.fillStyle = 'rgba(10,8,8,0.8)';
        g.strokeStyle = '#e8c46a';
        g.lineWidth = 1.2;
        g.beginPath();
        g.roundRect(x - tw / 2, trackTop - 58, tw, 20, 6);
        g.fill();
        g.stroke();
        g.fillStyle = '#f3d58c';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, x, trackTop - 48);
      };
      banner(0, labels.start);
      banner(L, labels.finish);

      // horses, far lane first
      const moving = phase === 'racing' || phase === 'result';
      for (let i = 0; i < n; i++) {
        const r = runners[i];
        const pr = prog[i].p;
        const gait = gaits.get(r.horse)!;
        const scale = unit * (0.92 + (0.08 * i) / Math.max(1, n - 1));
        const y = trackTop + laneH * (i + 0.86);
        const x = sx(pr * L) - 58 * scale;
        if (x < -120 * scale || x > w + 80 * scale) continue;
        const cp = paths.get(r.horse);
        const finished = cp ? raceMs > cp[7] + 1500 : false;
        const run = !moving ? 0 : finished ? Math.max(0.2, 1 - (raceMs - (cp ? cp[7] : 0) - 1500) / 2500) : 1;
        const phaseCycles = moving ? (raceMs / 1000) * gait.freq : (now / 1000) * 0.3;
        drawHorse(g, x, y, scale, lookOf(r.horse), { phase: phaseCycles, run, reduced, gait, mine: mine === r.horse });
        // dust behind the hind hooves
        if (moving && run > 0.5 && !reduced && !lite.current && dust.current.length < 140 && Math.random() < 0.55) {
          dust.current.push({ x: x - 26 * scale, y: y - 2, vx: -40 - Math.random() * 60, vy: -10 - Math.random() * 20, life: 1, r: 2 + Math.random() * 3 });
        }
        // number badge above the horse
        const look = lookOf(r.horse);
        const bx = x + 20 * scale;
        const by = y - 96 * scale;
        g.fillStyle = look.silk;
        g.strokeStyle = mine === r.horse ? '#f3d58c' : 'rgba(0,0,0,0.5)';
        g.lineWidth = mine === r.horse ? 2 : 1;
        g.beginPath();
        g.arc(bx, by, 8.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = look.silk === '#f1e6cf' ? '#1a1208' : '#fff';
        g.font = '800 10px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(r.horse), bx, by + 0.5);
      }
      // dust
      const list = dust.current;
      for (let k = list.length - 1; k >= 0; k--) {
        const d = list[k];
        d.x += (d.vx - (moving ? 0 : 0)) * dt;
        d.y += d.vy * dt;
        d.vy += 18 * dt;
        d.life -= dt * 1.6;
        if (d.life <= 0) {
          list.splice(k, 1);
          continue;
        }
        g.fillStyle = `rgba(214,196,158,${d.life * 0.35})`;
        g.beginPath();
        g.arc(d.x, d.y, d.r * (1.6 - d.life * 0.6), 0, Math.PI * 2);
        g.fill();
      }
      // near rail (foreground)
      g.fillStyle = '#f3eee3';
      g.fillRect(0, trackBottom + 2, w, 4);
      for (let X = Math.floor((camX * 1.15 - w) / 80) * 80; X < camX * 1.15 + w; X += 80) g.fillRect(X - camX * 1.15 + w * 0.5 - 1.5, trackBottom + 2, 3, 10);
      g.restore();

      // sounds and the running order
      if (phase === 'racing' || phase === 'result') {
        if (!crossed.current.start && raceMs >= 0 && raceMs < 1500) {
          crossed.current.start = true;
          horseSounds.gates();
        }
        if (!crossed.current.finish && lead >= 1 && raceMs < 60000) {
          crossed.current.finish = true;
          horseSounds.finish();
        }
      }
      sound?.set(1 - Math.abs(front * L - camX) / w, lead > 0.7 ? (lead - 0.7) / 0.3 : 0);
      if (onRanksRef.current && now - lastRankAt > 250) {
        const key = ranked.map((q) => q.horse).join(',');
        if (key !== lastRanks) {
          lastRanks = key;
          onRanksRef.current(ranked.map((q) => q.horse));
        }
        lastRankAt = now;
      }
      if (phase === 'betting' && dust.current.length === 0) return; // a still frame is enough
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onHidden = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      cancelAnimationFrame(raf);
      sound?.stop();
      document.removeEventListener('visibilitychange', onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts per phase/race/size; reads the latest refs
  }, [size.w, size.h, phase, race.id, race.paths, race.order, reduced, mine, labels.start, labels.finish]);

  return (
    <div ref={box} className={`hr-track ${phase === 'racing' ? 'is-racing' : ''}`}>
      <canvas ref={canvas} className="hr-canvas" aria-hidden />
      {count && (
        <span key={count} className={`hr-count ${count === labels.go ? 'is-go' : ''}`} aria-live="assertive">
          {count}
        </span>
      )}
    </div>
  );
});

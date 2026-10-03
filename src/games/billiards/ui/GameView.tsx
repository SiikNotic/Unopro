// One 8-Ball game on screen, shared by the match against the computer and the online match: the players bar
// (names, groups, balls left, whose turn, shot clock), the table, and the shooting controls (drag on the cloth
// to aim, the vertical power bar — pull it down and let go to shoot —, fine aim, spin, and a SHOOT button for
// mouse and keyboard). It never decides anything: it builds a Shot and hands it to `onShoot`.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Bot, ChevronLeft, ChevronRight, Crosshair, Hand, Menu, Target, WifiOff } from 'lucide-react';
import { useI18n } from '@/i18n';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { unlockAudio } from '@/audio/sfx';
import { aimGuide } from '../aim';
import { canPlaceCue, legalTargets, onEight, stageOf } from '../rules';
import type { BilliardsState, Shot } from '../rules';
import type { BallState, PhysicsEvent } from '../physics';
import { inGroup } from '../table';
import { poolSounds } from '../sounds';
import { PoolTable } from './PoolTable';
import type { Replay } from './PoolTable';
import { ballColor } from './draw';
import './billiards.css';

export type PublicState = Omit<BilliardsState, 'seed'>;

export interface GameViewProps {
  state: PublicState;
  /** The seat this screen plays for. */
  me: 0 | 1;
  /** The human may act now (their turn, nothing playing back, no request in flight). */
  canAct: boolean;
  replay: Replay | null;
  onReplayDone: (key: string) => void;
  onShoot: (shot: Shot) => void;
  /** The opponent is a computer player thinking. */
  thinking?: boolean;
  /** Online: when the shot clock runs out (local ms) and who is away. */
  deadline?: number | null;
  away?: (0 | 1)[];
  /** A short message (foul, groups, ...) to show over the table. */
  toast?: string | null;
  onBack: () => void;
  onMenu?: () => void;
  /** End-of-game overlay etc. */
  children?: ReactNode;
}

export function GameView(p: GameViewProps) {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const s = p.state;
  const myTurn = s.turn === p.me && s.phase !== 'over';
  const interactive = p.canAct && myTurn && !p.replay;
  const [aim, setAim] = useState({ dx: 1, dy: 0 });
  const [power, setPower] = useState(0);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const [spinOpen, setSpinOpen] = useState(false);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const [called, setCalled] = useState<number | null>(null);
  const lastPower = useRef(0.55);

  // Each new turn: the cue ball where the state has it, aim at the nearest legal ball, no pocket called.
  const turnKey = `${s.shots}-${s.turn}-${s.match}`;
  useEffect(() => {
    setPlace(null);
    setCalled(null);
    setSpin({ x: 0, y: 0 });
    const cue = s.balls.find((b) => b.id === 0 && !b.down);
    const targets = legalTargets(s as BilliardsState, s.turn);
    const near = s.balls.filter((b) => targets.includes(b.id) && !b.down).sort((a, b) => (cue ? Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y) : 0))[0];
    if (cue && near) setAim({ dx: near.x - cue.x, dy: near.y - cue.y });
    if (myTurn && s.shots > 0) poolSounds.turn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  const balls: BallState[] = useMemo(() => (place ? s.balls.map((b) => (b.id === 0 ? { id: 0, x: place.x, y: place.y, down: false } : b)) : s.balls), [s.balls, place]);
  const targets = useMemo(() => legalTargets(s as BilliardsState, s.turn), [s]);
  const calling = myTurn && onEight(s as BilliardsState, s.turn);
  const cue = balls.find((b) => b.id === 0 && !b.down);
  const guide = cue ? aimGuide(balls, cue, aim.dx, aim.dy) : null;
  const autoPocket = guide && guide.hit === 8 ? guide.pocket : null;
  const pocket = called ?? autoPocket;
  const stage = stageOf(s as BilliardsState);

  const shoot = (pw: number) => {
    if (!interactive || pw < 0.02) return;
    if (calling && pocket === null) return;
    unlockAudio();
    lastPower.current = pw;
    vibrate(preferences.haptics, 18);
    const inHandCue = s.ballInHand && place ? { cueX: place.x, cueY: place.y } : {};
    p.onShoot({ dx: aim.dx, dy: aim.dy, power: pw, spinX: spin.x, spinY: spin.y, ...inHandCue, ...(calling ? { pocket: pocket! } : {}) });
    setPower(0);
  };

  const nudge = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    setAim((v) => ({ dx: v.dx * Math.cos(a) - v.dy * Math.sin(a), dy: v.dx * Math.sin(a) + v.dy * Math.cos(a) }));
  };

  // Keyboard: arrows fine-aim, space shoots with the last power.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!interactive || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'ArrowLeft') nudge(e.shiftKey ? -2 : -0.25);
      else if (e.key === 'ArrowRight') nudge(e.shiftKey ? 2 : 0.25);
      else if (e.key === ' ') {
        e.preventDefault();
        shoot(lastPower.current);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onEvent = (e: PhysicsEvent) => {
    if (e.type === 'cue') poolSounds.cue(e.speed / 900);
    else if (e.type === 'ball') poolSounds.ball(e.speed);
    else if (e.type === 'cushion') poolSounds.rail(e.speed);
    else poolSounds.pocket();
  };

  const status = (() => {
    if (s.phase === 'over') return t('billiards.status.over');
    if (!myTurn) return p.thinking ? t('billiards.status.botThinking', { name: s.players[s.turn].name }) : t('billiards.status.theirTurn', { name: s.players[s.turn].name });
    if (stage === 'BREAK') return t('billiards.status.break');
    if (s.ballInHand) return t('billiards.status.ballInHand');
    if (calling) return pocket === null ? t('billiards.status.callPocket') : t('billiards.status.eight');
    if (stage === 'OPEN_TABLE') return t('billiards.status.open');
    return t('billiards.status.yourTurn');
  })();

  return (
    <div className="bl screen-in">
      <header className="bl-top">
        <button type="button" className="bl-icon" onClick={p.onBack} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="bl-brand">CARTA CASINO</span>
        {p.onMenu ? (
          <button type="button" className="bl-icon" onClick={p.onMenu} aria-label={t('billiards.menu')}>
            <Menu className="w-5 h-5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
      </header>

      <div className="bl-players">
        <PlayerCard state={s} seat={0} me={p.me} away={p.away?.includes(0)} deadline={s.turn === 0 ? p.deadline : null} />
        <span className="bl-vs" aria-hidden>
          VS
        </span>
        <PlayerCard state={s} seat={1} me={p.me} away={p.away?.includes(1)} deadline={s.turn === 1 ? p.deadline : null} />
      </div>

      <p className={`bl-status ${myTurn && s.phase !== 'over' ? 'is-mine' : ''}`} role="status" aria-live="polite">
        {status}
      </p>

      <div className="bl-stage">
        <PowerBar value={power} enabled={interactive && (!calling || pocket !== null)} onChange={setPower} onRelease={shoot} label={t('billiards.power')} haptics={preferences.haptics} />
        <div className="bl-table-wrap">
          <PoolTable
            balls={balls}
            interactive={interactive}
            aim={aim}
            onAim={(dx, dy) => setAim({ dx, dy })}
            power={power}
            inHand={s.ballInHand}
            kitchen={s.phase === 'break'}
            canPlace={(x, y) => canPlaceCue(s as BilliardsState, x, y)}
            onPlace={(x, y) => setPlace({ x, y })}
            calling={calling}
            called={pocket}
            onCall={(i) => setCalled(i)}
            targets={targets}
            replay={p.replay}
            onReplayEvent={onEvent}
            onReplayDone={p.onReplayDone}
            label={t('billiards.tableAria')}
          />
          {p.toast && (
            <div className="bl-toast" role="alert">
              {p.toast}
            </div>
          )}
        </div>
      </div>

      <div className="bl-controls">
        <button type="button" className="bl-spin-btn" onClick={() => setSpinOpen((o) => !o)} aria-expanded={spinOpen} aria-label={t('billiards.spin')} disabled={!interactive}>
          <span className="bl-spin-ball">
            <i style={{ left: `${50 + spin.x * 34}%`, top: `${50 - spin.y * 34}%` }} />
          </span>
        </button>
        <button type="button" className="bl-icon" onClick={() => nudge(-0.25)} disabled={!interactive} aria-label={t('billiards.aimLeft')}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button type="button" className="bl-icon" onClick={() => nudge(0.25)} disabled={!interactive} aria-label={t('billiards.aimRight')}>
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="bl-hint">
          {s.ballInHand && myTurn ? (
            <>
              <Hand className="w-4 h-4" aria-hidden /> {t('billiards.hint.place')}
            </>
          ) : calling ? (
            <>
              <Target className="w-4 h-4" aria-hidden /> {t('billiards.hint.call')}
            </>
          ) : (
            <>
              <Crosshair className="w-4 h-4" aria-hidden /> {t('billiards.hint.aim')}
            </>
          )}
        </div>
        <button type="button" className="hm-gold-btn is-sm bl-shoot" onClick={() => shoot(lastPower.current)} disabled={!interactive || (calling && pocket === null)}>
          {t('billiards.shoot')}
        </button>
      </div>

      {spinOpen && (
        <div className="bl-spin-pop" role="dialog" aria-label={t('billiards.spin')}>
          <p className="bl-spin-title">{t('billiards.spin')}</p>
          <SpinPad value={spin} onChange={setSpin} />
          <div className="bl-spin-actions">
            <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => setSpin({ x: 0, y: 0 })}>
              {t('billiards.spinReset')}
            </button>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-sm" onClick={() => setSpinOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
      {p.children}
    </div>
  );
}

function PlayerCard({ state, seat, me, away, deadline }: { state: PublicState; seat: 0 | 1; me: 0 | 1; away?: boolean; deadline?: number | null }) {
  const { t } = useI18n();
  const pl = state.players[seat];
  const active = state.turn === seat && state.phase !== 'over';
  const group = pl.group;
  const ids = group ? (group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]) : [];
  const up = (id: number) => state.balls.some((b) => b.id === id && !b.down);
  const left = group ? state.balls.filter((b) => !b.down && inGroup(b.id, group)).length : 7;
  return (
    <div className={`bl-player ${active ? 'is-active' : ''} ${seat === 1 ? 'is-right' : ''}`}>
      <span className="bl-avatar" aria-hidden>
        {pl.kind === 'bot' ? <Bot className="w-5 h-5" /> : pl.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="bl-player-body">
        <span className="bl-name">
          {pl.name}
          {seat === me && pl.kind === 'human' ? <small> · {t('games.you')}</small> : null}
          {away && <WifiOff className="w-3.5 h-3.5 inline ml-1 text-[#ff9a9a]" aria-label={t('billiards.away')} />}
        </span>
        <span className="bl-group">{group ? t(`billiards.group.${group}`) : t('billiards.group.none')}</span>
        <span className="bl-mini" aria-label={t('billiards.left', { n: left })}>
          {(ids.length ? ids : [0, 0, 0, 0, 0, 0, 0]).map((id, i) => (
            <i key={i} className={id && !up(id) ? 'is-down' : ''} style={id ? { background: id >= 9 ? `linear-gradient(180deg, #f4efe2 28%, ${ballColor(id)} 28% 72%, #f4efe2 72%)` : ballColor(id) } : undefined} />
          ))}
        </span>
        {deadline ? <ShotClock deadline={deadline} /> : null}
      </div>
    </div>
  );
}

function ShotClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now);
  const frac = Math.min(1, left / 60000);
  return (
    <span className={`bl-clock ${left < 10000 ? 'is-low' : ''}`} aria-label={`${Math.ceil(left / 1000)} s`}>
      <i style={{ width: `${frac * 100}%` }} />
    </span>
  );
}

/** Vertical power bar: press, pull down, let go to shoot. Works with touch and mouse. */
function PowerBar({ value, enabled, onChange, onRelease, label, haptics }: { value: number; enabled: boolean; onChange: (v: number) => void; onRelease: (v: number) => void; label: string; haptics: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const live = useRef(0);
  const dragging = useRef(false);
  const lastTick = useRef(0);
  const at = (e: React.PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  };
  return (
    <div
      ref={track}
      className={`bl-power ${enabled ? '' : 'is-off'}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-disabled={!enabled}
      tabIndex={enabled ? 0 : -1}
      onPointerDown={(e) => {
        if (!enabled) return;
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        live.current = at(e);
        onChange(live.current);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        live.current = at(e);
        onChange(live.current);
        const tick = Math.floor(live.current * 10);
        if (tick !== lastTick.current) {
          lastTick.current = tick;
          vibrate(haptics, 6);
        }
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onRelease(live.current);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onChange(0);
      }}
    >
      <span className="bl-power-label">POWER</span>
      <span className="bl-power-fill" style={{ height: `${value * 100}%` }} />
      <span className="bl-power-cue" style={{ top: `${value * 100}%` }} />
      <span className="bl-power-pct">{Math.round(value * 100)}</span>
    </div>
  );
}

/** Where to strike the cue ball: up = follow, down = draw, left / right = side spin. */
function SpinPad({ value, onChange }: { value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1;
    let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const d = Math.hypot(x, y);
    if (d > 0.85) {
      x = (x / d) * 0.85;
      y = (y / d) * 0.85;
    }
    onChange({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  };
  return (
    <div
      ref={ref}
      className="bl-spin-pad"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <i style={{ left: `${50 + value.x * 50}%`, top: `${50 - value.y * 50}%` }} />
    </div>
  );
}

/** Victory / defeat panel. */
export function EndPanel({ win, title, winner, reason, players, actions }: { win: boolean; title: string; winner: string; reason: string; players?: ReactNode; actions: ReactNode }) {
  return (
    <div className="bl-end" role="dialog" aria-modal="true" aria-labelledby="bl-end-title">
      <div className={`bl-end-card ${win ? 'is-win' : 'is-loss'}`}>
        {win && (
          <span className="bl-confetti" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.15}s` }} />
            ))}
          </span>
        )}
        <span className="bl-end-icon" aria-hidden>
          {win ? '🏆' : '🎱'}
        </span>
        <h2 id="bl-end-title" className="bl-end-title">
          {title}
        </h2>
        <p className="bl-end-winner">{winner}</p>
        <p className="bl-end-reason">{reason}</p>
        {players}
        <div className="bl-end-actions">{actions}</div>
      </div>
    </div>
  );
}

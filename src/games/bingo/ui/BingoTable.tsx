import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleHelp, Grid3x3, LogOut, Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { MusicButton } from '@/components/ui/MusicButton';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useFeedback } from '@/games/shared/feedback';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { GameSceneBackground } from '@/games/shared/scenes/GameScenes';
import { FxLayer } from '@/games/shared/FxLayer';
import type { BingoScene } from '@/games/shared/setup';
import { CENTER, completedLines, letterOf, nearLines } from '../engine';
import type { BingoAction, BingoEvent, BingoView } from '../engine';
import { Ball, Cage, MasterBoard } from './BingoParts';
import { callBall, stopCaller } from './bingoCaller';
import './bingo.css';
import '@/games/shared/fonts.css';

const SEAT_COLORS = ['#d9265f', '#2f86e8', '#2fb36a', '#f59f1c'];
const CONFETTI = ['#e8414f', '#f59f1c', '#2fb36a', '#2f86e8', '#8c52e0', '#ffffff'];

/** Everything the bingo hall needs, whoever runs the round: this device or the online room server. */
export interface BingoSession {
  view: BingoView;
  events: BingoEvent[];
  version: number;
  /** Proposes an action for your seat; resolves with the refusal reason if refused. */
  act: (action: BingoAction) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>;
  scene: BingoScene;
  autoMark: boolean;
  /** Pause control (local only); null hides it. */
  paused: boolean | null;
  onPause?: (paused: boolean) => void;
  /** Local balls and bots wait while a sheet is open. */
  onSheet?: (open: boolean) => void;
  onRematch: (() => void) | null;
  onExit: () => void;
  onBack: () => void;
  banner?: ReactNode;
}

export function BingoTable({ session }: { session: BingoSession }) {
  const { view, events, version, act, scene } = session;
  const me = view.me;
  const { t, language } = useI18n();
  const { preferences } = usePreferences();
  const reduced = useReducedMotion();
  const animate = preferences.animations && !reduced;
  const fire = useFeedback('bingo');
  useGameMusic('bingo');

  const [sheet, setSheetState] = useState<'rules' | 'board' | 'result' | null>(null);
  const setSheet = (next: 'rules' | 'board' | 'result' | null) => {
    setSheetState(next);
    session.onSheet?.(next === 'rules' || next === 'result');
  };
  const paused = session.paused ?? false;
  const halted = paused || sheet === 'rules' || sheet === 'result';
  const last = view.called[view.called.length - 1];

  // ---------- your card ----------
  const [fresh, setFresh] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const mark = useCallback(
    (n: number) => {
      void Promise.resolve(act({ type: 'MARK_NUMBER', playerId: me, number: n })).then((r) => {
        if (r.ok) return;
        setShake(n);
        setNote(r.error === 'not_called' ? t('bingo.notCalled', { ball: `${letterOf(n)}-${n}` }) : null);
        fire('invalid');
      });
    },
    [act, me, t, fire]
  );
  useEffect(() => {
    if (!session.autoMark || view.toMark.length === 0 || halted) return;
    const id = window.setTimeout(() => mark(view.toMark[view.toMark.length - 1]), 380);
    return () => window.clearTimeout(id);
  }, [session.autoMark, view.toMark, halted, mark]);
  useEffect(() => {
    if (shake === null) return;
    const id = window.setTimeout(() => setShake(null), 380);
    return () => window.clearTimeout(id);
  }, [shake]);

  const claim = () => {
    void Promise.resolve(act({ type: 'CLAIM', playerId: me })).then((r) => {
      if (r.ok) return;
      setNote(r.error === 'claim_blocked' ? t('bingo.blocked', { n: view.claimBlockedUntil - view.called.length }) : null);
      fire('invalid');
    });
  };

  // ---------- events ----------
  const speak = useCallback(
    (n: number) => {
      if (!preferences.sound) return;
      callBall(n, `${letterOf(n)}, ${n}`, language === 'es' ? 'es' : 'en', Math.min(1, preferences.sfxVolume + 0.15));
    },
    [preferences.sound, preferences.sfxVolume, language]
  );
  // The call waits for the ball to land; leaving the hall cancels a pending call and silences the voice.
  const callTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(callTimer.current);
      stopCaller();
    },
    []
  );
  const near = nearLines(view.marks).length;
  const prevNear = useRef(0);
  useEffect(() => {
    for (const e of events) {
      if (e.type === 'called') {
        fire('ballDrop');
        fire('numberCalled', { delay: 0.45 });
        window.clearTimeout(callTimer.current);
        callTimer.current = window.setTimeout(() => speak(e.number), 650);
        setNote(null);
      } else if (e.type === 'marked' && e.playerId === me) {
        fire('mark');
        setFresh(e.number);
      } else if (e.type === 'claimed') {
        if (e.valid) {
          fire('claim');
          setBanner((b) => b + 1);
        } else if (e.playerId === me) {
          setNote(t('bingo.falseClaim'));
          fire('invalid');
        }
      } else if (e.type === 'round_over') {
        const won = e.result.winners.includes(me);
        window.setTimeout(() => fire(won ? 'gameWon' : e.result.winners.length ? 'roundLost' : 'turn'), 300);
        window.setTimeout(() => setSheet('result'), animate ? 900 : 200);
      } else if (e.type === 'dealt') {
        fire('deal');
      }
    }
    if (near > prevNear.current) fire('nearWin');
    prevNear.current = near;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts once per applied action
  }, [version]);

  const nextRound = () => {
    setSheet(null);
    void act({ type: 'NEXT_ROUND', playerId: me });
  };
  const newMatch = session.onRematch
    ? () => {
        setSheet(null);
        session.onRematch?.();
      }
    : null;
  // A result left open when the next round starts (online, started by someone else) closes by itself.
  useEffect(() => {
    if (view.status !== 'round_over') setSheetState((x) => (x === 'result' ? null : x));
  }, [view.status]);

  const lineCells = useMemo(() => new Set(completedLines(view.marks).flat()), [view.marks]);
  const toMark = new Set(view.toMark);
  const blocked = view.called.length < view.claimBlockedUntil;
  const rack = view.called.slice(-5, -1).reverse();
  let status = note;
  if (!status) {
    if (view.status === 'closing') status = t('bingo.closing');
    else if (view.canClaim) status = t('bingo.shout');
    else if (near > 0) status = t('bingo.almost');
    else if (!view.called.length) status = t('bingo.getReady');
    else if (view.toMark.length) status = t('bingo.youHave', { n: view.toMark.length });
    else status = t('bingo.listen');
  }

  return (
    <div className="bg">
      <GameSceneBackground scene={scene} />
      <FxLayer kind="confetti" colors={CONFETTI} />
      <header className="bg-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={session.onBack} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="bg-title">
          <strong>{t('hub.bingo.name')}</strong>
          <span>{t('bingo.roundBall', { round: view.round, n: view.called.length })}</span>
        </div>
        {session.paused !== null && (
          <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => session.onPause?.(!paused)} aria-label={paused ? t('bingo.resume') : t('bingo.pause')} aria-pressed={paused}>
            {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>
        )}
        <MusicButton className="!hidden min-[380px]:!flex !w-11 !h-11 !rounded-xl" />
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setSheet('rules')} aria-label={t('bingo.rulesTitle')}>
          <CircleHelp className="w-5 h-5" />
        </button>
      </header>
      {session.banner}

      <main className="bg-main">
        <div className="bg-layout">
          <div className="flex flex-col gap-2.5">
            <section className="bg-stage" aria-label={t('bingo.caller')}>
              <Cage rolling={animate && view.status === 'playing' && !halted} />
              <div className="min-w-0">
                <div className="bg-now" aria-live="polite">
                  {last ? <Ball key={last} n={last} className={animate ? 'is-in' : ''} label={`${letterOf(last)}-${last}`} /> : <span className="bb bg-col-2" style={{ opacity: 0.35 }} aria-hidden />}
                  <div className="bg-now-text">
                    <small>{paused ? t('bingo.paused') : t('bingo.lastBall')}</small>
                    <strong>{last ? `${letterOf(last)}-${last}` : '—'}</strong>
                  </div>
                </div>
                <div className="bg-rack" aria-label={t('bingo.previous')}>
                  {rack.map((n) => (
                    <Ball key={n} n={n} />
                  ))}
                  <button type="button" className="ml-auto cz-btn cz-btn-secondary cz-btn-sm !min-h-[32px] !px-2.5" onClick={() => setSheet('board')} aria-label={t('bingo.boardTitle')}>
                    <Grid3x3 className="w-4 h-4" /> <span className="hidden min-[400px]:inline">{t('bingo.board')}</span>
                  </button>
                </div>
              </div>
            </section>

            <div className="bg-seats" role="list" aria-label={t('bingo.players')}>
              {view.seats.map((s, i) => (
                <div key={s.id} role="listitem" className={`bg-seat ${s.id === me ? 'is-me' : ''} ${s.won ? 'is-won' : ''}`} aria-label={t('bingo.seatAria', { name: s.name, daubs: s.daubs, score: s.score })}>
                  <span className="bg-avatar" style={{ '--c': SEAT_COLORS[i] } as React.CSSProperties}>
                    {s.won ? <Trophy className="w-3.5 h-3.5" /> : s.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <b>{s.name}</b>
                    <small aria-hidden>
                      <i className="bg-dot" /> {s.daubs} · {t('bingo.pts', { n: s.score })}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mt-2.5 min-[900px]:mt-0">
            <div className="bg-cardwrap">
              <div className="bg-card" role="grid" aria-label={t('bingo.yourCard')}>
                <div className="bg-grid" role="row">
                  {'BINGO'.split('').map((l, c) => (
                    <span key={l} role="columnheader" className={`bg-head bg-col-${c}`}>
                      {l}
                    </span>
                  ))}
                </div>
                <div className="bg-grid mt-1.5" role="presentation">
                  {view.card.map((n, i) => {
                    const col = i % 5;
                    const marked = view.marks[i];
                    const r = (daubAngle(n, i) % 50) - 25;
                    if (i === CENTER)
                      return (
                        <span key={i} role="gridcell" aria-label={t('bingo.free')} className={`bg-cell bg-col-2 ${lineCells.has(i) ? 'is-line' : ''}`}>
                          <span className="bg-free">{t('bingo.freeShort')}</span>
                          <span className="bg-daub" style={{ '--r': '12deg' } as React.CSSProperties} />
                        </span>
                      );
                    return (
                      <button
                        key={i}
                        type="button"
                        role="gridcell"
                        className={`bg-cell bg-col-${col} ${toMark.has(n) && !session.autoMark ? 'is-hint' : ''} ${shake === n ? 'is-shake' : ''} ${lineCells.has(i) ? 'is-line' : ''}`}
                        aria-label={`${letterOf(n)}-${n}${marked ? `, ${t('bingo.marked')}` : ''}`}
                        aria-pressed={marked}
                        disabled={view.status === 'round_over'}
                        onClick={() => (marked ? undefined : mark(n))}
                      >
                        {n}
                        {marked && <span className={`bg-daub ${fresh === n && animate ? 'is-new' : ''}`} style={{ '--r': `${r}deg` } as React.CSSProperties} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className={`bg-status ${view.canClaim || near > 0 ? 'is-hot' : ''}`} role="status" aria-live="polite">
              {status}
            </p>
            <div className="bg-actions">
              <button type="button" className={`bg-claim ${view.canClaim ? 'is-ready' : ''}`} onClick={claim} disabled={view.status === 'round_over' || view.winners.includes(me) || blocked}>
                {t('bingo.claim')}
                {blocked && <small>{t('bingo.blocked', { n: view.claimBlockedUntil - view.called.length })}</small>}
              </button>
            </div>
          </div>
        </div>
      </main>

      {banner > 0 && animate && <div key={banner} className="bg-banner" aria-hidden>{t('bingo.claim')}</div>}

      {sheet === 'board' && (
        <Sheet title={t('bingo.boardTitle')} onClose={() => setSheet(null)}>
          <MasterBoard called={view.called} label={t('bingo.boardTitle')} />
          <p className="mt-3 text-xs text-white/60">{t('bingo.boardHint', { n: view.called.length })}</p>
        </Sheet>
      )}
      {sheet === 'rules' && (
        <Sheet title={t('bingo.rulesTitle')} onClose={() => setSheet(null)}>
          <div className="dm-rules">
            <p>{t('bingo.rules.intro')}</p>
            {(['card', 'play', 'win', 'score'] as const).map((k) => (
              <section key={k}>
                <h3>{t(`bingo.rules.${k}Title`)}</h3>
                <ul>
                  {t(`bingo.rules.${k}`)
                    .split('\n')
                    .map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'result' && view.lastResult && (
        <Sheet title={t('bingo.roundN', { n: view.lastResult.round })} onClose={nextRound}>
          <div className="text-center">
            <p className="font-display font-extrabold text-2xl text-white">
              {view.lastResult.winners.length === 0
                ? t('bingo.nobody')
                : view.lastResult.winners.includes(me)
                  ? view.lastResult.winners.length > 1
                    ? t('bingo.youShare')
                    : t('bingo.youWin')
                  : t('bingo.winnerIs', { name: view.lastResult.winners.map((w) => view.seats.find((p) => p.id === w)!.name).join(' · ') })}
            </p>
            {view.lastResult.winners.length > 0 && <p className="mt-1 text-sm text-white/70">{t('bingo.resultLine', { n: view.lastResult.atCall, points: view.lastResult.pointsEach })}</p>}
          </div>
          <ul className="mt-5 flex flex-col gap-2">
            {[...view.seats]
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <li key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${view.lastResult!.winners.includes(p.id) ? 'border-[#ffd166]/70 bg-[#ffd166]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  {view.lastResult!.winners.includes(p.id) && <Trophy className="w-4 h-4 text-[#ffd166]" aria-hidden />}
                  <span className="font-bold text-white truncate">{p.name}</span>
                  <span className="ml-auto font-extrabold text-white cz-num">{p.score}</span>
                </li>
              ))}
          </ul>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1" onClick={nextRound}>
              <Play className="w-5 h-5" /> {t('bingo.nextRound')}
            </button>
            {newMatch && (
              <button type="button" className="cz-btn cz-btn-secondary cz-btn-lg flex-1" onClick={newMatch}>
                <RotateCcw className="w-5 h-5" /> {t('games.rematch')}
              </button>
            )}
            <button type="button" className="cz-btn cz-btn-quiet cz-btn-lg" onClick={session.onExit}>
              <LogOut className="w-5 h-5" /> {t('games.exit')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Stable pseudo-random angle for a daub, from the number and its cell. */
function daubAngle(n: number, i: number) {
  return ((n * 2654435761) ^ (i * 40503)) >>> 0;
}

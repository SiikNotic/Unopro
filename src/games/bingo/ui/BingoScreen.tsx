import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Grid3x3, LogOut, Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { MusicButton } from '@/components/ui/MusicButton';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { newMatchSeed } from '@/games/shared/rng';
import { useLocalMatch } from '@/games/shared/useLocalMatch';
import { useFeedback } from '@/games/shared/feedback';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { GameSceneBackground } from '@/games/shared/scenes/GameScenes';
import { FxLayer } from '@/games/shared/FxLayer';
import { BINGO_SCENES, loadBingoSetup, pickScene } from '@/games/shared/setup';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import { bingoRules, CENTER, completedLines, createBingo, letterOf, nearLines } from '../engine';
import type { BingoAction, BingoState, BingoView } from '../engine';
import { bingoBotDriver } from '../bots/bingoBot';
import { Ball, Cage, MasterBoard } from './BingoParts';
import './bingo.css';
import '@/games/shared/fonts.css';

/** Seconds between balls, per speed. */
const PACE_MS = { slow: 5200, normal: 3800, fast: 2600 } as const;
/** After the first valid BINGO, others have this long to shout theirs before the round closes. */
const CLAIM_WINDOW_MS = 1600;
const SEAT_COLORS = ['#d9265f', '#2f86e8', '#2fb36a', '#f59f1c'];

export function BingoScreen() {
  const { t, language } = useI18n();
  const { back, navigate } = useNavigation();
  const { preferences } = usePreferences();
  const reduced = useReducedMotion();
  const animate = preferences.animations && !reduced;
  const fire = useFeedback('bingo');
  useGameMusic('bingo');

  const setup = useMemo(() => loadBingoSetup(), []);
  const scene = useMemo(() => pickScene(setup.scene, BINGO_SCENES, 'games.bingo.lastScene'), [setup.scene]);
  const seats = useMemo(
    () => Array.from({ length: setup.players }, (_, i) => (i === 0 ? { id: 'you', name: t('games.you'), kind: 'human' as const } : { id: `s${i}`, name: t('games.bot', { n: i }), kind: 'bot' as const })),
    [setup.players, t]
  );
  const matchSeed = useRef(newMatchSeed());
  const drivers = useMemo(() => {
    const out: Record<string, SeatDriver<BingoView, BingoAction>> = {};
    seats.forEach((s, i) => {
      if (s.kind === 'bot') out[s.id] = bingoBotDriver(setup.difficulty, matchSeed.current + i);
    });
    return out;
  }, [seats, setup.difficulty]);

  const [sheet, setSheet] = useState<'rules' | 'board' | 'result' | null>(null);
  const [paused, setPaused] = useState(false);
  const halted = paused || sheet === 'rules' || sheet === 'result';
  const actorsOf = useCallback((s: BingoState) => (s.status === 'round_over' ? [] : s.players.map((p) => p.id)), []);
  const match = useLocalMatch(bingoRules, () => createBingo({ seats, seed: matchSeed.current }), drivers, { paused: halted, actorsOf });
  const state = match.state;
  const view = match.view('you');
  const last = view.called[view.called.length - 1];

  // ---------- the house: calls balls at the chosen pace, closes the claim window ----------
  useEffect(() => {
    if (halted) return;
    let id = 0;
    if (state.status === 'closing') id = window.setTimeout(() => match.house({ type: 'CLOSE_ROUND' }), CLAIM_WINDOW_MS);
    else if (state.status === 'playing' && state.called.length < 75) id = window.setTimeout(() => match.house({ type: 'CALL_NUMBER' }), state.called.length === 0 ? 1200 : PACE_MS[setup.speed]);
    else if (state.status === 'playing') id = window.setTimeout(() => match.house({ type: 'CLOSE_ROUND' }), 10000);
    return () => window.clearTimeout(id);
  }, [state.status, state.called.length, halted, setup.speed, match]);

  // ---------- your card ----------
  const [fresh, setFresh] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const mark = useCallback(
    (n: number) => {
      const r = match.act('you', { type: 'MARK_NUMBER', playerId: 'you', number: n });
      if (!r.ok) {
        setShake(n);
        setNote(r.error === 'not_called' ? t('bingo.notCalled', { ball: `${letterOf(n)}-${n}` }) : null);
        fire('invalid');
      }
    },
    [match, t, fire]
  );
  useEffect(() => {
    if (!setup.autoMark || view.toMark.length === 0 || halted) return;
    const id = window.setTimeout(() => mark(view.toMark[view.toMark.length - 1]), 380);
    return () => window.clearTimeout(id);
  }, [setup.autoMark, view.toMark, halted, mark]);
  useEffect(() => {
    if (shake === null) return;
    const id = window.setTimeout(() => setShake(null), 380);
    return () => window.clearTimeout(id);
  }, [shake]);

  const claim = () => {
    const r = match.act('you', { type: 'CLAIM', playerId: 'you' });
    if (!r.ok) {
      setNote(r.error === 'claim_blocked' ? t('bingo.blocked', { n: view.claimBlockedUntil - view.called.length }) : null);
      fire('invalid');
    }
  };

  // ---------- events ----------
  const speak = useCallback(
    (n: number) => {
      if (!preferences.sound || typeof speechSynthesis === 'undefined') return;
      try {
        const u = new SpeechSynthesisUtterance(`${letterOf(n)}, ${n}`);
        u.lang = language === 'es' ? 'es-ES' : 'en-US';
        u.rate = 1.05;
        u.volume = Math.min(1, preferences.sfxVolume + 0.1);
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {
        /* voices are optional */
      }
    },
    [preferences.sound, preferences.sfxVolume, language]
  );
  useEffect(
    () => () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    },
    []
  );
  const near = nearLines(view.marks).length;
  const prevNear = useRef(0);
  useEffect(() => {
    for (const e of match.events) {
      if (e.type === 'called') {
        fire('ballDrop');
        fire('numberCalled', { delay: 0.45 });
        window.setTimeout(() => speak(e.number), 650);
        setNote(null);
      } else if (e.type === 'marked' && e.playerId === 'you') {
        fire('mark');
        setFresh(e.number);
      } else if (e.type === 'claimed') {
        if (e.valid) {
          fire('claim');
          setBanner((b) => b + 1);
        } else if (e.playerId === 'you') {
          setNote(t('bingo.falseClaim'));
          fire('invalid');
        }
      } else if (e.type === 'round_over') {
        const won = e.result.winners.includes('you');
        window.setTimeout(() => fire(won ? 'gameWon' : e.result.winners.length ? 'roundLost' : 'turn'), 300);
        window.setTimeout(() => setSheet('result'), animate ? 900 : 200);
      } else if (e.type === 'dealt') {
        fire('deal');
      }
    }
    if (near > prevNear.current) fire('nearWin');
    prevNear.current = near;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts once per applied action
  }, [match.version]);

  const nextRound = () => {
    setSheet(null);
    match.act('you', { type: 'NEXT_ROUND', playerId: 'you' });
  };
  const newMatch = () => {
    setSheet(null);
    matchSeed.current = newMatchSeed();
    match.reset(createBingo({ seats, seed: matchSeed.current }));
  };

  const lineCells = useMemo(() => new Set(completedLines(view.marks).flat()), [view.marks]);
  const toMark = new Set(view.toMark);
  const blocked = view.called.length < view.claimBlockedUntil;
  const rack = view.called.slice(-5, -1).reverse();
  let status = note;
  if (!status) {
    if (state.status === 'closing') status = t('bingo.closing');
    else if (view.canClaim) status = t('bingo.shout');
    else if (near > 0) status = t('bingo.almost');
    else if (!view.called.length) status = t('bingo.getReady');
    else if (view.toMark.length) status = t('bingo.youHave', { n: view.toMark.length });
    else status = t('bingo.listen');
  }

  return (
    <div className="bg">
      <GameSceneBackground scene={scene} />
      <FxLayer kind="confetti" colors={['#e8414f', '#f59f1c', '#2fb36a', '#2f86e8', '#8c52e0', '#ffffff']} />
      <header className="bg-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back('bingoSetup')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="bg-title">
          <strong>{t('hub.bingo.name')}</strong>
          <span>{t('bingo.roundBall', { round: state.round, n: view.called.length })}</span>
        </div>
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? t('bingo.resume') : t('bingo.pause')} aria-pressed={paused}>
          {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>
        <MusicButton className="!hidden min-[380px]:!flex !w-11 !h-11 !rounded-xl" />
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setSheet('rules')} aria-label={t('bingo.rulesTitle')}>
          <CircleHelp className="w-5 h-5" />
        </button>
      </header>

      <main className="bg-main">
        <div className="bg-layout">
          <div className="flex flex-col gap-2.5">
            <section className="bg-stage" aria-label={t('bingo.caller')}>
              <Cage rolling={animate && state.status === 'playing' && !halted} />
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
                <div key={s.id} role="listitem" className={`bg-seat ${s.id === 'you' ? 'is-me' : ''} ${s.won ? 'is-won' : ''}`} aria-label={t('bingo.seatAria', { name: s.name, daubs: s.daubs, score: s.score })}>
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
                        className={`bg-cell bg-col-${col} ${toMark.has(n) && !setup.autoMark ? 'is-hint' : ''} ${shake === n ? 'is-shake' : ''} ${lineCells.has(i) ? 'is-line' : ''}`}
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
              <button type="button" className={`bg-claim ${view.canClaim ? 'is-ready' : ''}`} onClick={claim} disabled={view.status === 'round_over' || view.winners.includes('you') || blocked}>
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
      {sheet === 'result' && state.lastResult && (
        <Sheet title={t('bingo.roundN', { n: state.lastResult.round })} onClose={nextRound}>
          <div className="text-center">
            <p className="font-display font-extrabold text-2xl text-white">
              {state.lastResult.winners.length === 0
                ? t('bingo.nobody')
                : state.lastResult.winners.includes('you')
                  ? state.lastResult.winners.length > 1
                    ? t('bingo.youShare')
                    : t('bingo.youWin')
                  : t('bingo.winnerIs', { name: state.lastResult.winners.map((w) => state.players.find((p) => p.id === w)!.name).join(' · ') })}
            </p>
            {state.lastResult.winners.length > 0 && <p className="mt-1 text-sm text-white/70">{t('bingo.resultLine', { n: state.lastResult.atCall, points: state.lastResult.pointsEach })}</p>}
          </div>
          <ul className="mt-5 flex flex-col gap-2">
            {[...state.players]
              .sort((a, b) => state.scores[b.id] - state.scores[a.id])
              .map((p) => (
                <li key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border ${state.lastResult!.winners.includes(p.id) ? 'border-[#ffd166]/70 bg-[#ffd166]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  {state.lastResult!.winners.includes(p.id) && <Trophy className="w-4 h-4 text-[#ffd166]" aria-hidden />}
                  <span className="font-bold text-white truncate">{p.name}</span>
                  <span className="ml-auto font-extrabold text-white cz-num">{state.scores[p.id]}</span>
                </li>
              ))}
          </ul>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1" onClick={nextRound}>
              <Play className="w-5 h-5" /> {t('bingo.nextRound')}
            </button>
            <button type="button" className="cz-btn cz-btn-secondary cz-btn-lg flex-1" onClick={newMatch}>
              <RotateCcw className="w-5 h-5" /> {t('games.rematch')}
            </button>
            <button type="button" className="cz-btn cz-btn-quiet cz-btn-lg" onClick={() => navigate('bingoSetup', {}, { replace: true })}>
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

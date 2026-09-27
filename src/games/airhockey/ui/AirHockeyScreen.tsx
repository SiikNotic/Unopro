// AIR HOCKEY CASINO: 1 vs 1 against the AI on a lit casino table, first to 7 goals.
//
// For coins (registered players): the entry is one of the room stakes; the server takes it, draws the match seed
// and, at the end, replays the match from the player's input log to decide the result and pay the pot (see
// replay.ts and the air_hockey migration). The browser only plays; it never tells the server who won. A free
// practice match (entry 0) is played locally and books nothing. Account coins only: no local chips here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Coins, HelpCircle, Loader2, Minus, Plus, RotateCcw, Settings2, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { usePreferences } from '@/settings/usePreferences';
import { DIFFICULTY_OPTIONS } from '@/settings/preferences';
import { formatChips } from '@/casino/chipValues';
import { unlockAudio } from '@/audio/sfx';
import { storage } from '@/storage';
import { OutOfService } from '@/games/OutOfService';
import { useFreshAvailability } from '@/games/availability';
import { newMatchSeed } from '@/games/shared/rng';
import { HockeyController } from '../controller';
import type { MatchEvent, MatchState, Outcome } from '../engine';
import { WIN_SCORE } from '../engine';
import type { AiLevel } from '../ai';
import { AH_ENTRY_OPTIONS, DEFAULT_ENTRY } from '../rules';
import { finishMatch, startMatch } from '../api';
import { hockeySounds } from '../sounds';
import { newRequestId } from '@/casino/premium/service';
import type { CasinoErrorCode } from '@/casino/server/protocol';
import { HockeyTable } from './HockeyTable';
import type { TableFx } from './HockeyTable';
import { PALETTE, sparks } from './draw';
import { H, W } from '../table';
import './airhockey.css';

type Stage = 'setup' | 'starting' | 'playing' | 'settling' | 'result';

interface Result {
  outcome: Outcome | 'forfeit' | 'expired';
  score: { player: number; ai: number } | null;
  entry: number;
  payout: number;
  practice: boolean;
}

/** A finished match whose result hasn't reached the server yet (kept so a reload can still send it). */
interface Pending {
  id: string;
  log: string;
  entry: number;
  at: number;
}
const PENDING_KEY = 'airhockey.pending';
const ENTRY_KEY = 'airhockey.entry';
const PENDING_MAX_MS = 25 * 60 * 1000;

export function AirHockeyScreen() {
  const { t } = useI18n();
  const { navigate, back } = useNavigation();
  const account = useAccount();
  const { preferences, setPreference } = usePreferences();
  const enabled = useFreshAvailability('airhockey');
  const level = preferences.difficulty as AiLevel;
  const signedIn = account.status === 'user';
  const balance = account.coins?.balance ?? null;

  const [entry, setEntry] = useState<number>(() => {
    const saved = storage.get<number>(ENTRY_KEY);
    return AH_ENTRY_OPTIONS.includes(saved as number) ? (saved as number) : DEFAULT_ENTRY;
  });
  const [stage, setStage] = useState<Stage>('setup');
  const [controller, setController] = useState<HockeyController | null>(null);
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const [count, setCount] = useState<number | 'go' | null>(null);
  const [goal, setGoal] = useState<'player' | 'ai' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settleFailed, setSettleFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const fx = useMemo<TableFx>(() => ({ particles: [], flash: null }), []);
  const matchRef = useRef<{ id: string | null; entry: number } | null>(null);
  const timers = useRef<number[]>([]);
  const controllerRef = useRef<HockeyController | null>(null);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  useEffect(() => {
    storage.set(ENTRY_KEY, entry);
  }, [entry]);

  const errorText = (code: CasinoErrorCode | 'offline') =>
    code === 'insufficient_funds'
      ? t('airhockey.errors.funds')
      : code === 'account_required' || code === 'unauthorized'
        ? t('airhockey.errors.account')
        : code === 'game_disabled'
          ? t('availability.text')
          : t('airhockey.errors.server');

  /** Sends a finished match for coins and shows the server's result. */
  const settle = useCallback(
    async (p: Pending) => {
      setStage('settling');
      setSettleFailed(false);
      const r = await finishMatch(p.id, p.log);
      if (!r.ok) {
        // Kept for a retry (also after a reload); the server settles each match once.
        if (r.code === 'server' || r.code === 'rate_limited') return setSettleFailed(true);
        storage.remove(PENDING_KEY);
        setError(errorText(r.code));
        setStage('setup');
        return;
      }
      storage.remove(PENDING_KEY);
      account.setBalance(r.data.balance);
      if (r.data.score) setScore(r.data.score);
      setResult({ outcome: r.data.outcome, score: r.data.score, entry: r.data.stake, payout: r.data.payout, practice: false });
      setStage('result');
      if (r.data.outcome === 'won') hockeySounds.win();
      else if (r.data.outcome === 'lost') hockeySounds.lose();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.setBalance],
  );

  // A match finished but not confirmed before the app closed: send it now.
  useEffect(() => {
    const p = storage.get<Pending>(PENDING_KEY);
    if (!p) return;
    if (!signedIn) return;
    if (Date.now() - p.at > PENDING_MAX_MS) {
      storage.remove(PENDING_KEY);
      return;
    }
    void settle(p);
  }, [signedIn, settle]);

  const onEvents = useCallback(
    (events: MatchEvent[], s: MatchState) => {
      for (const e of events) {
        if (e.type === 'hit') {
          hockeySounds.hit(e.power);
          if (e.power > 0.2) sparks(fx.particles, s.puck.x, s.puck.y, Math.round(4 + e.power * 10), e.by === 'player' ? PALETTE.red : PALETTE.blue, 500 + e.power * 700);
        } else if (e.type === 'wall') hockeySounds.wall(e.power);
        else if (e.type === 'count') {
          setCount(e.n);
          hockeySounds.count();
        } else if (e.type === 'go') {
          setCount('go');
          hockeySounds.count(true);
          later(() => setCount(null), 600);
        } else if (e.type === 'goal') {
          setScore({ ...s.score });
          setGoal(e.scorer);
          fx.flash = { side: e.scorer === 'player' ? 'ai' : 'player', amount: 1 };
          sparks(fx.particles, W / 2, e.scorer === 'player' ? 0 : H, 46, PALETTE.gold, 1300);
          hockeySounds.goal(e.scorer === 'player');
          later(() => setGoal(null), 1300);
        } else if (e.type === 'over') {
          const m = matchRef.current;
          if (!m) continue;
          if (m.id === null) {
            // Practice: nothing to book.
            setResult({ outcome: e.outcome, score: { ...s.score }, entry: 0, payout: 0, practice: true });
            later(() => {
              setStage('result');
              if (e.outcome === 'won') hockeySounds.win();
              else if (e.outcome === 'lost') hockeySounds.lose();
            }, 700);
          } else {
            const ctrl = controllerRef.current;
            if (!ctrl) continue;
            const pending: Pending = { id: m.id, log: ctrl.log.encode(), entry: m.entry, at: Date.now() };
            storage.set(PENDING_KEY, pending);
            later(() => void settle(pending), 700);
          }
        }
      }
    },
    [fx, settle],
  );
  const begin = async () => {
    unlockAudio();
    setError(null);
    setResult(null);
    setScore({ player: 0, ai: 0 });
    let seed: number;
    let id: string | null = null;
    if (entry > 0) {
      if (!signedIn) return navigate('account');
      if (balance !== null && balance < entry) return setError(t('airhockey.errors.funds'));
      setStage('starting');
      const requestId = newRequestId();
      const r = await startMatch(entry, level, requestId);
      if (!r.ok) {
        setStage('setup');
        return setError(errorText(r.code));
      }
      account.setBalance(r.data.balance);
      hockeySounds.chip();
      seed = r.data.seed;
      id = requestId;
    } else {
      seed = newMatchSeed();
    }
    matchRef.current = { id, entry };
    const ctrl = new HockeyController(seed, level, onEvents);
    controllerRef.current = ctrl;
    setController(ctrl);
    setStage('playing');
  };

  const stepEntry = (d: number) => {
    const i = AH_ENTRY_OPTIONS.indexOf(entry);
    const next = AH_ENTRY_OPTIONS[Math.max(0, Math.min(AH_ENTRY_OPTIONS.length - 1, i + d))];
    if (next !== entry) {
      setEntry(next);
      hockeySounds.chip();
    }
  };

  const leave = () => {
    if (stage === 'playing' && controller && !controller.over) return setConfirmLeave(true);
    back('home');
  };

  const again = () => {
    setController(null);
    controllerRef.current = null;
    setStage('setup');
    setResult(null);
    setScore({ player: 0, ai: 0 });
  };

  const inMatch = stage === 'playing' || stage === 'starting' || stage === 'settling';
  // Out of service: no new match (a match being played or confirmed is finished first).
  if (!enabled && !inMatch) return <OutOfService game="airhockey" />;

  const levelName = t(`airhockey.levels.${level}`);
  const win = entry * 2;

  return (
    <div className="ah-page">
      <header className="ah-head">
        <button type="button" className="ah-icon" onClick={leave} aria-label={t('casino.backToGames')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="ah-head-right">
          {signedIn && balance !== null && (
            <span className="ah-coins" aria-label={t('airhockey.balance')}>
              <Coins className="w-4 h-4" aria-hidden /> {formatChips(balance)}
            </span>
          )}
          <button type="button" className="ah-icon" onClick={() => setPreference('sound', !preferences.sound)} aria-label={t('settings.sound')} aria-pressed={preferences.sound}>
            {preferences.sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button type="button" className="ah-icon" onClick={() => setMenu(true)} aria-label={t('airhockey.settings')} disabled={inMatch}>
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <h1 className="ah-title">AIR HOCKEY</h1>

      <section className="ah-board" aria-label={t('airhockey.score')}>
        <p className="ah-board-label">{t('airhockey.score')}</p>
        <div className="ah-board-row" aria-live="polite">
          <span className="ah-side is-player">
            <b>{score.player}</b>
            <small>{t('airhockey.you')}</small>
          </span>
          <span className="ah-vs">vs</span>
          <span className="ah-side is-ai">
            <b>{score.ai}</b>
            <small>{t('airhockey.ai', { level: levelName })}</small>
          </span>
        </div>
      </section>

      <div className="ah-stage">
        <HockeyTable controller={controller} fx={fx} label={t('airhockey.tableLabel')} />

        {count !== null && (
          <div className="ah-count" key={String(count)} aria-live="assertive">
            {count === 'go' ? t('airhockey.go') : count}
          </div>
        )}
        {goal && (
          <div className={`ah-goal ${goal === 'player' ? 'is-player' : 'is-ai'}`} role="status">
            <b>{t('airhockey.goal')}</b>
            <span>{goal === 'player' ? t('airhockey.goalYou') : t('airhockey.goalAi')}</span>
          </div>
        )}

        {(stage === 'setup' || stage === 'starting') && (
          <div className="ah-card ah-setup">
            <p className="ah-card-kicker">{t('airhockey.entry')}</p>
            <div className="ah-entry">
              <button type="button" className="ah-step" onClick={() => stepEntry(-1)} disabled={stage === 'starting' || entry === AH_ENTRY_OPTIONS[0]} aria-label={t('airhockey.less')}>
                <Minus className="w-5 h-5" />
              </button>
              <output className="ah-entry-value" aria-live="polite">
                {entry === 0 ? t('airhockey.practice') : formatChips(entry)}
              </output>
              <button type="button" className="ah-step" onClick={() => stepEntry(1)} disabled={stage === 'starting' || entry === AH_ENTRY_OPTIONS[AH_ENTRY_OPTIONS.length - 1]} aria-label={t('airhockey.more')}>
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <p className="ah-entry-hint">{entry === 0 ? t('airhockey.practiceHint') : t('airhockey.winHint', { coins: formatChips(win) })}</p>
            <button type="button" className="ah-level-link" onClick={() => setMenu(true)} disabled={stage === 'starting'}>
              {t('airhockey.levelLine', { level: levelName })}
            </button>
            {error && (
              <p className="ah-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="ah-play" onClick={() => void begin()} disabled={stage === 'starting'}>
              {stage === 'starting' ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : null}
              {entry > 0 && !signedIn ? t('airhockey.signUpToPlay') : t('airhockey.play')}
            </button>
            <p className="ah-legal">{t('airhockey.legal', { n: WIN_SCORE })}</p>
          </div>
        )}

        {stage === 'settling' && (
          <div className="ah-card ah-settle" role="status">
            {settleFailed ? (
              <>
                <p>{t('airhockey.settleFailed')}</p>
                <button
                  type="button"
                  className="ah-play"
                  onClick={() => {
                    const p = storage.get<Pending>(PENDING_KEY);
                    if (p) void settle(p);
                  }}
                >
                  <RotateCcw className="w-5 h-5" aria-hidden /> {t('airhockey.retry')}
                </button>
              </>
            ) : (
              <>
                <Loader2 className="w-7 h-7 animate-spin text-[var(--cz-gold)]" aria-hidden />
                <p>{t('airhockey.settling')}</p>
              </>
            )}
          </div>
        )}
      </div>

      <p className="ah-foot">
        <span className="is-player">{t('airhockey.player')}</span> vs <span className="is-ai">{t('airhockey.aiShort')}</span>
      </p>

      {stage === 'result' && result && (
        <div className="ah-modal" role="dialog" aria-modal="true" aria-labelledby="ah-result-title">
          <div className={`ah-result is-${result.outcome}`}>
            {result.outcome === 'won' && <Trophy className="ah-trophy" aria-hidden />}
            <h2 id="ah-result-title">{t(`airhockey.result.${result.outcome}.title`)}</h2>
            <p className="ah-result-text">{t(`airhockey.result.${result.outcome}.text`)}</p>
            {result.score && (
              <p className="ah-result-score">
                <span className="is-player">{result.score.player}</span> – <span className="is-ai">{result.score.ai}</span>
              </p>
            )}
            {result.practice ? (
              <p className="ah-result-coins is-muted">{t('airhockey.practiceDone')}</p>
            ) : result.payout > 0 ? (
              <p className="ah-result-coins">+{formatChips(result.payout)} coins</p>
            ) : (
              <p className="ah-result-coins is-muted">−{formatChips(result.entry)} coins</p>
            )}
            <button type="button" className="ah-play" onClick={again}>
              {t('airhockey.again')}
            </button>
            <button type="button" className="ah-ghost" onClick={() => back('home')}>
              {t('airhockey.backToCasino')}
            </button>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div className="ah-modal" role="alertdialog" aria-modal="true" aria-labelledby="ah-leave-title">
          <div className="ah-result">
            <h2 id="ah-leave-title">{t('airhockey.leaveTitle')}</h2>
            <p className="ah-result-text">{matchRef.current?.id ? t('airhockey.leaveText', { coins: formatChips(matchRef.current.entry) }) : t('airhockey.leavePractice')}</p>
            <button type="button" className="ah-play" onClick={() => setConfirmLeave(false)}>
              {t('airhockey.keepPlaying')}
            </button>
            <button type="button" className="ah-ghost" onClick={() => back('home')}>
              {t('airhockey.leave')}
            </button>
          </div>
        </div>
      )}

      {menu && (
        <div className="ah-modal" role="dialog" aria-modal="true" aria-labelledby="ah-menu-title" onClick={() => setMenu(false)}>
          <div className="ah-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ah-sheet-head">
              <h2 id="ah-menu-title">{t('airhockey.settings')}</h2>
              <button type="button" className="ah-icon" onClick={() => setMenu(false)} aria-label={t('common.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="ah-card-kicker">{t('airhockey.difficulty')}</p>
            <div className="ah-levels" role="radiogroup" aria-label={t('airhockey.difficulty')}>
              {DIFFICULTY_OPTIONS.map((l) => (
                <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? 'is-on' : ''} onClick={() => setPreference('difficulty', l)}>
                  <b>{t(`airhockey.levels.${l}`)}</b>
                  <small>{t(`airhockey.levelHints.${l}`)}</small>
                </button>
              ))}
            </div>
            <p className="ah-card-kicker mt-4 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" aria-hidden /> {t('airhockey.howTitle')}
            </p>
            <ul className="ah-how">
              <li>{t('airhockey.how1', { n: WIN_SCORE })}</li>
              <li>{t('airhockey.how2')}</li>
              <li>{t('airhockey.how3')}</li>
              <li>{t('airhockey.how4')}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bug, Hand, SkipForward } from 'lucide-react';
import type { ActionResult, Card, GameAction, GameState } from '@/game/engine';
import { Actions, validateAction } from '@/game/engine';
import { getSeats } from '@/game/table/seating';
import type { Seat, SeatPosition } from '@/game/table/seating';
import type { TableEvents } from '@/game/table/events';
import { useI18n } from '@/i18n';
import { useViewport } from '@/hooks/useViewport';
import { LanguageSelector } from '@/components/LanguageSelector';
import { MusicButton } from '@/components/ui/MusicButton';
import { DebugPanel } from '@/components/game/DebugPanel';
import { useCardName } from './useCardName';
import { PlayerHand } from './PlayerHand';
import { OpponentSeat } from './OpponentSeat';
import { TableCenter } from './TableCenter';
import { CurrentColorBadge } from './CurrentColorBadge';
import { ColorPicker } from './ColorPicker';
import { RoundResult } from './RoundResult';
import { Scoreboard } from './Scoreboard';
import { useTableAnimations } from './useTableAnimations';
import { displayName } from './names';
import { eventText } from './eventText';
import { FeltPrint } from './FeltPrint';
import { SceneBackground } from '@/components/scene/SceneBackground';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { scenarioStyle } from '@/game/scenarios/scenarios';
import { playSfx } from '@/audio/sfx';
import { usePreferences, vibrate } from '@/settings/usePreferences';

interface GameTableProps {
  state: GameState;
  localPlayerId: string;
  dispatch: (action: GameAction) => ActionResult;
  onExit: () => void;
  engineError?: string | null;
  scenario: ScenarioId;
  /** A thin line under the header (online matches: connection and turn timer). */
  banner?: React.ReactNode;
}

interface Burst {
  id: number;
  text: string;
  x: number;
  y: number;
  tone: 'good' | 'bad';
}

/** Short-lived table effects around the discard pile (sparks, color wave). */
interface Effect {
  id: number;
  kind: 'sparks' | 'wave';
  x: number;
  y: number;
  color: string;
}

const EFFECT_COLOR: Record<string, string> = {
  RED: 'var(--pc-red)',
  YELLOW: 'var(--pc-yellow)',
  GREEN: 'var(--pc-green)',
  BLUE: 'var(--pc-blue)',
  WILD: '#f3ecdc',
};

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Where each seat position sits around the table. Wide screens use all four sides;
 * narrow screens bring the side seats up to the top rim so the centre stays free.
 */
const SLOT_WIDE: Record<SeatPosition, string> = {
  bottom: '',
  top: 'top-0 left-1/2 -translate-x-1/2',
  'top-left': 'top-0 left-[22%] -translate-x-1/2',
  'top-right': 'top-0 left-[78%] -translate-x-1/2',
  left: 'left-0 top-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 -translate-y-1/2',
};
const NARROW_ORDER: SeatPosition[] = ['left', 'top-left', 'top', 'top-right', 'right'];

/**
 * The visual table. Renders GameState and turns taps into GameActions — every rule
 * (legality, turns, effects, UNO, scoring) is answered by the engine.
 */
export function GameTable({ state, localPlayerId, dispatch, onExit, engineError, scenario, banner }: GameTableProps) {
  const { preferences } = usePreferences();
  const { t } = useI18n();
  const cardName = useCardName();
  const { width: vw, height: vh } = useViewport();
  const narrow = vw < 640;
  const handCardWidth = Math.round(clamp(62, Math.min(vw * (narrow ? 0.215 : 0.2), vh * 0.125), vw >= 700 && vh >= 900 ? 132 : 116));
  const pileWidth = Math.round(clamp(58, Math.min(vw * (narrow ? 0.27 : 0.2), vh * 0.145), vw >= 700 && vh >= 900 ? 152 : 128));

  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [justPlayed, setJustPlayed] = useState<string | null>(null);

  const local = state.players.find((p) => p.id === localPlayerId)!;
  const current = state.players[state.currentPlayerIndex];
  const pending = state.pendingAction;
  const playing = state.status === 'PLAYING';
  const isMyTurn = playing && current.id === localPlayerId;

  const nameOf = useCallback(
    (id: string) => {
      const p = state.players.find((x) => x.id === id);
      return p ? displayName(state, p, localPlayerId, t) : id;
    },
    [state, localPlayerId, t]
  );

  const seats = useMemo(() => getSeats(state, localPlayerId), [state, localPlayerId]);
  const opponents = seats.filter((s) => s.position !== 'bottom');

  // Legal plays come straight from the engine's validator (turn, pending draw, drawn-card rule…).
  const playableIds = useMemo(
    () => new Set(local.hand.filter((c) => validateAction(state, Actions.playCard(localPlayerId, c.id)).valid).map((c) => c.id)),
    [state, local.hand, localPlayerId]
  );
  const canDraw = validateAction(state, Actions.drawCard(localPlayerId)).valid;
  const canPass = validateAction(state, Actions.endTurn(localPlayerId)).valid;
  const unoTarget = state.unoState.penaltyWindowPlayerId;
  const canCatch = !!unoTarget && unoTarget !== localPlayerId && validateAction(state, Actions.challengeUno(localPlayerId, unoTarget)).valid;
  const declared = state.unoState.declaredPlayerIds.includes(localPlayerId);
  const showUno =
    playing && !declared && ((local.hand.length === 2 && isMyTurn && playableIds.size > 0) || (local.hand.length === 1 && unoTarget === localPlayerId));
  const choosingColor = pending?.type === 'CHOOSE_COLOR' && pending.playerId === localPlayerId;
  const myMove = isMyTurn && !choosingColor;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addBurst = useCallback((text: string, rect: DOMRect | undefined, tone: Burst['tone']) => {
    const id = Date.now() + Math.random();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    setBursts((b) => [...b, { id, text, x, y, tone }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1050);
  }, []);

  const addEffect = useCallback((kind: Effect['kind'], rect: DOMRect | undefined, color: string) => {
    if (!rect) return;
    const id = Date.now() + Math.random();
    setEffects((e) => [...e, { id, kind, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color }]);
    window.setTimeout(() => setEffects((e) => e.filter((x) => x.id !== id)), 900);
  }, []);

  const onEvents = useCallback(
    (events: TableEvents, rects: Map<string, DOMRect>) => {
      const discard = rects.get('discard-top');
      if (events.played) {
        const { card, playerId } = events.played;
        setJustPlayed(playerId);
        window.setTimeout(() => setJustPlayed((p) => (p === playerId ? null : p)), 650);
        if (card.type !== 'NUMBER') addEffect('sparks', discard, EFFECT_COLOR[card.color]);
      }
      if (events.colorChanged && !events.dealt) addEffect('wave', discard, EFFECT_COLOR[events.colorChanged]);
      for (const e of events.newLog) {
        if (e.type === 'DRAW_PENALTY' && e.playerId && (e.amount ?? 0) >= 2) {
          addBurst(`+${e.amount}`, rects.get(`seat:${e.playerId}`), 'bad');
        }
      }
      if (events.unoCalls.some((c) => c.valid) || events.unoPenalties.length > 0) vibrate(preferences.haptics, [20, 40, 20]);
      for (const call of events.unoCalls) {
        addBurst(call.valid ? t('table.uno') : t('table.unoInvalid'), rects.get(`seat:${call.playerId}`), call.valid ? 'good' : 'bad');
      }
      for (const penalty of events.unoPenalties) {
        addBurst(t('table.unoPenaltyBurst', { amount: penalty.amount }), rects.get(`seat:${penalty.playerId}`), 'bad');
      }
    },
    [addBurst, addEffect, t, preferences.haptics]
  );

  const { register, ghostLayer } = useTableAnimations(state, localPlayerId, onEvents);

  /** One tap plays a legal card. A Wild goes to the discard pile and the engine then asks for a color. */
  const onCardTap = (card: Card, el: HTMLElement) => {
    if (!playing || choosingColor) return;
    if (playableIds.has(card.id)) {
      dispatch(Actions.playCard(localPlayerId, card.id));
      return;
    }
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
    playSfx('error');
    vibrate(preferences.haptics, 35);
    setToast({ id: Date.now(), text: isMyTurn ? t('table.cannotPlay') : t('table.notYourTurn') });
  };

  const status = (() => {
    if (!playing) return null;
    if (pending?.type === 'CHOOSE_COLOR' && pending.playerId !== localPlayerId) return t('table.choosingColor', { name: nameOf(pending.playerId) });
    if (choosingColor) return t('table.chooseColor');
    if (isMyTurn && pending?.type === 'PLAY_DRAWN_CARD') return t('table.drawnPlayable');
    if (isMyTurn && state.pendingDraw > 0) return t('table.mustAnswerStack', { count: state.pendingDraw });
    if (isMyTurn) return playableIds.size > 0 ? t('table.pickCard') : t('table.mustDraw');
    return null;
  })();

  const lastEvent = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const text = eventText(state.log[i], nameOf, cardName, t, localPlayerId);
      if (text) return { seq: state.log[i].seq, text };
    }
    return null;
  }, [state.log, nameOf, cardName, t, localPlayerId]);

  const renderSeat = (seat: Seat) => {
    const player = state.players.find((p) => p.id === seat.playerId)!;
    return (
      <OpponentSeat
        key={seat.playerId}
        player={player}
        seat={narrow ? { ...seat, position: 'left' } : seat}
        name={nameOf(player.id)}
        score={state.settings.teamMode ? null : state.scores[player.id] ?? 0}
        active={playing && (pending?.playerId ?? current.id) === player.id}
        hasUno={state.unoState.playersWithOneCard.includes(player.id)}
        justPlayed={justPlayed === player.id}
        compact={narrow}
        register={register}
      />
    );
  };

  const narrowSeats = [...opponents].sort((a, b) => NARROW_ORDER.indexOf(a.position) - NARROW_ORDER.indexOf(b.position));
  const hasSides = !narrow && opponents.some((s) => s.position === 'left' || s.position === 'right');
  const pad = narrow ? 'inset-x-2.5 top-[60px] bottom-3' : `${hasSides ? 'inset-x-[64px] lg:inset-x-[84px]' : 'inset-x-2'} top-[40px] bottom-2`;

  return (
    <div
      className="game-room relative h-[100dvh] w-full flex flex-col overflow-hidden select-none"
      style={
        {
          ...scenarioStyle(scenario),
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
        } as React.CSSProperties
      }
    >
      <SceneBackground scenario={scenario} />
      {/* Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-1.5 px-2 sm:px-4 pt-2 pb-1 shrink-0">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center justify-center gap-1 rounded-xl min-h-[40px] min-w-[40px] px-2 text-sm text-ink-400 hover:text-white hover:bg-white/5"
          aria-label={t('table.exit')}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t('table.exit')}</span>
        </button>
        <Scoreboard state={state} localPlayerId={localPlayerId} />
        <div className="flex items-center gap-1">
          <MusicButton className="!w-10 !h-10 !rounded-lg" />
          <div className="chip rounded-xl px-2 py-1">
            <LanguageSelector compact short={narrow} />
          </div>
          {import.meta.env.DEV && (
            <button type="button" onClick={() => setShowDebug((v) => !v)} className="rounded-xl p-2 text-amber-400 hover:bg-white/5" aria-label="debug">
              <Bug className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>
      {banner && <div className="relative z-10 flex justify-center px-2 pb-1 shrink-0">{banner}</div>}

      {/* Table */}
      <div className="relative z-[1] flex-1 min-h-0 w-full max-w-6xl mx-auto px-2 sm:px-4">
        <div className="relative h-full table-stage">
          <div className={`table-top ${pad}`}>
            <div className="table-felt flex items-center justify-center overflow-hidden">
              <FeltPrint />
              <div className="relative flex flex-col items-center gap-2 sm:gap-3 px-2" style={{ marginTop: narrow ? 48 : 0 }}>
                <div className="play-zone">
                  <TableCenter state={state} pileWidth={pileWidth} canDraw={canDraw} onDraw={() => dispatch(Actions.drawCard(localPlayerId))} register={register} />
                </div>
                <CurrentColorBadge color={state.currentColor} />
                {lastEvent && (
                  <p key={lastEvent.seq} className="max-w-[92%] truncate text-[11px] sm:text-xs text-white/60 animate-fade-in" aria-live="polite">
                    {lastEvent.text}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seats around the rim */}
          {narrow ? (
            <div className="absolute top-0 inset-x-0 z-10 flex justify-center items-start gap-1.5">{narrowSeats.map(renderSeat)}</div>
          ) : (
            opponents.map((seat) => (
              <div key={seat.playerId} className={`absolute z-10 ${SLOT_WIDE[seat.position]}`}>
                {renderSeat(seat)}
              </div>
            ))
          )}

          {choosingColor && (
            <div className={`absolute z-30 ${pad} rounded-[clamp(64px,18vmin,180px)]`}>
              <ColorPicker onChoose={(color) => dispatch(Actions.chooseColor(localPlayerId, color))} />
            </div>
          )}
        </div>
      </div>

      {/* Local player */}
      <section
        ref={register(`seat:${localPlayerId}`)}
        className="relative z-[2] w-full max-w-6xl mx-auto shrink-0 pb-[max(6px,env(safe-area-inset-bottom))]"
        aria-label={nameOf(localPlayerId)}
      >
        <div className="flex items-center justify-between gap-2 px-3 min-h-[52px]">
          <div className="min-w-0 flex-1">
            {isMyTurn ? (
              <span
                key={state.turnNumber}
                className="inline-flex items-center rounded-full bg-gradient-to-r from-[#f3ecdc] to-[#e2d3ae] px-3 py-1 text-xs sm:text-sm font-extrabold tracking-wide text-ink-950 shadow-glow-gold animate-banner"
              >
                {t('table.yourTurn')}
              </span>
            ) : playing ? (
              <span key={state.turnNumber} className="text-xs sm:text-sm text-ink-400 animate-fade-in truncate block">
                {t('table.turnOf', { name: nameOf(pending?.playerId ?? current.id) })}
              </span>
            ) : null}
            {status && <p className="mt-0.5 text-[11px] text-ink-400 truncate">{status}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canCatch && unoTarget && (
              <button
                type="button"
                onClick={() => dispatch(Actions.challengeUno(localPlayerId, unoTarget))}
                className="flex items-center gap-1 rounded-xl min-h-[44px] bg-danger-600 px-3 text-xs font-bold text-white shadow-lg animate-pop"
              >
                <Hand className="w-4 h-4" />
                {t('table.catch', { name: nameOf(unoTarget) })}
              </button>
            )}
            {canPass && (
              <button type="button" onClick={() => dispatch(Actions.endTurn(localPlayerId))} className="chip flex items-center gap-1 rounded-xl min-h-[44px] px-3 text-sm font-semibold">
                <SkipForward className="w-4 h-4" />
                {t('table.pass')}
              </button>
            )}
            {canDraw && (
              <button type="button" onClick={() => dispatch(Actions.drawCard(localPlayerId))} className="chip rounded-xl min-h-[44px] px-4 text-sm font-semibold">
                {state.pendingDraw > 0 ? t('table.drawCount', { count: state.pendingDraw }) : t('table.draw')}
              </button>
            )}
            {showUno && (
              <button
                type="button"
                onClick={() => dispatch(Actions.callUno(localPlayerId))}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-400 via-amber-500 to-rose-600 text-ink-950 font-display font-extrabold text-base shadow-glow-gold border-2 border-[#f3ecdc] animate-pop"
              >
                {t('table.uno')}
              </button>
            )}
          </div>
        </div>

        <PlayerHand
          cards={local.hand}
          cardWidth={handCardWidth}
          playableIds={playableIds}
          myMove={myMove}
          highlightId={pending?.type === 'PLAY_DRAWN_CARD' && pending.playerId === localPlayerId ? pending.cardId : null}
          onCardTap={onCardTap}
          register={register}
        />

        {toast && (
          <p key={toast.id} role="status" className="panel pointer-events-none absolute left-1/2 top-14 z-20 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap animate-toast">
            {toast.text}
          </p>
        )}
      </section>

      {(state.status === 'ROUND_OVER' || state.status === 'GAME_OVER') && (
        <RoundResult
          state={state}
          localPlayerId={localPlayerId}
          nameOf={nameOf}
          onNextRound={() => dispatch(Actions.startGame())}
          onRestart={() => dispatch(Actions.restartGame())}
          onExit={onExit}
        />
      )}

      {/* Table effects: sparks for action cards, a color wave when the color changes */}
      <div className="pointer-events-none fixed inset-0 z-[25]" aria-hidden>
        {effects.map((fx) =>
          fx.kind === 'wave' ? (
            <span key={fx.id} className="fx-wave" style={{ left: fx.x, top: fx.y, '--fx': fx.color } as React.CSSProperties} />
          ) : (
            <span key={fx.id} className="fx-sparks" style={{ left: fx.x, top: fx.y, '--fx': fx.color } as React.CSSProperties}>
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ '--a': `${i * 36}deg` } as React.CSSProperties} />
              ))}
            </span>
          )
        )}
      </div>

      {/* Flying cards and UNO feedback */}
      <div ref={ghostLayer} className="pointer-events-none fixed inset-0 z-30" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-50" aria-live="assertive">
        {bursts.map((b) => (
          <span
            key={b.id}
            className={`absolute font-display font-extrabold text-2xl sm:text-3xl px-4 py-1 rounded-2xl border-2 border-[#f3ecdc] animate-burst ${
              b.tone === 'good' ? 'bg-gradient-to-br from-gold-400 to-rose-600 text-ink-950 shadow-glow-gold' : 'bg-danger-600 text-white'
            }`}
            style={{ left: b.x, top: b.y }}
          >
            {b.text}
          </span>
        ))}
      </div>

      {import.meta.env.DEV && showDebug && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-ink-950/95 p-3">
          {engineError && <p className="text-xs text-danger-400 font-mono mb-2">engine: {engineError}</p>}
          <DebugPanel state={state} />
        </div>
      )}
    </div>
  );
}

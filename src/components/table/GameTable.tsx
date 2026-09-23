import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bug, Hand, Play, SkipForward } from 'lucide-react';
import type { ActionResult, Card, GameAction, GameState } from '@/game/engine';
import { Actions, validateAction } from '@/game/engine';
import { getSeats } from '@/game/table/seating';
import type { SeatPosition } from '@/game/table/seating';
import type { TableEvents } from '@/game/table/events';
import { useI18n } from '@/i18n';
import { useViewport } from '@/hooks/useViewport';
import { LanguageSelector } from '@/components/LanguageSelector';
import { DebugPanel } from '@/components/game/DebugPanel';
import { useCardName } from './useCardName';
import { PlayerHand } from './PlayerHand';
import { OpponentSeat } from './OpponentSeat';
import { TableCenter } from './TableCenter';
import { CurrentColorBadge } from './CurrentColorBadge';
import { ColorPicker } from './ColorPicker';
import { RoundResult } from './RoundResult';
import { useTableAnimations } from './useTableAnimations';
import { displayName } from './names';
import { eventText } from './eventText';

interface GameTableProps {
  state: GameState;
  localPlayerId: string;
  dispatch: (action: GameAction) => ActionResult;
  onExit: () => void;
  engineError?: string | null;
}

interface Burst {
  id: number;
  text: string;
  x: number;
  y: number;
  tone: 'good' | 'bad';
}

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The visual table. Renders GameState and turns taps into GameActions — every rule
 * (legality, turns, effects, UNO, scoring) is answered by the engine.
 */
export function GameTable({ state, localPlayerId, dispatch, onExit, engineError }: GameTableProps) {
  const { t } = useI18n();
  const cardName = useCardName();
  const { width: vw, height: vh } = useViewport();
  const compact = vw < 640;
  const handCardWidth = Math.round(clamp(58, Math.min(vw * 0.17, vh * 0.125), 108));
  const pileWidth = Math.round(clamp(50, Math.min(vw * 0.15, vh * 0.11), 100));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ id: number; text: string } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [showDebug, setShowDebug] = useState(false);

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
  const seatAt = (positions: SeatPosition[]) => seats.filter((s) => positions.includes(s.position));

  // Legal plays come straight from the engine's validator (covers turn, jump-in, draw stacks…).
  const playableIds = useMemo(
    () => new Set(local.hand.filter((c) => validateAction(state, Actions.playCard(localPlayerId, c.id)).valid).map((c) => c.id)),
    [state, local.hand, localPlayerId]
  );
  const selected = selectedId && playableIds.has(selectedId) ? selectedId : null;
  const canDraw = validateAction(state, Actions.drawCard(localPlayerId)).valid;
  const canPass = validateAction(state, Actions.endTurn(localPlayerId)).valid;
  const unoTarget = state.unoState.penaltyWindowPlayerId;
  const canCatch = !!unoTarget && unoTarget !== localPlayerId && validateAction(state, Actions.challengeUno(localPlayerId, unoTarget)).valid;
  const declared = state.unoState.declaredPlayerIds.includes(localPlayerId);
  const showUno =
    playing &&
    !declared &&
    ((local.hand.length === 2 && isMyTurn && playableIds.size > 0) || (local.hand.length === 1 && unoTarget === localPlayerId));
  const choosingColor = pending?.type === 'CHOOSE_COLOR' && pending.playerId === localPlayerId;

  const showHint = (text: string) => setHint({ id: Date.now(), text });
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const addBurst = useCallback((text: string, rect: DOMRect | undefined, tone: Burst['tone']) => {
    const id = Date.now() + Math.random();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    setBursts((b) => [...b, { id, text, x, y, tone }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 950);
  }, []);

  const onEvents = useCallback(
    (events: TableEvents, rects: Map<string, DOMRect>) => {
      for (const call of events.unoCalls) {
        addBurst(call.valid ? t('table.uno') : t('table.unoInvalid'), rects.get(`seat:${call.playerId}`), call.valid ? 'good' : 'bad');
      }
      for (const penalty of events.unoPenalties) {
        addBurst(t('table.unoPenaltyBurst', { amount: penalty.amount }), rects.get(`seat:${penalty.playerId}`), 'bad');
      }
    },
    [addBurst, t]
  );

  const { register, ghostLayer } = useTableAnimations(state, localPlayerId, onEvents);

  const play = (card: Card) => {
    setSelectedId(null);
    dispatch(Actions.playCard(localPlayerId, card.id));
  };

  const onCardClick = (card: Card, el: HTMLElement) => {
    if (!playing) return;
    if (!playableIds.has(card.id)) {
      el.classList.remove('animate-shake');
      void el.offsetWidth;
      el.classList.add('animate-shake');
      showHint(isMyTurn ? t('table.cannotPlay') : t('table.notYourTurn'));
      return;
    }
    if (selected === card.id) play(card);
    else setSelectedId(card.id);
  };

  const status = (() => {
    if (!playing) return null;
    if (pending?.type === 'CHOOSE_COLOR' && pending.playerId !== localPlayerId) return t('table.choosingColor', { name: nameOf(pending.playerId) });
    if (isMyTurn && pending?.type === 'PLAY_DRAWN_CARD') return t('table.drawnPlayable');
    if (isMyTurn && state.pendingDraw > 0) return t('table.mustAnswerStack', { count: state.pendingDraw });
    if (isMyTurn) return selected ? t('table.tapAgain') : t('table.pickCard');
    return null;
  })();

  const lastEvent = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const text = eventText(state.log[i], nameOf, cardName, t);
      if (text) return { seq: state.log[i].seq, text };
    }
    return null;
  }, [state.log, nameOf, cardName, t]);

  const renderSeat = (seat: (typeof seats)[number]) => {
    const player = state.players.find((p) => p.id === seat.playerId)!;
    return (
      <OpponentSeat
        key={seat.playerId}
        player={player}
        seat={seat}
        name={nameOf(player.id)}
        active={playing && current.id === player.id}
        hasUno={state.unoState.playersWithOneCard.includes(player.id)}
        compact={compact}
        register={register}
      />
    );
  };

  const selectedCard = selected ? local.hand.find((c) => c.id === selected) : undefined;

  return (
    <div className="relative h-[100dvh] w-full max-w-6xl mx-auto flex flex-col overflow-hidden select-none">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 shrink-0">
        <button type="button" onClick={onExit} className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm text-ink-400 hover:text-white hover:bg-white/5" aria-label={t('table.exit')}>
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t('table.exit')}</span>
        </button>
        <div className="text-xs sm:text-sm text-ink-400 font-semibold truncate">
          {t('table.round', { round: state.roundNumber })}
          {state.settings.teamMode
            ? state.teams.map((team) => ` · ${t('table.teamScore', { team: team.name, score: state.teamScores[team.id] ?? 0 })}`).join('')
            : ` · ${t('table.yourScore', { score: state.scores[localPlayerId] ?? 0 })}`}
        </div>
        <div className="flex items-center gap-1">
          <div className="rounded-xl bg-black/30 px-2 py-1">
            <LanguageSelector compact />
          </div>
          {import.meta.env.DEV && (
            <button type="button" onClick={() => setShowDebug((v) => !v)} className="rounded-xl p-2 text-amber-400 hover:bg-white/5" aria-label="debug">
              <Bug className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Top seats */}
      <div className="flex justify-center items-start gap-2 sm:gap-6 px-2 shrink-0">{seatAt(['top-left', 'top', 'top-right']).map(renderSeat)}</div>

      {/* Middle: side seats + table */}
      <div className="flex-1 min-h-0 flex items-center gap-1 sm:gap-4 px-1 sm:px-4">
        <div className="shrink-0 flex flex-col gap-2">{seatAt(['left']).map(renderSeat)}</div>
        <div className="relative flex-1 h-full min-w-0 table-stage">
          <div className="table-surface absolute inset-x-[2%] top-[8%] bottom-[20%] flex items-center justify-center">
            <TableCenter state={state} pileWidth={pileWidth} canDraw={canDraw} onDraw={() => dispatch(Actions.drawCard(localPlayerId))} register={register} />
          </div>
          <div className="absolute inset-x-0 bottom-[2%] flex flex-col items-center gap-1 px-1">
            <CurrentColorBadge color={state.currentColor} />
            {lastEvent && (
              <p key={lastEvent.seq} className="max-w-full truncate text-[11px] sm:text-xs text-ink-400 animate-fade-in" aria-live="polite">
                {lastEvent.text}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col gap-2">{seatAt(['right']).map(renderSeat)}</div>
      </div>

      {/* Local player */}
      <section ref={register(`seat:${localPlayerId}`)} className="shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]" aria-label={nameOf(localPlayerId)}>
        <div className="flex items-center justify-between gap-2 px-3 min-h-[48px]">
          <div className="min-w-0 flex-1">
            {isMyTurn ? (
              <span key={state.turnNumber} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 px-3 py-1 text-xs sm:text-sm font-extrabold text-ink-950 shadow-glow animate-banner">
                {t('table.yourTurn')}
              </span>
            ) : playing ? (
              <span key={state.turnNumber} className="text-xs sm:text-sm text-ink-400 animate-fade-in truncate block">
                {t('table.turnOf', { name: nameOf(current.id) })}
              </span>
            ) : null}
            {status && <p className="mt-0.5 text-[11px] text-ink-400 truncate">{status}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canCatch && unoTarget && (
              <button type="button" onClick={() => dispatch(Actions.challengeUno(localPlayerId, unoTarget))} className="flex items-center gap-1 rounded-xl bg-danger-500/20 border border-danger-500/40 px-3 py-2 text-xs font-bold text-danger-400 animate-pop">
                <Hand className="w-4 h-4" />
                {t('table.catch', { name: nameOf(unoTarget) })}
              </button>
            )}
            {selectedCard && (
              <button type="button" onClick={() => play(selectedCard)} className="flex items-center gap-1 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 px-4 py-2.5 text-sm font-bold text-ink-950 animate-pop">
                <Play className="w-4 h-4" />
                {t('table.play')}
              </button>
            )}
            {canPass && (
              <button type="button" onClick={() => dispatch(Actions.endTurn(localPlayerId))} className="flex items-center gap-1 rounded-xl glass px-3 py-2.5 text-sm font-semibold">
                <SkipForward className="w-4 h-4" />
                {t('table.pass')}
              </button>
            )}
            {canDraw && !selectedCard && (
              <button type="button" onClick={() => dispatch(Actions.drawCard(localPlayerId))} className="rounded-xl glass px-4 py-2.5 text-sm font-semibold">
                {state.pendingDraw > 0 ? t('table.drawCount', { count: state.pendingDraw }) : t('table.draw')}
              </button>
            )}
            {showUno && (
              <button
                type="button"
                onClick={() => dispatch(Actions.callUno(localPlayerId))}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-400 via-amber-500 to-rose-600 text-ink-950 font-display font-extrabold text-base shadow-glow-gold border-2 border-white/80 animate-pop"
              >
                {t('table.uno')}
              </button>
            )}
          </div>
        </div>

        {hint && (
          <p key={hint.id} className="text-center text-xs text-danger-400 animate-fade-in" role="status">
            {hint.text}
          </p>
        )}

        <PlayerHand
          cards={local.hand}
          cardWidth={handCardWidth}
          playableIds={playableIds}
          interactive={playing && !choosingColor}
          selectedId={selected}
          highlightId={pending?.type === 'PLAY_DRAWN_CARD' && pending.playerId === localPlayerId ? pending.cardId : null}
          onCardClick={onCardClick}
          register={register}
        />
      </section>

      {choosingColor && <ColorPicker onChoose={(color) => dispatch(Actions.chooseColor(localPlayerId, color))} />}

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

      {/* Flying cards and UNO feedback */}
      <div ref={ghostLayer} className="pointer-events-none fixed inset-0 z-30" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-50" aria-live="assertive">
        {bursts.map((b) => (
          <span
            key={b.id}
            className={`absolute font-display font-extrabold text-2xl sm:text-3xl px-4 py-1 rounded-2xl animate-burst ${
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

import { ArrowLeft, RotateCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useGameEngine } from '@/hooks/useGameEngine';
import { CardChip } from '@/components/game/CardChip';
import { COLOR_CLASSES } from '@/components/game/cardColors';
import { DebugPanel } from '@/components/game/DebugPanel';
import { Actions, COLORS, canPlayCard, getCurrentPlayer, getTopCard, validateAction } from '@/game/engine';
import type { CreateGameConfig } from '@/game/engine';

// Temporary hot-seat table to exercise the engine. Every rule comes from the engine;
// this screen only renders the state and dispatches actions.
const CONFIG: CreateGameConfig = {
  players: [
    { id: 'you', name: 'Jugador 1', type: 'HUMAN' },
    { id: 'bot1', name: 'Bot 1', type: 'BOT' },
    { id: 'bot2', name: 'Bot 2', type: 'BOT' },
    { id: 'bot3', name: 'Bot 3', type: 'BOT' },
  ],
};

export function PlayScreen() {
  const { goHome } = useNavigation();
  const { t } = useI18n();
  const { state, dispatch, error, newGame } = useGameEngine(CONFIG);

  const current = getCurrentPlayer(state);
  const top = getTopCard(state);
  const pending = state.pendingAction;
  const choosingColor = pending?.type === 'CHOOSE_COLOR' ? pending : null;
  const can = (action: Parameters<typeof validateAction>[1]) => validateAction(state, action).valid;
  const unoTarget = state.unoState.penaltyWindowPlayerId
    ? state.players.find((p) => p.id === state.unoState.penaltyWindowPlayerId)
    : undefined;
  const lastRound = state.rounds[state.rounds.length - 1];
  const roundDone = state.status === 'ROUND_OVER' || state.status === 'GAME_OVER';

  return (
    <div className="min-h-screen w-full max-w-3xl mx-auto px-4 pt-6 pb-12 text-white">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={goHome} icon={<ArrowLeft className="w-4 h-4" />}>
          {t('common.back')}
        </Button>
        <h1 className="font-display font-bold text-xl">{t('play.title')}</h1>
        <Button variant="secondary" size="sm" onClick={newGame}>
          {t('play.newGame')}
        </Button>
      </div>
      <p className="text-xs text-ink-400 mb-4">{t('play.hotSeat')}</p>

      {/* Players */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border p-3 ${p.id === current.id && !roundDone ? 'border-brand-400 bg-brand-500/10' : 'border-white/10 bg-white/5'}`}
          >
            <div className="font-semibold truncate">{p.name}</div>
            <div className="text-xs text-ink-400">
              {p.type} · {t('play.cards', { count: p.cardsRemaining })}
            </div>
            <div className="text-xs text-ink-400">
              {t('play.scores')}: {state.scores[p.id] ?? 0}
            </div>
            {state.unoState.playersWithOneCard.includes(p.id) && <div className="text-xs font-bold text-amber-400">UNO</div>}
            {can(Actions.callUno(p.id)) && (p.cardsRemaining <= 2) && (
              <button type="button" className="mt-1 text-xs underline text-amber-300" onClick={() => dispatch(Actions.callUno(p.id))}>
                {t('play.callUno')}
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Table */}
      <section className="flex flex-wrap items-center gap-6 mb-6">
        <div>
          <div className="text-xs text-ink-400 mb-1">{t('play.topCard')}</div>
          {top && <CardChip card={top} />}
        </div>
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-2">
            {t('play.color')}:
            {state.currentColor ? (
              <span className={`px-2 py-0.5 rounded ${COLOR_CLASSES[state.currentColor]}`}>{t(`play.colors.${state.currentColor}`)}</span>
            ) : (
              '—'
            )}
          </div>
          <div className="flex items-center gap-2">
            {t('play.direction')}:
            {state.direction === 'CLOCKWISE' ? <RotateCw className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
          </div>
          <div>
            {t('play.turn')}: <strong>{current.name}</strong>
          </div>
          <div>
            {t('play.deck')}: {state.deck.length}
          </div>
          {state.pendingDraw > 0 && <div className="text-amber-400">{t('play.drawStack', { count: state.pendingDraw })}</div>}
        </div>
      </section>

      {error && <div className="mb-4 rounded-lg bg-danger-500/15 border border-danger-500/30 px-3 py-2 text-sm text-danger-400">{error}</div>}

      {unoTarget && (
        <div className="mb-4 flex flex-wrap gap-2">
          {state.players
            .filter((p) => can(Actions.challengeUno(p.id, unoTarget.id)))
            .slice(0, 1)
            .map((p) => (
              <Button key={p.id} variant="danger" size="sm" onClick={() => dispatch(Actions.challengeUno(p.id, unoTarget.id))}>
                {t('play.challenge', { name: unoTarget.name })}
              </Button>
            ))}
        </div>
      )}

      {roundDone && lastRound ? (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="font-bold text-lg">
            {state.status === 'GAME_OVER' ? t('play.gameOver') : t('play.roundOver', { round: lastRound.roundNumber })}
          </h2>
          <p className="mt-1">
            {t('play.winner', {
              name: state.players.find((p) => p.id === lastRound.winnerId)?.name ?? '',
              points: lastRound.points,
            })}
          </p>
          <div className="mt-4 flex gap-2">
            {state.status === 'ROUND_OVER' && <Button size="sm" onClick={() => dispatch(Actions.startGame())}>{t('play.nextRound')}</Button>}
            <Button size="sm" variant="secondary" onClick={() => dispatch(Actions.restartGame())}>
              {t('play.restart')}
            </Button>
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-sm text-ink-400 mb-2">{t('play.yourHand', { name: current.name })}</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {current.hand.map((card) => (
              <CardChip
                key={card.id}
                card={card}
                highlight={pending?.type === 'PLAY_DRAWN_CARD' && pending.cardId === card.id}
                disabled={!canPlayCard(card, state)}
                onClick={() => dispatch(Actions.playCard(current.id, card.id))}
              />
            ))}
          </div>

          {choosingColor ? (
            <div>
              <div className="text-sm mb-2">{t('play.chooseColor')}</div>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`px-4 py-2 rounded-lg font-semibold ${COLOR_CLASSES[color]}`}
                    onClick={() => dispatch(Actions.chooseColor(choosingColor.playerId, color))}
                  >
                    {t(`play.colors.${color}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" disabled={!can(Actions.drawCard(current.id))} onClick={() => dispatch(Actions.drawCard(current.id))}>
                {t('play.draw')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!can(Actions.endTurn(current.id))}
                onClick={() => dispatch(Actions.endTurn(current.id))}
              >
                {t('play.endTurn')}
              </Button>
            </div>
          )}
        </section>
      )}

      {import.meta.env.DEV && <DebugPanel state={state} />}
    </div>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { GameTable } from '@/components/table/GameTable';
import { validateAction } from '@/game/engine';
import type { ActionResult, Card, GameAction, GameState } from '@/game/engine';
import { useGameSounds } from '@/audio/useGameSounds';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { pickScenario } from '@/game/scenarios/scenarios';
import { usePreferences } from '@/settings/usePreferences';
import { useOnlineRoom } from './useOnlineRoom';
import type { OnlineRoom } from './useOnlineRoom';
import type { RoomView } from './protocol';
import { OnlineGate } from './OnlineGate';
import { OnlineBar } from './OnlineBar';
import type { CartaView } from './server/carta';

/** The view without the draw pile's cards: stand-ins keep its size for the table. */
function withDeck(view: CartaView): GameState {
  const deck: Card[] = Array.from({ length: view.deckSize }, (_, i) => ({ id: `hidden-${i}`, color: 'WILD', type: 'WILD', value: null }) as Card);
  return { ...view.state, deck };
}

/** An online Carta match: the server deals, plays the bots and checks every move; this table only shows it. */
export function CartaOnline() {
  const { params, navigate } = useNavigation();
  const code = params.room ?? '';
  const room = useOnlineRoom(code);
  const v = room.view;
  const home = () => navigate('home', {}, { replace: true });
  if (!v || !v.carta || v.status !== 'playing') return <OnlineGate view={v} error={room.error} onExit={home} />;
  return <CartaOnlineTable room={room} view={v} carta={v.carta} onLeft={home} />;
}

function CartaOnlineTable({ room, view, carta, onLeft }: { room: OnlineRoom; view: RoomView; carta: CartaView; onLeft: () => void }) {
  const { preferences } = usePreferences();
  const [scenario] = useState<ScenarioId>(() => pickScenario(preferences.scenario, null));
  const [error, setError] = useState<string | null>(null);
  const state = useMemo(() => withDeck(carta), [carta]);
  const you = view.you;
  useGameSounds(state, you);

  const dispatch = useCallback(
    (action: GameAction): ActionResult => {
      // Rounds deal by themselves on the server; a new game after the last round is the host's rematch.
      if (action.type === 'START_GAME') return { ok: true, state };
      if (action.type === 'RESTART_GAME') {
        void room.send({ op: 'rematch' });
        return { ok: true, state };
      }
      const check = validateAction(state, action);
      if (!check.valid) return { ok: false, error: check.error, state };
      void room.act(action as unknown as Record<string, unknown>).then((r) => setError(r.ok ? null : (r.detail ?? r.code ?? null)));
      return { ok: true, state };
    },
    [state, room]
  );

  const leave = async () => {
    await room.send({ op: 'leave' });
    onLeft();
  };

  const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex]?.id;
  return (
    <GameTable
      state={state}
      localPlayerId={you}
      dispatch={dispatch}
      onExit={() => void leave()}
      engineError={error}
      scenario={scenario}
      banner={<OnlineBar view={view} link={room.link} error={room.error} myTurn={actor === you} />}
    />
  );
}

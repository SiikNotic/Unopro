import { useState } from 'react';
import type { GameState } from '@/game/engine';
import { cardLabel, getTopCard } from '@/game/engine';

/** Development-only view of the raw engine state. Rendered only when import.meta.env.DEV is true. */
export function DebugPanel({ state }: { state: GameState }) {
  const [showState, setShowState] = useState(false);
  const top = getTopCard(state);
  const current = state.players[state.currentPlayerIndex];

  const rows: [string, string][] = [
    ['status', state.status],
    ['round / turn', `${state.roundNumber} / ${state.turnNumber}`],
    ['current player', `${current.name} (${current.id})`],
    ['direction', state.direction],
    ['current color', state.currentColor ?? '—'],
    ['top card', top ? `${cardLabel(top)} (${top.id})` : '—'],
    ['deck size', String(state.deck.length)],
    ['discard pile', `${state.discardPile.length}: ${state.discardPile.slice(-5).map(cardLabel).join(', ')}`],
    ['pending draw', String(state.pendingDraw)],
    ['pending action', state.pendingAction ? JSON.stringify(state.pendingAction) : '—'],
    ['uno', JSON.stringify({ ...state.unoState, calls: state.unoState.calls.length })],
    ['hands', state.players.map((p) => `${p.id}:${p.cardsRemaining}`).join('  ')],
    ['scores', JSON.stringify(state.settings.teamMode ? state.teamScores : state.scores)],
    ['seed', String(state.seed)],
  ];

  return (
    <details className="mt-8 rounded-xl border border-amber-500/40 bg-black/60 p-3 text-xs font-mono text-amber-100" open>
      <summary className="cursor-pointer font-bold text-amber-400">DEBUG (dev only)</summary>
      <table className="mt-2 w-full">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="align-top">
              <td className="pr-3 text-amber-400 whitespace-nowrap">{k}</td>
              <td className="break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-3 font-bold text-amber-400">log ({state.log.length})</h4>
      <ol className="max-h-56 overflow-y-auto">
        {[...state.log].reverse().map((e) => (
          <li key={e.seq}>
            <span className="text-amber-500">#{e.seq} r{e.roundNumber} t{e.turnNumber} {e.type}</span> {e.message}
          </li>
        ))}
      </ol>

      <button type="button" className="mt-3 underline text-amber-400" onClick={() => setShowState((v) => !v)}>
        {showState ? 'hide' : 'show'} GameState JSON
      </button>
      {showState && <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(state, null, 2)}</pre>}
    </details>
  );
}

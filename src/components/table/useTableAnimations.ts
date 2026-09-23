import { useCallback, useLayoutEffect, useRef } from 'react';
import type { GameState } from '@/game/engine';
import { getTableEvents } from '@/game/table/events';
import type { TableEvents } from '@/game/table/events';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

// Keys of animatable elements: `card:<id>` (local hand), `seat:<playerId>`, `draw-pile`, `discard-top`.
type Rects = Map<string, DOMRect>;

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function delta(from: DOMRect, to: DOMRect) {
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: to.width > 0 ? from.width / to.width : 1,
  };
}

/**
 * FLIP animations driven by GameState changes: each render measures the registered elements,
 * and on the next state change moves elements from where things were to where they are now.
 * Purely visual — it reads events derived from the engine's state and never changes it.
 */
export function useTableAnimations(state: GameState, localPlayerId: string, onEvents?: (e: TableEvents, rects: Rects) => void) {
  const elements = useRef(new Map<string, HTMLElement>());
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const prevState = useRef<GameState | null>(null);
  const prevRects = useRef<Rects>(new Map());
  const ghostLayer = useRef<HTMLDivElement | null>(null);

  const register = useCallback((key: string) => {
    let cb = refCallbacks.current.get(key);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) elements.current.set(key, el);
        else elements.current.delete(key);
      };
      refCallbacks.current.set(key, cb);
    }
    return cb;
  }, []);

  const measure = useCallback((): Rects => {
    const rects: Rects = new Map();
    elements.current.forEach((el, key) => rects.set(key, el.getBoundingClientRect()));
    return rects;
  }, []);

  const fly = useCallback((from: DOMRect, to: DOMRect, delay: number) => {
    const source = elements.current.get('draw-pile');
    const layer = ghostLayer.current;
    if (!source || !layer) return;
    const ghost = source.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      pointerEvents: 'none',
      opacity: '0',
    });
    ghost.style.setProperty('--cw', `${from.width}px`);
    layer.appendChild(ghost);
    const { dx, dy } = delta(to, from);
    const scale = from.width > 0 ? Math.min(1, to.width / from.width) : 1;
    ghost
      .animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.2 },
        ],
        { duration: 380, delay, easing: EASE, fill: 'both' }
      )
      .finished.catch(() => undefined)
      .finally(() => ghost.remove());
  }, []);

  useLayoutEffect(() => {
    const prev = prevState.current;
    const before = prevRects.current;
    const events = getTableEvents(prev, state);
    const now = measure();
    const reduced = prefersReducedMotion();
    const get = (key: string) => elements.current.get(key);
    const drawPile = now.get('draw-pile');

    if (!reduced) {
      const localHand = state.players.find((p) => p.id === localPlayerId)?.hand ?? [];

      // Deal: every local card comes from the draw pile; a few ghosts fly to each opponent.
      if (events.dealt && drawPile) {
        localHand.forEach((card, i) => {
          const el = get(`card:${card.id}`);
          const to = now.get(`card:${card.id}`);
          if (!el || !to) return;
          const { dx, dy, scale } = delta(drawPile, to);
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-8deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 320, delay: i * 45, easing: EASE, fill: 'backwards' }
          );
        });
        state.players.forEach((p, seatIndex) => {
          const seat = now.get(`seat:${p.id}`);
          if (p.id === localPlayerId || !seat) return;
          for (let k = 0; k < 3; k++) fly(drawPile, seat, seatIndex * 60 + k * 90);
        });
      }

      // Play: the real top card of the discard pile travels from where it came from.
      if (events.played) {
        const target = get('discard-top');
        const to = now.get('discard-top');
        const from =
          events.played.playerId === localPlayerId
            ? before.get(`card:${events.played.card.id}`)
            : before.get(`seat:${events.played.playerId}`) ?? now.get(`seat:${events.played.playerId}`);
        if (target && to && from) {
          const { dx, dy, scale } = delta(from, to);
          target.animate(
            [{ transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-14deg)` }, { transform: 'none' }],
            { duration: 320, easing: EASE }
          );
        }
      }

      // Draw: new local cards slide in from the pile; opponents get a flying card back.
      if (!events.dealt && drawPile) {
        for (const d of events.drawn) {
          if (d.playerId === localPlayerId) {
            d.cardIds.forEach((id, i) => {
              const el = get(`card:${id}`);
              const to = now.get(`card:${id}`);
              if (!el || !to) return;
              const { dx, dy, scale } = delta(drawPile, to);
              el.animate(
                [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.3 }, { transform: 'none', opacity: 1 }],
                { duration: 360, delay: i * 70, easing: EASE, fill: 'backwards' }
              );
            });
          } else {
            const seat = now.get(`seat:${d.playerId}`);
            if (seat) for (let k = 0; k < Math.min(d.count, 4); k++) fly(drawPile, seat, k * 80);
          }
        }

        // Remaining hand cards glide to their new slots.
        const drawnIds = new Set(events.drawn.flatMap((d) => d.cardIds));
        for (const card of localHand) {
          const key = `card:${card.id}`;
          const from = before.get(key);
          const to = now.get(key);
          const el = get(key);
          if (!from || !to || !el || drawnIds.has(card.id)) continue;
          const dx = from.left - to.left;
          if (Math.abs(dx) < 1) continue;
          el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: EASE });
        }
      }
    }

    onEvents?.(events, now);
    prevState.current = state;
    prevRects.current = now;
  }, [state, localPlayerId, measure, fly, onEvents]);

  // Keep "before" rects fresh when the layout moves without a state change (resize, scroll of the hand).
  const refreshRects = useCallback(() => {
    prevRects.current = measure();
  }, [measure]);

  return { register, ghostLayer, refreshRects };
}

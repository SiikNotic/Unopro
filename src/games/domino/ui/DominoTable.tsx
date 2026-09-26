import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleHelp, Hand, Layers } from 'lucide-react';
import { MusicButton } from '@/components/ui/MusicButton';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { useFeedback } from '@/games/shared/feedback';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { GameSceneBackground } from '@/games/shared/scenes/GameScenes';
import { FxLayer } from '@/games/shared/FxLayer';
import type { DominoScene } from '@/games/shared/setup';
import type { DominoAction, DominoEvent, DominoView, End, Tile } from '../engine';
import { DominoBoard } from './DominoBoard';
import type { GhostTarget } from './DominoBoard';
import { DominoTile } from './DominoTile';
import { DominoResult } from './DominoResult';
import { DominoRules } from './DominoRules';
import './domino.css';

/** Table colours per scene: wood of the rim, cloth of the playing surface. */
const TABLE: Record<DominoScene, Record<string, string>> = {
  salon: { '--wood-l': '#6a4125', '--wood': '#4a2c16', '--wood-d': '#26140a', '--cloth-l': '#1f6a52', '--cloth': '#134a39', '--cloth-d': '#0a2a20' },
  cafe: { '--wood-l': '#7a4a2a', '--wood': '#553018', '--wood-d': '#2a160a', '--cloth-l': '#7a2e2a', '--cloth': '#5a1f1c', '--cloth-d': '#2e0d0b' },
  terrace: { '--wood-l': '#a07a52', '--wood': '#7a5634', '--wood-d': '#3e2a16', '--cloth-l': '#1d7b82', '--cloth': '#125a61', '--cloth-d': '#08333a' },
  lounge: { '--wood-l': '#3a2618', '--wood': '#24160c', '--wood-d': '#100904', '--cloth-l': '#224a5a', '--cloth': '#15323f', '--cloth-d': '#0a1a22' },
  woodhouse: { '--wood-l': '#8a5a32', '--wood': '#6a4224', '--wood-d': '#3a2210', '--cloth-l': '#9a6a3c', '--cloth': '#7a5030', '--cloth-d': '#4a2e18' },
};

/**
 * Everything the table needs, whoever runs the match: this device (bots, pass-the-device) or the online
 * room server. The table never applies rules itself; it proposes actions through `act`.
 */
export interface DominoSession {
  /** What the person looking at the screen may see. */
  view: DominoView;
  /** Events of the latest change, and a counter that bumps with each change. */
  events: DominoEvent[];
  version: number;
  /** Proposes an action for the viewer's seat; resolves false if it was refused. */
  act: (action: DominoAction) => boolean | Promise<boolean>;
  /** Seats played by people on this device (their wins are "ours"). */
  mine: string[];
  scene: DominoScene;
  /** Pass-the-device: the next person on this device must take it before their tiles show. */
  curtain: { name: string; reveal: () => void } | null;
  /** Hot seat hides the hand between turns. */
  hideHandWhenIdle: boolean;
  /** Start a whole new match (null: not available to this viewer). */
  onRematch: (() => void) | null;
  onExit: () => void;
  onBack: () => void;
  /** Local bots wait while a sheet is open. */
  onSheet?: (open: boolean) => void;
  /** Extra line under the header (online connection, turn timer…). */
  banner?: ReactNode;
}

type Bubble = { id: number; seat: string; text: string };

export function DominoTable({ session }: { session: DominoSession }) {
  const { view, events, version, act, mine, scene, curtain, hideHandWhenIdle } = session;
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const reduced = useReducedMotion();
  const animate = preferences.animations && !reduced;
  const { width: vw, height: vh } = useViewport();
  // A phone on its side: the table takes the left and your tiles a column on the right, so everything
  // (opponents, line, hand, actions) fits the short screen without scrolling or covering each other.
  const side = vw > vh && vh < 560 && vw >= 600;
  const sideWidth = Math.round(Math.max(230, Math.min(380, vw * 0.34)));
  const fire = useFeedback('domino');
  useGameMusic('domino');

  const [sheet, setSheetState] = useState<'rules' | 'result' | null>(null);
  const setSheet = (s: 'rules' | 'result' | null) => {
    setSheetState(s);
    session.onSheet?.(s !== null);
  };
  const viewer = view.me;
  const current = view.seats.find((x) => x.id === view.currentId)!;
  const myTurn = view.status === 'playing' && current.id === viewer && !curtain;
  const showHand = !hideHandWhenIdle || myTurn;
  const hotSeat = hideHandWhenIdle;

  // ---------- selection & play ----------
  const [selected, setSelected] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const handRefs = useRef(new Map<string, HTMLButtonElement>());
  const seatRefs = useRef(new Map<string, HTMLElement>());
  const flight = useRef<DOMRect | null>(null);
  useEffect(() => setSelected(null), [view.turn]);

  const playsFor = (tile: Tile) => view.legal.filter((a): a is Extract<DominoAction, { type: 'PLAY_TILE' }> => a.type === 'PLAY_TILE' && a.tileId === tile.id);
  const ends = view.line.length ? { left: view.line[0].left, right: view.line[view.line.length - 1].right } : null;

  const play = (tile: Tile, end: End) => {
    flight.current = handRefs.current.get(tile.id)?.getBoundingClientRect() ?? null;
    setSelected(null);
    void Promise.resolve(act({ type: 'PLAY_TILE', playerId: viewer, tileId: tile.id, end })).then((ok) => ok || fire('invalid'));
  };

  const onTile = (tile: Tile) => {
    if (!myTurn) {
      setShake(tile.id);
      setHint(t('domino.wait'));
      return;
    }
    const plays = playsFor(tile);
    if (plays.length === 0) {
      setShake(tile.id);
      setHint(view.legal.some((a) => a.type === 'PLAY_TILE') ? t('domino.noFit') : view.legal[0]?.type === 'DRAW' ? t('domino.mustDraw') : t('domino.mustPass'));
      fire('invalid');
      return;
    }
    setHint(null);
    // One placement (or both ends show the same pip): play straight away. Two: lift it and show where.
    if (plays.length === 1 || (ends && ends.left === ends.right)) return play(tile, plays[plays.length - 1].end);
    if (selected === tile.id) return setSelected(null);
    fire('select');
    setSelected(tile.id);
  };
  useEffect(() => {
    if (!shake) return;
    const id = window.setTimeout(() => setShake(null), 400);
    return () => window.clearTimeout(id);
  }, [shake]);

  const draw = () => {
    flight.current = null;
    void Promise.resolve(act({ type: 'DRAW', playerId: viewer })).then((ok) => ok || fire('invalid'));
  };
  const pass = () => {
    void Promise.resolve(act({ type: 'PASS', playerId: viewer })).then((ok) => ok || fire('invalid'));
  };

  // ---------- events → sound, bubbles, result ----------
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [drawnId, setDrawnId] = useState<string | null>(null);
  const [dealKey, setDealKey] = useState(0);
  const prevHand = useRef<string[]>(view.hand.map((x) => x.id));
  useEffect(() => {
    let bubbleId = Date.now();
    for (const e of events) {
      if (e.type === 'played') {
        if (e.playerId !== viewer) flight.current = seatRefs.current.get(e.playerId)?.getBoundingClientRect() ?? null;
        fire('placed', { delay: animate ? 0.36 : 0 });
      } else if (e.type === 'drew') {
        fire('draw');
        if (e.playerId !== viewer) setBubbles((b) => [...b, { id: bubbleId++, seat: e.playerId, text: t('domino.drew') }]);
      } else if (e.type === 'passed') {
        fire('pass');
        setBubbles((b) => [...b, { id: bubbleId++, seat: e.playerId, text: t('domino.passed') }]);
      } else if (e.type === 'turn') {
        if (e.playerId === viewer || (hotSeat && mine.includes(e.playerId))) fire('turn', { delay: 0.3 });
      } else if (e.type === 'dealt') {
        fire('deal');
        setDealKey((k) => k + 1);
      } else if (e.type === 'round_over') {
        const won = e.result.winnerId !== null && mine.includes(e.result.winnerId);
        window.setTimeout(() => fire(won ? 'roundWon' : 'roundLost'), 500);
        window.setTimeout(() => setSheet('result'), animate ? 900 : 200);
      } else if (e.type === 'game_over') {
        const won = e.winners.some((w) => mine.includes(w));
        window.setTimeout(() => fire(won ? 'gameWon' : 'gameLost'), 900);
      }
    }
    // A tile that just arrived in the hand (drawn) slides in.
    const ids = view.hand.map((x) => x.id);
    const added = ids.filter((id) => !prevHand.current.includes(id));
    if (added.length === 1 && prevHand.current.length > 0 && events.some((e) => e.type === 'drew')) setDrawnId(added[0]);
    prevHand.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts once per applied action
  }, [version]);
  useEffect(() => {
    if (!bubbles.length) return;
    const id = window.setTimeout(() => setBubbles((b) => b.slice(1)), 1600);
    return () => window.clearTimeout(id);
  }, [bubbles]);

  const nextRound = () => {
    setSheet(null);
    void act({ type: 'NEXT_ROUND', playerId: viewer });
  };
  const newMatch = session.onRematch
    ? () => {
        setSheet(null);
        setDealKey((k) => k + 1);
        session.onRematch?.();
      }
    : null;
  // A result sheet left open when the next round starts (e.g. online, started by someone else) closes.
  useEffect(() => {
    if (view.status === 'playing') setSheetState((s) => (s === 'result' ? null : s));
  }, [view.status]);

  // ---------- layout ----------
  const handCount = view.hand.length;
  const gap = vw < 360 || side ? 5 : 8;
  let perRow: number;
  let tileSize: number;
  if (side) {
    // Two rows of tiles at most in the side column, sized by the screen's height.
    const handWidth = sideWidth - 20;
    const tallest = Math.max(22, Math.min(36, Math.floor((vh - 170) / 4.6)));
    perRow = Math.max(1, Math.min(handCount, Math.max(Math.ceil(handCount / 2), Math.floor((handWidth + gap) / (tallest + gap)))));
    tileSize = Math.round(Math.max(18, Math.min(tallest, (handWidth - gap * (perRow - 1)) / perRow)));
  } else {
    perRow = handCount > 9 ? Math.ceil(handCount / 2) : Math.max(handCount, 1);
    const handWidth = Math.min(vw, 760) - 28;
    tileSize = Math.round(Math.max(24, Math.min(vw >= 768 ? 44 : 38, (handWidth - gap * (perRow - 1)) / perRow)));
  }
  // Everyone else, in turn order starting after the viewer.
  const at = view.seats.findIndex((s) => s.id === viewer);
  const others = [...view.seats.slice(at + 1), ...view.seats.slice(0, at)].map((s) => s.id);

  const selectedTile = view.hand.find((x) => x.id === selected) ?? null;
  const ghosts: GhostTarget[] = selectedTile
    ? playsFor(selectedTile).map((p) => ({ end: p.end, label: t(p.end === 'left' ? 'domino.placeLeft' : 'domino.placeRight') }))
    : [];
  const canDraw = myTurn && view.legal[0]?.type === 'DRAW';
  const mustPass = myTurn && view.legal[0]?.type === 'PASS';

  let status: string;
  if (view.status !== 'playing') status = t('domino.roundOver');
  else if (curtain) status = t('domino.passDevice', { name: curtain.name });
  else if (myTurn) status = hint ?? (view.line.length === 0 ? t('domino.youLead') : canDraw ? t('domino.mustDraw') : mustPass ? t('domino.mustPass') : selectedTile ? t('domino.chooseEnd') : t('domino.yourTurn'));
  else status = t('domino.thinking', { name: current.name });

  const seatView = (id: string) => view.seats.find((s) => s.id === id)!;

  return (
    <div className={`dm ${side ? 'is-side' : ''}`} style={{ ...(TABLE[scene] as React.CSSProperties), '--dm-side': `${sideWidth}px` } as React.CSSProperties}>
      <GameSceneBackground scene={scene} />
      <FxLayer kind="gold" colors={['#f3dfae', '#d9b56a', '#fff7e6', '#b98b3e']} />
      <header className="dm-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={session.onBack} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="dm-title">
          <strong>{t('hub.domino.name')}</strong>
          <span>{t('domino.roundOf', { n: view.round, target: view.targetScore })}</span>
        </div>
        <MusicButton className="!w-11 !h-11 !rounded-xl" />
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setSheet('rules')} aria-label={t('domino.rulesTitle')}>
          <CircleHelp className="w-5 h-5" />
        </button>
      </header>
      {session.banner}

      <div className="dm-main">
        <div className="dm-row" role="list" aria-label={t('domino.opponents')}>
          {others.map((id) => {
            const s = seatView(id);
            const isTurn = view.status === 'playing' && current.id === id;
            return (
              <div
                key={id}
                role="listitem"
                ref={(el) => {
                  if (el) seatRefs.current.set(id, el);
                }}
                className={`dm-seat ${isTurn ? 'is-turn' : ''}`}
                aria-label={t('domino.seatAria', { name: s.name, tiles: s.tiles, score: s.score })}
                aria-current={isTurn ? 'true' : undefined}
              >
                <span className="dm-avatar">{s.name.slice(0, 1).toUpperCase()}</span>
                <span className="dm-seat-name">
                  <b>{s.name}</b>
                  <small>{s.tiles === 1 ? t('domino.tilesShortOne') : t('domino.tilesShort', { n: s.tiles })}</small>
                </span>
                <span className="dm-score" aria-hidden>
                  {s.score}
                </span>
                {vw >= 420 && others.length <= 2 && (
                  <span className="dm-backs" aria-hidden>
                    {Array.from({ length: Math.min(s.tiles, 7) }, (_, i) => (
                      <DominoTile key={i} faceDown size={11} />
                    ))}
                  </span>
                )}
                {bubbles
                  .filter((b) => b.seat === id)
                  .slice(-1)
                  .map((b) => (
                    <span key={b.id} className="dm-bubble" role="status">
                      {b.text}
                    </span>
                  ))}
              </div>
            );
          })}
        </div>

        <div className="dm-table">
          <DominoBoard
            line={view.line}
            ghostTile={selectedTile}
            ghosts={ghosts.length > 1 ? ghosts : []}
            onGhost={(end) => selectedTile && play(selectedTile, end)}
            flightFrom={() => flight.current}
            animate={animate}
            emptyLabel={view.status === 'playing' ? (myTurn ? t('domino.youLead') : t('domino.waitingLead', { name: current.name })) : ''}
            reserveBottom={view.boneyardCount > 0 || view.seats.length < 4 ? 50 : 0}
          >
            {view.boneyardCount > 0 || view.seats.length < 4 ? (
              canDraw ? (
                <button type="button" className="dm-yard is-live" onClick={draw} aria-label={t('domino.drawAria', { n: view.boneyardCount })}>
                  <span className="dm-backs" aria-hidden>
                    {Array.from({ length: Math.min(3, view.boneyardCount) }, (_, i) => (
                      <DominoTile key={i} faceDown size={12} />
                    ))}
                  </span>
                  {t('domino.draw')} · {view.boneyardCount}
                </button>
              ) : (
                <div className="dm-yard" aria-label={t('domino.yardAria', { n: view.boneyardCount })}>
                  <span className="dm-backs" aria-hidden>
                    {Array.from({ length: Math.min(3, view.boneyardCount) }, (_, i) => (
                      <DominoTile key={i} faceDown size={12} />
                    ))}
                  </span>
                  <Layers className="w-3.5 h-3.5 opacity-70" aria-hidden /> {view.boneyardCount}
                </div>
              )
            ) : null}
          </DominoBoard>
        </div>

        <div className="dm-hand-wrap">
          <p className={`dm-status ${myTurn ? 'is-you' : ''}`} role="status" aria-live="polite">
            {status}
          </p>
          {showHand ? (
            <div className="dm-hand" style={{ '--gap': `${gap}px`, maxWidth: perRow * (tileSize + gap) + 4, margin: '0 auto' } as React.CSSProperties} role="group" aria-label={t('domino.yourTiles', { name: seatView(viewer).name })}>
              {view.hand.map((tile, i) => {
                const playable = myTurn && playsFor(tile).length > 0;
                return (
                  <button
                    key={`${dealKey}-${tile.id}`}
                    ref={(el) => {
                      if (el) handRefs.current.set(tile.id, el);
                      else handRefs.current.delete(tile.id);
                    }}
                    type="button"
                    className={`dm-htile ${selected === tile.id ? 'is-selected' : ''} ${myTurn && !playable ? 'is-dim' : ''} ${shake === tile.id ? 'is-shake' : ''} ${drawnId === tile.id ? 'is-new' : ''} ${animate && dealKey > 0 && !drawnId ? 'is-deal' : ''}`}
                    style={{ '--t': `${tileSize}px`, animationDelay: animate && !drawnId ? `${i * 55}ms` : undefined } as React.CSSProperties}
                    aria-pressed={selected === tile.id}
                    aria-label={t(playable ? 'domino.tileAriaPlayable' : 'domino.tileAria', { a: tile.a, b: tile.b })}
                    onClick={() => onTile(tile)}
                    onAnimationEnd={() => drawnId === tile.id && setDrawnId(null)}
                  >
                    <DominoTile top={tile.a} bottom={tile.b} size={tileSize} seed={tile.id} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="dm-hand" aria-hidden>
              {Array.from({ length: seatView(viewer).tiles }, (_, i) => (
                <DominoTile key={i} faceDown size={Math.min(tileSize, 28)} />
              ))}
            </div>
          )}
          {(canDraw || mustPass) && (
            <div className="dm-actions">
              {canDraw && (
                <button type="button" className="cz-btn cz-btn-primary cz-btn-game" onClick={draw}>
                  <Layers className="w-5 h-5" /> {t('domino.drawN', { n: view.boneyardCount })}
                </button>
              )}
              {mustPass && (
                <button type="button" className="cz-btn cz-btn-primary cz-btn-game" onClick={pass}>
                  <Hand className="w-5 h-5" /> {t('domino.pass')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {curtain && sheet === null && (
        <div className="dm-curtain" role="dialog" aria-modal="true" aria-labelledby="dm-curtain-title">
          <div className="max-w-sm">
            <p className="cz-label">{t('domino.hotSeat')}</p>
            <h2 id="dm-curtain-title" className="mt-2">
              {t('domino.turnOf', { name: curtain.name })}
            </h2>
            <p className="mt-2 text-sm text-white/70">{t('domino.curtainHint')}</p>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg mt-6 w-full" autoFocus onClick={curtain.reveal}>
              {t('domino.showMyTiles')}
            </button>
          </div>
        </div>
      )}

      {sheet === 'rules' && (
        <Sheet title={t('domino.rulesTitle')} onClose={() => setSheet(null)}>
          <DominoRules />
        </Sheet>
      )}
      {sheet === 'result' && view.lastResult && <DominoResult view={view} mine={mine} onNext={nextRound} onRematch={newMatch} onExit={session.onExit} />}
    </div>
  );
}

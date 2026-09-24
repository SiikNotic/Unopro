import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Hand, Layers } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { MusicButton } from '@/components/ui/MusicButton';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { newMatchSeed } from '@/games/shared/rng';
import { useLocalMatch } from '@/games/shared/useLocalMatch';
import { useFeedback } from '@/games/shared/feedback';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { GameSceneBackground } from '@/games/shared/scenes/GameScenes';
import { FxLayer } from '@/games/shared/FxLayer';
import { DOMINO_SCENES, loadDominoSetup, pickScene } from '@/games/shared/setup';
import type { DominoScene } from '@/games/shared/setup';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import { createDomino, dominoRules, rematch } from '../engine';
import type { DominoAction, DominoState, DominoView, End, Tile } from '../engine';
import { dominoBotDriver } from '../bots/dominoBot';
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

type Bubble = { id: number; seat: string; text: string };

export function DominoScreen() {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const { preferences } = usePreferences();
  const reduced = useReducedMotion();
  const animate = preferences.animations && !reduced;
  const vw = useViewport().width;
  const fire = useFeedback('domino');
  useGameMusic('domino');

  const setup = useMemo(() => loadDominoSetup(), []);
  const scene = useMemo(() => pickScene(setup.scene, DOMINO_SCENES, 'games.domino.lastScene'), [setup.scene]);
  const seats = useMemo(() => {
    let bot = 0;
    let human = 1;
    return Array.from({ length: setup.seats }, (_, i) => {
      if (i === 0) return { id: 'you', name: t('games.you'), kind: 'human' as const };
      const kind = setup.others[i - 1] === 'local' ? ('human' as const) : ('bot' as const);
      return { id: `s${i}`, name: kind === 'human' ? t('games.player', { n: ++human }) : t('games.bot', { n: ++bot }), kind };
    });
  }, [setup, t]);
  const localHumans = useMemo(() => seats.filter((s) => s.kind === 'human').map((s) => s.id), [seats]);
  const hotSeat = localHumans.length > 1;

  const matchSeed = useRef(newMatchSeed());
  const drivers = useMemo(() => {
    const out: Record<string, SeatDriver<DominoView, DominoAction>> = {};
    seats.forEach((s, i) => {
      if (s.kind === 'bot') out[s.id] = dominoBotDriver(setup.difficulty, matchSeed.current + i);
    });
    return out;
  }, [seats, setup.difficulty]);

  const [sheet, setSheet] = useState<'rules' | 'result' | null>(null);
  const [viewer, setViewer] = useState('you');
  const actorsOf = useCallback((s: DominoState) => (s.status === 'playing' ? [s.players[s.current].id] : []), []);
  const match = useLocalMatch(dominoRules, () => createDomino({ seats, seed: matchSeed.current, targetScore: setup.target }), drivers, {
    paused: sheet !== null,
    actorsOf,
  });
  const state = match.state;
  const current = state.players[state.current];
  // Hot seat: when another person on this device is up, hide the hand until they take the device.
  const curtain = hotSeat && state.status === 'playing' && current.kind === 'human' && current.id !== viewer;
  const view = match.view(viewer);
  const myTurn = state.status === 'playing' && current.id === viewer && !curtain;
  const showHand = !hotSeat || (myTurn && !curtain);

  // ---------- selection & play ----------
  const [selected, setSelected] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const handRefs = useRef(new Map<string, HTMLButtonElement>());
  const seatRefs = useRef(new Map<string, HTMLElement>());
  const flight = useRef<DOMRect | null>(null);
  useEffect(() => setSelected(null), [state.turn]);

  const playsFor = (tile: Tile) => view.legal.filter((a): a is Extract<DominoAction, { type: 'PLAY_TILE' }> => a.type === 'PLAY_TILE' && a.tileId === tile.id);
  const ends = view.line.length ? { left: view.line[0].left, right: view.line[view.line.length - 1].right } : null;

  const play = (tile: Tile, end: End) => {
    flight.current = handRefs.current.get(tile.id)?.getBoundingClientRect() ?? null;
    const r = match.act(viewer, { type: 'PLAY_TILE', playerId: viewer, tileId: tile.id, end });
    if (!r.ok) fire('invalid');
    setSelected(null);
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
    const r = match.act(viewer, { type: 'DRAW', playerId: viewer });
    if (!r.ok) fire('invalid');
  };
  const pass = () => {
    const r = match.act(viewer, { type: 'PASS', playerId: viewer });
    if (!r.ok) fire('invalid');
  };

  // ---------- events → sound, bubbles, result ----------
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [drawnId, setDrawnId] = useState<string | null>(null);
  const [dealKey, setDealKey] = useState(0);
  const prevHand = useRef<string[]>(view.hand.map((x) => x.id));
  useEffect(() => {
    let bubbleId = Date.now();
    for (const e of match.events) {
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
        if (e.playerId === viewer || (hotSeat && localHumans.includes(e.playerId))) fire('turn', { delay: 0.3 });
      } else if (e.type === 'dealt') {
        fire('deal');
        setDealKey((k) => k + 1);
      } else if (e.type === 'round_over') {
        const won = e.result.winnerId !== null && localHumans.includes(e.result.winnerId);
        window.setTimeout(() => fire(won ? 'roundWon' : 'roundLost'), 500);
        window.setTimeout(() => setSheet('result'), animate ? 900 : 200);
      } else if (e.type === 'game_over') {
        const won = e.winners.some((w) => localHumans.includes(w));
        window.setTimeout(() => fire(won ? 'gameWon' : 'gameLost'), 900);
      }
    }
    // A tile that just arrived in the hand (drawn) slides in.
    const ids = match.view(viewer).hand.map((x) => x.id);
    const added = ids.filter((id) => !prevHand.current.includes(id));
    if (added.length === 1 && prevHand.current.length > 0 && match.events.some((e) => e.type === 'drew')) setDrawnId(added[0]);
    prevHand.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts once per applied action
  }, [match.version]);
  useEffect(() => {
    if (!bubbles.length) return;
    const id = window.setTimeout(() => setBubbles((b) => b.slice(1)), 1600);
    return () => window.clearTimeout(id);
  }, [bubbles]);

  const nextRound = () => {
    setSheet(null);
    match.act('you', { type: 'NEXT_ROUND', playerId: 'you' });
  };
  const newMatch = () => {
    setSheet(null);
    matchSeed.current = newMatchSeed();
    match.reset(rematch(state, matchSeed.current));
    setDealKey((k) => k + 1);
    setViewer('you');
  };

  // ---------- layout ----------
  const handCount = view.hand.length;
  const perRow = handCount > 9 ? Math.ceil(handCount / 2) : Math.max(handCount, 1);
  const handWidth = Math.min(vw, 760) - 28;
  const gap = vw < 360 ? 5 : 8;
  const tileSize = Math.round(Math.max(24, Math.min(vw >= 768 ? 44 : 38, (handWidth - gap * (perRow - 1)) / perRow)));
  const opponents = seats.slice(1).map((s) => s.id);
  const order = [...seats.slice(seats.findIndex((s) => s.id === viewer) + 1), ...seats.slice(0, seats.findIndex((s) => s.id === viewer))].map((s) => s.id);
  const others = hotSeat ? order : opponents;

  const selectedTile = view.hand.find((x) => x.id === selected) ?? null;
  const ghosts: GhostTarget[] = selectedTile
    ? playsFor(selectedTile).map((p) => ({ end: p.end, label: t(p.end === 'left' ? 'domino.placeLeft' : 'domino.placeRight') }))
    : [];
  const canDraw = myTurn && view.legal[0]?.type === 'DRAW';
  const mustPass = myTurn && view.legal[0]?.type === 'PASS';

  let status: string;
  if (state.status !== 'playing') status = t('domino.roundOver');
  else if (curtain) status = t('domino.passDevice', { name: current.name });
  else if (myTurn) status = hint ?? (view.line.length === 0 ? t('domino.youLead') : canDraw ? t('domino.mustDraw') : mustPass ? t('domino.mustPass') : selectedTile ? t('domino.chooseEnd') : t('domino.yourTurn'));
  else status = t('domino.thinking', { name: current.name });

  const seatView = (id: string) => view.seats.find((s) => s.id === id)!;

  return (
    <div className="dm" style={TABLE[scene] as React.CSSProperties}>
      <GameSceneBackground scene={scene} />
      <FxLayer kind="gold" colors={['#f3dfae', '#d9b56a', '#fff7e6', '#b98b3e']} />
      <header className="dm-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back('dominoSetup')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="dm-title">
          <strong>{t('hub.domino.name')}</strong>
          <span>{t('domino.roundOf', { n: state.round, target: state.settings.targetScore })}</span>
        </div>
        <MusicButton className="!w-11 !h-11 !rounded-xl" />
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setSheet('rules')} aria-label={t('domino.rulesTitle')}>
          <CircleHelp className="w-5 h-5" />
        </button>
      </header>

      <div className="dm-main">
        <div className="dm-row" role="list" aria-label={t('domino.opponents')}>
          {others.map((id) => {
            const s = seatView(id);
            const isTurn = state.status === 'playing' && current.id === id;
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
            emptyLabel={state.status === 'playing' ? (myTurn ? t('domino.youLead') : t('domino.waitingLead', { name: current.name })) : ''}
          >
            {view.boneyardCount > 0 || state.players.length < 4 ? (
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
              {t('domino.turnOf', { name: current.name })}
            </h2>
            <p className="mt-2 text-sm text-white/70">{t('domino.curtainHint')}</p>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-lg mt-6 w-full" autoFocus onClick={() => setViewer(current.id)}>
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
      {sheet === 'result' && state.lastResult && (
        <DominoResult state={state} localHumans={localHumans} onNext={nextRound} onRematch={newMatch} onExit={() => navigate('dominoSetup', {}, { replace: true })} />
      )}
    </div>
  );
}

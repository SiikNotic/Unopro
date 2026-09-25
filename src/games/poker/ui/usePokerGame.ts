// Plays a poker table against bots: the engine state (authoritative, never rendered directly) and the
// visual state (what the table shows, updated event by event so chips and cards can animate). Event-driven:
// timeouts only while something animates or a bot "thinks"; all cleared on unmount.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayingCard } from '@/casino/cards';
import { newMatchSeed } from '@/games/shared/rng';
import { applyAction, createTable, decide, legalActions, pokerView, potTotal, startHand } from '../engine';
import type { HandResult, Legal, PokerAction, PokerDifficulty, PokerEvent, PokerState } from '../engine';
import { playPoker } from './pokerAudio';

export const HUMAN = 'you';

export interface SeatDisplay {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  /** Cards to draw: face up (yours, or shown at showdown), null = face down, [] = none. */
  cards: PlayingCard[] | null;
  action: { type: PokerAction['type']; amount: number } | null;
  winner: boolean;
}

export interface Display {
  seats: SeatDisplay[];
  board: PlayingCard[];
  pot: number;
  toAct: number;
  dealer: number;
  handNo: number;
  phase: 'betting' | 'showdown' | 'handOver' | 'gameOver';
  collecting: boolean;
  /** Pot being pushed to the winner(s). */
  paying: string[] | null;
  result: HandResult | null;
}

export interface TableSetup {
  players: number;
  stack: number;
  smallBlind: number;
  bigBlind: number;
  difficulty: PokerDifficulty;
}

function fromState(s: PokerState, result: HandResult | null, prev?: Display): Display {
  const bets = s.players.reduce((t, p) => t + p.bet, 0);
  return {
    seats: s.players.map((p) => {
      const old = prev?.seats.find((x) => x.id === p.id);
      const shown = result?.shown[p.id];
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        stack: p.stack,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        out: p.out,
        cards: p.id === HUMAN ? p.hole : shown ?? (p.out || p.hole.length === 0 ? [] : null),
        action: old?.action ?? null,
        winner: !!result?.pots.some((pot) => pot.winners.includes(p.id)),
      };
    }),
    board: s.board.slice(),
    pot: potTotal(s) - bets,
    toAct: s.toAct,
    dealer: s.dealer,
    handNo: s.handNo,
    phase: s.phase === 'gameOver' ? 'gameOver' : s.phase === 'handOver' ? 'handOver' : 'betting',
    collecting: false,
    paying: null,
    result,
  };
}

export function usePokerGame(setup: TableSetup, opts: { reduced: boolean; names: string[] }) {
  const engine = useRef<PokerState>(null as unknown as PokerState);
  const botSeed = useRef(newMatchSeed());
  if (!engine.current) {
    engine.current = createTable({
      seats: Array.from({ length: setup.players }, (_, i) => ({ id: i === 0 ? HUMAN : `bot${i}`, name: opts.names[i], kind: i === 0 ? 'human' : 'bot' })),
      stack: setup.stack,
      smallBlind: setup.smallBlind,
      bigBlind: setup.bigBlind,
      seed: newMatchSeed(),
    }).state;
  }
  const [display, setDisplayState] = useState<Display>(() => fromState(engine.current, null));
  const displayRef = useRef(display);
  const [busy, setBusyState] = useState(true);
  const busyRef = useRef(true);
  const [tick, setTick] = useState(0);
  const timers = useRef(new Set<number>());
  const alive = useRef(true);
  const reduced = useRef(opts.reduced);
  reduced.current = opts.reduced;

  const show = (d: Display) => {
    displayRef.current = d;
    setDisplayState(d);
  };
  const setBusy = (b: boolean) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
    return id;
  };
  const pending = timers.current;
  const clearLater = (id: number) => {
    clearTimeout(id);
    pending.delete(id);
  };
  const wait = (ms: number) => new Promise<void>((res) => later(res, reduced.current ? Math.min(ms, 120) : ms));

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  /** Plays the events of one engine step, then syncs the view to the engine's state. */
  const play = async (events: PokerEvent[], final: PokerState) => {
    let d = displayRef.current;
    let result: HandResult | null = null;
    for (const ev of events) {
      if (!alive.current) return;
      if (ev.type === 'blinds' || ev.type === 'deal') {
        if (ev.type === 'deal') {
          d = fromState(final, null);
          d = { ...d, seats: d.seats.map((s) => ({ ...s, action: null })) };
          show(d);
          const cards = final.players.filter((p) => !p.out).length * 2;
          for (let i = 0; i < Math.min(cards, 6); i++) later(() => playPoker('deal'), i * 70);
          await wait(cards * 55 + 320);
        }
        continue;
      }
      if (ev.type === 'action') {
        const p = final.players.find((x) => x.id === ev.player)!;
        d = {
          ...d,
          seats: d.seats.map((s) => (s.id === ev.player ? { ...s, stack: s.stack - ev.amount, bet: s.bet + ev.amount, folded: ev.action === 'fold', allIn: p.allIn || s.allIn, action: { type: ev.action, amount: s.bet + ev.amount } } : s)),
        };
        show(d);
        playPoker(ev.action === 'fold' ? 'fold' : ev.action === 'check' ? 'check' : ev.action === 'call' ? 'call' : 'raise');
        await wait(200);
        continue;
      }
      if (ev.type === 'street') {
        if (d.seats.some((s) => s.bet > 0)) {
          d = { ...d, collecting: true };
          show(d);
          playPoker('chips');
          await wait(280);
        }
        d = {
          ...d,
          collecting: false,
          pot: d.pot + d.seats.reduce((t, s) => t + s.bet, 0),
          board: [...d.board, ...ev.cards],
          seats: d.seats.map((s) => ({ ...s, bet: 0, action: s.folded || s.allIn ? s.action : null })),
        };
        show(d);
        ev.cards.forEach((_, i) => later(() => playPoker('flip'), i * 110));
        await wait(ev.cards.length * 110 + 260);
        continue;
      }
      if (ev.type === 'handOver') {
        result = ev.result;
        const potNow = d.pot + d.seats.reduce((t, s) => t + s.bet, 0);
        if (d.seats.some((s) => s.bet > 0)) {
          show({ ...d, collecting: true });
          playPoker('chips');
          await wait(260);
        }
        d = { ...d, collecting: false, pot: potNow, seats: d.seats.map((s) => ({ ...s, bet: 0 })) };
        if (result.showdown) {
          d = { ...d, phase: 'showdown', seats: d.seats.map((s) => ({ ...s, cards: result!.shown[s.id] ?? s.cards })), result };
          show(d);
          playPoker('flip');
          await wait(750);
        }
        const winners = result.pots.flatMap((p) => p.winners);
        d = { ...fromState(final, result, d), pot: potNow, paying: winners };
        show(d);
        playPoker((result.net[HUMAN] ?? 0) > 0 ? 'win' : winners.includes(HUMAN) ? 'win' : 'chips');
        await wait(650);
        d = { ...d, pot: 0 };
        show(d);
        continue;
      }
      if (ev.type === 'gameOver') {
        d = { ...fromState(final, displayRef.current.result, d), phase: 'gameOver', paying: null };
        show(d);
        playPoker(ev.winner === HUMAN ? 'win' : 'lose');
      }
    }
    if (!alive.current) return;
    engine.current = final;
    if (final.phase === 'betting') show({ ...fromState(final, null, d), board: d.board.length === final.board.length ? d.board : final.board.slice() });
    else if (final.phase === 'handOver' && final.players.find((p) => p.id === HUMAN)!.stack <= 0) {
      // You are out of chips: the table is over for you.
      show({ ...displayRef.current, phase: 'gameOver' });
      playPoker('lose');
    }
    setBusy(false);
    setTick((n) => n + 1);
  };

  const run = async (res: { state: PokerState; events: PokerEvent[] }) => {
    setBusy(true);
    await play(res.events, res.state);
  };

  // First hand.
  useEffect(() => {
    void run({ state: engine.current, events: [{ type: 'deal' }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bots act after a short think; the next hand deals itself a moment after the last one ended.
  useEffect(() => {
    if (busyRef.current) return;
    const s = engine.current;
    if (s.phase === 'betting' && s.toAct >= 0 && s.players[s.toAct].kind === 'bot') {
      const id = s.players[s.toAct].id;
      const t = later(() => {
        const action = decide(pokerView(engine.current, id), setup.difficulty, botSeed.current);
        const r = applyAction(engine.current, id, action);
        if (r.ok) void run(r);
        else {
          // A bot never makes an illegal move (tested); fall back to check/fold just in case.
          const legal = legalActions(engine.current, engine.current.toAct);
          const safe = applyAction(engine.current, id, legal?.check ? { type: 'check' } : { type: 'fold' });
          if (safe.ok) void run(safe);
        }
      }, reduced.current ? 250 : 520 + (botSeed.current % 7) * 60);
      return () => clearLater(t);
    }
    if (s.phase === 'betting' && s.toAct >= 0 && s.players[s.toAct].kind === 'human') playPoker('turn');
    if (s.phase === 'handOver' && displayRef.current.phase !== 'gameOver') {
      const t = later(() => nextHand(), reduced.current ? 1200 : 2600);
      return () => clearLater(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const nextHand = useCallback(() => {
    if (busyRef.current || engine.current.phase !== 'handOver') return;
    void run(startHand(engine.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = useCallback((action: PokerAction) => {
    const s = engine.current;
    if (busyRef.current || s.phase !== 'betting' || s.players[s.toAct]?.id !== HUMAN) return false;
    const r = applyAction(s, HUMAN, action);
    if (!r.ok) return false;
    void run(r);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = engine.current;
  const myTurn = !busy && s.phase === 'betting' && s.players[s.toAct]?.id === HUMAN;
  const legal: Legal | null = myTurn ? legalActions(s, s.toAct) : null;
  return { display, legal, myTurn, busy, act, nextHand, bigBlind: setup.bigBlind, currentBet: s.currentBet, myBet: s.players[0].bet, livePot: potTotal(s) };
}

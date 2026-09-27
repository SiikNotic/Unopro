import { describe, expect, it } from 'vitest';
import { clampInput, createMatch, H, MALLET_R, MAX_TICKS, MID, PUCK_R, step, W, WIN_SCORE } from '../engine';
import type { MatchEvent, MatchState } from '../engine';
import { decodeLog, InputLog, replayMatch } from '../replay';
import { makeBot } from './sim';

function play(seed: number, level: 'easy' | 'normal' | 'hard', onTick?: (s: MatchState, ev: MatchEvent[]) => void) {
  const s = createMatch(seed, level);
  const bot = makeBot(10);
  const log = new InputLog();
  while (s.phase !== 'over') {
    const input = bot(s);
    log.push(input);
    const ev: MatchEvent[] = [];
    step(s, input, ev);
    onTick?.(s, ev);
  }
  return { s, log: log.encode(), ticks: log.ticks };
}

describe('air hockey physics', () => {
  it('keeps the puck on the table, under the speed limit, and the mallets in their halves', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      play(11, level, (s) => {
        if (s.phase === 'play') {
          const { x, y, vx, vy } = s.puck;
          expect(x).toBeGreaterThanOrEqual(PUCK_R - 1e-6);
          expect(x).toBeLessThanOrEqual(W - PUCK_R + 1e-6);
          expect(y).toBeGreaterThan(-PUCK_R);
          expect(y).toBeLessThan(H + PUCK_R);
          expect(Math.sqrt(vx * vx + vy * vy)).toBeLessThanOrEqual(2600 + 1e-6);
        }
        expect(s.player.y).toBeGreaterThanOrEqual(MID + MALLET_R - 1e-6);
        expect(s.ai.y).toBeLessThanOrEqual(MID - MALLET_R + 1e-6);
      });
    }
  });

  it('never lets the player cross the centre line, whatever the input', () => {
    expect(clampInput(500, 0).y).toBe(MID + MALLET_R);
    expect(clampInput(-900, 99999)).toEqual({ x: MALLET_R, y: H - MALLET_R });
    const s = createMatch(1, 'normal');
    for (let i = 0; i < 400; i++) step(s, { x: 500, y: -5000 });
    expect(s.player.y).toBeGreaterThanOrEqual(MID + MALLET_R);
  });

  it('bounces off a side wall', () => {
    const s = createMatch(1, 'easy');
    s.phase = 'play';
    s.puck = { x: 200, y: 1200, vx: -1500, vy: 0 };
    const ev: MatchEvent[] = [];
    for (let i = 0; i < 20; i++) step(s, { x: 900, y: 1600 }, ev);
    expect(s.puck.vx).toBeGreaterThan(0);
    expect(ev.some((e) => e.type === 'wall')).toBe(true);
  });

  it('a mallet strike sends the puck away', () => {
    const s = createMatch(1, 'easy');
    s.phase = 'play';
    s.puck = { x: 500, y: 1300, vx: 0, vy: 0 };
    s.player = { x: 500, y: 1500, vx: 0, vy: 0 };
    const ev: MatchEvent[] = [];
    for (let i = 0; i < 6; i++) step(s, { x: 500, y: 1100 }, ev);
    expect(s.puck.vy).toBeLessThan(-500);
    expect(ev.some((e) => e.type === 'hit' && e.by === 'player')).toBe(true);
  });

  it('scores a goal through the mouth, not through the wall beside it', () => {
    const s = createMatch(1, 'easy');
    s.phase = 'play';
    s.ai = { x: 900, y: 100, vx: 0, vy: 0 };
    s.mem = { ...s.mem, tx: 900, ty: 100, wait: 999 };
    s.puck = { x: 500, y: 300, vx: 0, vy: -2000 };
    const ev: MatchEvent[] = [];
    for (let i = 0; i < 30 && s.phase === 'play'; i++) step(s, { x: 500, y: 1600 }, ev);
    expect(ev.find((e) => e.type === 'goal')).toEqual({ type: 'goal', scorer: 'player' });
    expect(s.score).toEqual({ player: 1, ai: 0 });

    const t = createMatch(1, 'easy');
    t.phase = 'play';
    t.ai = { x: 900, y: 100, vx: 0, vy: 0 };
    t.mem = { ...t.mem, tx: 900, ty: 100, wait: 999 };
    t.puck = { x: 120, y: 300, vx: 0, vy: -2000 };
    for (let i = 0; i < 30; i++) step(t, { x: 500, y: 1600 });
    expect(t.score).toEqual({ player: 0, ai: 0 });
    expect(t.puck.vy).toBeGreaterThan(0);
  });

  it('nudges a dead puck back into play', () => {
    const s = createMatch(1, 'easy');
    s.phase = 'play';
    s.puck = { x: PUCK_R, y: H - PUCK_R, vx: 0, vy: 0 };
    for (let i = 0; i < 200; i++) step(s, { x: 900, y: MID + 200 });
    expect(Math.abs(s.puck.x - PUCK_R) + Math.abs(s.puck.y - (H - PUCK_R))).toBeGreaterThan(20);
  });

  it('ends when someone reaches 7 goals, with a countdown first', () => {
    const counts: number[] = [];
    const { s } = play(5, 'normal', (_s, ev) => ev.forEach((e) => e.type === 'count' && counts.push(e.n)));
    expect(counts.slice(0, 3)).toEqual([3, 2, 1]);
    expect(Math.max(s.score.player, s.score.ai)).toBe(WIN_SCORE);
    expect(s.outcome).toBe(s.score.player > s.score.ai ? 'won' : 'lost');
    expect(s.tick).toBeLessThan(MAX_TICKS);
  });

  it('the harder the AI, the fewer matches the same player wins', () => {
    const wins = (level: 'easy' | 'normal' | 'hard') => [1, 2, 3, 4, 5, 6].filter((seed) => play(seed * 7919, level).s.outcome === 'won').length;
    const easy = wins('easy');
    const hard = wins('hard');
    expect(easy).toBeGreaterThanOrEqual(5);
    expect(hard).toBeLessThanOrEqual(1);
  });
});

describe('air hockey replay (what the server checks)', () => {
  it('replays a match to exactly the same result', () => {
    const { s, log, ticks } = play(424242, 'normal');
    const r = replayMatch(424242, 'normal', log);
    expect(r).not.toBeNull();
    expect(r!.ticks).toBe(ticks);
    expect(r!.state.score).toEqual(s.score);
    expect(r!.state.outcome).toBe(s.outcome);
    expect(r!.state.puck).toEqual(s.puck);
    expect(log.length).toBeLessThan(60000);
  });

  it('a different seed or level is a different match', () => {
    const { log } = play(777, 'hard');
    expect(replayMatch(777, 'hard', log)).not.toBeNull();
    expect(replayMatch(778, 'hard', log)).toBeNull();
    expect(replayMatch(777, 'easy', log)).toBeNull();
  });

  it('refuses logs cut short, padded or malformed', () => {
    const { log } = play(99, 'easy');
    const inputs = decodeLog(log)!;
    const rebuild = (list: { x: number; y: number }[]) => {
      const l = new InputLog();
      list.forEach((i) => l.push(i));
      return l.encode();
    };
    expect(replayMatch(99, 'easy', rebuild(inputs))).not.toBeNull();
    expect(replayMatch(99, 'easy', rebuild(inputs.slice(0, -1)))).toBeNull();
    expect(replayMatch(99, 'easy', rebuild([...inputs, inputs[inputs.length - 1]]))).toBeNull();
    expect(replayMatch(99, 'easy', 'a1:@@@')).toBeNull();
    expect(replayMatch(99, 'easy', 'nope')).toBeNull();
    expect(replayMatch(99, 'easy', 42)).toBeNull();
    expect(replayMatch(99, 'easy', 'a1:' + 'A'.repeat(300000))).toBeNull();
  });

  it('round-trips inputs through the log format', () => {
    const list = [{ x: 500, y: 1530 }, { x: 500, y: 1530 }, { x: 501, y: 1400 }, { x: 60, y: 910 }, { x: 60, y: 910 }, { x: 940, y: 1640 }];
    const l = new InputLog();
    list.forEach((i) => l.push(i));
    expect(decodeLog(l.encode())).toEqual(list);
  });
});

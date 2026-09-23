import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '@/game/engine';
import { allExperiments } from '../experiments';
import { runBatch } from '../simulator';
import { checkInvariants } from '../invariants';
import { runLongGame } from '../longGame';
import { LINEUPS } from '../../__tests__/helpers';

describe('Bot simulator', () => {
  it('every experiment runs rounds to the end without failures', () => {
    for (const exp of allExperiments()) {
      const m = runBatch(exp, 6);
      expect(m.failures, exp.id).toEqual([]);
      expect(m.finished).toBe(6);
      expect(m.groups.A.roundsWon + m.groups.B.roundsWon).toBe(6);
    }
  });

  it('is deterministic: same seeds give identical metrics and decision sequences', () => {
    for (const exp of allExperiments().filter((_, i) => i % 5 === 0)) {
      const a = runBatch(exp, 15, 100);
      const b = runBatch(exp, 15, 100);
      expect(b).toEqual(a);
    }
  });

  it('different seeds give different games', () => {
    const exp = allExperiments()[0];
    expect(runBatch(exp, 15, 1).decisionHash).not.toBe(runBatch(exp, 15, 500).decisionHash);
  });

  it('the invariant oracle detects a corrupted state', () => {
    const s = createGame({ players: ['a', 'b', 'c'].map((id) => ({ id, name: id, type: 'BOT' as const })), seed: 3 });
    const action = { type: 'CALL_UNO' as const, playerId: 'a' };
    const next = applyAction(s, action).state;
    expect(checkInvariants(s, action, next)).toEqual([]);
    const broken = structuredClone(next);
    broken.players[0].hand.push(broken.deck.pop()!);
    broken.deck.push(broken.players[1].hand[0]);
    expect(checkInvariants(s, action, broken).length).toBeGreaterThan(0);
  });
});

describe('Long bot games', () => {
  const variants = [
    { players: 2 },
    { players: 4 },
    { players: 6 },
    { players: 4, teams: true },
    { players: 6, teams: true },
    { players: 4, settings: { stacking: true, drawUntilPlayable: true } },
    { players: 5, settings: { jumpIn: true, forcePlay: true } },
    { players: 3, settings: { stacking: true, jumpIn: true, drawUntilPlayable: true, forcePlay: true, unoPenalty: 4 } },
  ];

  it('play complete multi-round games to the target score in many configurations', () => {
    variants.forEach((v, i) => {
      for (const seed of [11 + i, 101 + i]) {
        const result = runLongGame({ seed, ...v, setups: [LINEUPS[(seed * 3) % 15], LINEUPS[(seed * 7 + 4) % 15]] });
        expect(result.failure, `seed ${seed} ${JSON.stringify(v)}`).toBeNull();
        expect(result.finished).toBe(true);
        expect(result.rounds).toBeGreaterThan(0);
      }
    });
  });
});

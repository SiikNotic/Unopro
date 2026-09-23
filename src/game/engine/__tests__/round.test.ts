import { describe, expect, it } from 'vitest';
import { createGame, playCard, restartGame, startNextRound } from '../game';
import { calculateRoundScore } from '../scoring';
import { drawTwo, num, ok, players, scenario, skip, wild } from './helpers';

function lastCardScenario(settings = {}) {
  const last = num('RED', 1);
  const s = scenario({
    hands: [[last], [num('BLUE', 7), skip('GREEN')], [wild(), num('YELLOW', 3)]],
    top: num('RED', 5),
    settings,
  });
  return { s, last };
}

describe('End of round', () => {
  it('ends when a player plays their last card', () => {
    const { s, last } = lastCardScenario();
    const over = ok(playCard(s, 'p0', last.id));
    expect(over.status).toBe('ROUND_OVER');
    expect(over.winnerId).toBe('p0');
    expect(over.players[0].hand).toHaveLength(0);
    expect(over.log.some((e) => e.type === 'ROUND_ENDED')).toBe(true);
  });

  it('scores the cards left in the other hands', () => {
    const { s, last } = lastCardScenario();
    const over = ok(playCard(s, 'p0', last.id));
    // p1: 7 + 20, p2: 50 + 3
    expect(over.rounds).toEqual([
      { roundNumber: 1, winnerId: 'p0', winningTeamId: null, points: 80, handPoints: { p0: 0, p1: 27, p2: 53 } },
    ]);
    expect(over.scores).toEqual({ p0: 80, p1: 0, p2: 0 });
  });

  it('calculateRoundScore is a pure function of the state', () => {
    const { s } = lastCardScenario();
    const result = calculateRoundScore(s, 'p1');
    expect(result.points).toBe(1 + 53);
    expect(result.handPoints.p1).toBe(27);
  });

  it('a final Draw Two still makes the next player draw before scoring', () => {
    const last = drawTwo('RED');
    const s = scenario({ hands: [[last], [num('BLUE', 7)], [num('YELLOW', 3)]], top: num('RED', 5), deck: [num('GREEN', 4), num('GREEN', 6)] });
    const over = ok(playCard(s, 'p0', last.id));
    expect(over.status).toBe('ROUND_OVER');
    expect(over.players[1].hand).toHaveLength(3);
    expect(over.rounds[0].points).toBe(7 + 4 + 6 + 3);
  });

  it('a final Wild ends the round once the color is chosen', () => {
    const last = wild();
    const s = scenario({ hands: [[last], [num('BLUE', 7)]], top: num('RED', 5) });
    const waiting = ok(playCard(s, 'p0', last.id));
    expect(waiting.status).toBe('PLAYING');
    const over = ok(playCard(s, 'p0', last.id, 'GREEN'));
    expect(over.status).toBe('ROUND_OVER');
  });

  it('rejects further play after the round is over', () => {
    const { s, last } = lastCardScenario();
    const over = ok(playCard(s, 'p0', last.id));
    expect(playCard(over, 'p1', over.players[1].hand[0].id).ok).toBe(false);
  });

  it('reaching the target score ends the game', () => {
    const { s, last } = lastCardScenario({ targetScore: 50 });
    const over = ok(playCard(s, 'p0', last.id));
    expect(over.status).toBe('GAME_OVER');
    expect(over.gameWinnerId).toBe('p0');
    expect(startNextRound(over).ok).toBe(false);
  });
});

describe('Next round / restart', () => {
  it('deals a new round, rotates the dealer and keeps the scores', () => {
    const { s, last } = lastCardScenario();
    const over = ok(playCard(s, 'p0', last.id));
    const next = ok(startNextRound(over));
    expect(next.status).toBe('PLAYING');
    expect(next.roundNumber).toBe(2);
    expect(next.dealerIndex).toBe((over.dealerIndex + 1) % 3);
    expect(next.winnerId).toBeNull();
    expect(next.scores).toEqual(over.scores);
    expect(next.deck.length + next.discardPile.length + next.players.reduce((n, p) => n + p.hand.length, 0)).toBe(108);
    expect(next.log.at(-1)?.roundNumber).toBe(2);
  });

  it('restartGame resets scores and starts again at round 1', () => {
    const { s, last } = lastCardScenario();
    const over = ok(playCard(s, 'p0', last.id));
    const fresh = ok(restartGame(over));
    expect(fresh.roundNumber).toBe(1);
    expect(fresh.scores).toEqual({ p0: 0, p1: 0, p2: 0 });
    expect(fresh.rounds).toEqual([]);
    expect(fresh.status).toBe('PLAYING');
  });

  it('cannot start a new round in the middle of one', () => {
    expect(startNextRound(createGame({ players: players(2), seed: 3 })).ok).toBe(false);
  });
});

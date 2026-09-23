import { describe, expect, it } from 'vitest';
import { areTeammates, createRng } from '@/game/engine';
import { num, scenario, skip } from '@/game/engine/__tests__/helpers';
import { createPlayerView } from '../playerView';
import { resolveProfile } from '../profiles';
import { chooseAction } from '../strategy';
import { simulateRound } from './helpers';

const teams = [
  { id: 'A', name: 'A' },
  { id: 'B', name: 'B' },
];
const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Bots in team mode', () => {
  it('know their teammate from teamId but never see the teammate’s cards', () => {
    const s = scenario({ hands: [fillers(), fillers(), fillers(), fillers()], top: num('RED', 5), settings: { teamMode: true }, teams, teamIds: ['A', 'B', 'A', 'B'] });
    const view = createPlayerView(s, 'p0');
    expect(areTeammates(view.state, 'p0', 'p2')).toBe(true);
    expect(areTeammates(view.state, 'p0', 'p1')).toBe(false);
    expect(view.state.players[2].hand).toEqual([]);
    expect(view.state.players[2].cardsRemaining).toBe(3);
  });

  it('does not Skip its own teammate when another play exists', () => {
    // Seats: p0 (A), p1 (A) next, p2 (B), p3 (B)
    const hit = skip('RED');
    const s = scenario({
      hands: [[hit, num('RED', 3), num('GREEN', 6), num('GREEN', 7)], [num('YELLOW', 2), num('YELLOW', 4)], fillers(), fillers()],
      top: num('RED', 5),
      settings: { teamMode: true },
      teams,
      teamIds: ['A', 'A', 'B', 'B'],
    });
    for (const personality of ['balanced', 'teamPlayer', 'aggressive'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const action = chooseAction(createPlayerView(s, 'p0'), resolveProfile('hard', personality), createRng(seed));
        expect(action).not.toMatchObject({ cardId: hit.id });
      }
    }
  });

  it('never challenges its teammate for UNO', () => {
    const s = scenario({ hands: [fillers(), [num('RED', 1)], fillers(), fillers()], top: num('RED', 5), current: 0, settings: { teamMode: true }, teams, teamIds: ['A', 'B', 'A', 'B'] });
    s.unoState.penaltyWindowPlayerId = 'p2';
    s.players[2].hand = [num('GREEN', 1)];
    s.players[2].cardsRemaining = 1;
    for (let seed = 1; seed <= 30; seed++) {
      const action = chooseAction(createPlayerView(s, 'p0'), resolveProfile('hard', 'balanced'), createRng(seed));
      expect(action?.type).not.toBe('CHALLENGE_UNO');
    }
  });

  it('play complete 2 vs 2 rounds with every personality', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = simulateRound({ seed, teams: true });
      expect(state.status).toBe('ROUND_OVER');
      expect(state.rounds[0].winningTeamId).toMatch(/A|B/);
    }
  });
});

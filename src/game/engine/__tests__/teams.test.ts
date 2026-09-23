import { describe, expect, it } from 'vitest';
import { createGame, GameConfigError, playCard } from '../game';
import { areTeammates, calculateRoundScore, getGameWinningTeam, getRoundWinningTeam, getTeamOf, getTeamPlayers } from '../scoring';
import type { Team } from '../types';
import { num, ok, scenario, skip } from './helpers';

const teams: Team[] = [
  { id: 'A', name: 'Team A' },
  { id: 'B', name: 'Team B' },
];
// Player 1 → A, Bot 1 → A, Bot 2 → B, Bot 3 → B
const teamIds = ['A', 'A', 'B', 'B'];

function teamScenario(targetScore = 500) {
  const last = num('RED', 1);
  const s = scenario({
    hands: [[last], [num('BLUE', 9), skip('BLUE')], [num('GREEN', 4)], [num('YELLOW', 6), skip('RED')]],
    top: num('RED', 5),
    settings: { teamMode: true, targetScore },
    teams,
    teamIds,
  });
  return { s, last };
}

describe('Teams', () => {
  it('assigns players to teams from the config', () => {
    const state = createGame({
      players: [
        { id: 'human', name: 'Player 1', type: 'HUMAN', teamId: 'A' },
        { id: 'bot1', name: 'Bot 1', type: 'BOT', teamId: 'A' },
        { id: 'bot2', name: 'Bot 2', type: 'BOT', teamId: 'B' },
        { id: 'bot3', name: 'Bot 3', type: 'BOT', teamId: 'B' },
      ],
      teams,
      settings: { teamMode: true },
      seed: 1,
    });
    expect(getTeamOf(state, 'bot1')?.id).toBe('A');
    expect(getTeamPlayers(state, 'B').map((p) => p.id)).toEqual(['bot2', 'bot3']);
    expect(areTeammates(state, 'human', 'bot1')).toBe(true);
    expect(areTeammates(state, 'human', 'bot2')).toBe(false);
    expect(state.teamScores).toEqual({ A: 0, B: 0 });
  });

  it('rejects team mode without valid teams', () => {
    const players = [
      { id: 'a', name: 'a', type: 'HUMAN' as const, teamId: 'A' },
      { id: 'b', name: 'b', type: 'BOT' as const },
    ];
    expect(() => createGame({ players, teams, settings: { teamMode: true } })).toThrow(GameConfigError);
    expect(() => createGame({ players, settings: { teamMode: true } })).toThrow(/two teams/);
  });

  it('only opponents’ cards count, and points go to the team', () => {
    const { s } = teamScenario();
    const result = calculateRoundScore(s, 'p0');
    expect(result.winningTeamId).toBe('A');
    expect(result.points).toBe(4 + 6 + 20);
  });

  it('detects the team that wins the round', () => {
    const { s, last } = teamScenario();
    const over = ok(playCard(s, 'p0', last.id));
    expect(over.status).toBe('ROUND_OVER');
    expect(getRoundWinningTeam(over)?.id).toBe('A');
    expect(over.teamScores).toEqual({ A: 30, B: 0 });
    expect(getGameWinningTeam(over)).toBeNull();
  });

  it('detects the team that wins the game at the target score', () => {
    const { s, last } = teamScenario(30);
    const over = ok(playCard(s, 'p0', last.id));
    expect(over.status).toBe('GAME_OVER');
    expect(getGameWinningTeam(over)?.id).toBe('A');
    expect(over.gameWinnerTeamId).toBe('A');
  });

  it('a teammate winning also counts for the team', () => {
    const last = num('RED', 1);
    const s = scenario({
      hands: [[num('BLUE', 9)], [last], [num('GREEN', 4)], [num('YELLOW', 6)]],
      top: num('RED', 5),
      current: 1,
      settings: { teamMode: true },
      teams,
      teamIds,
    });
    const over = ok(playCard(s, 'p1', last.id));
    expect(getRoundWinningTeam(over)?.id).toBe('A');
    expect(over.teamScores.A).toBe(10);
  });
});

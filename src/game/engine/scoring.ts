import type { GameState, Player, RoundResult, Team } from './types';
import { getHandScore } from './deck';

export function getTeamOf(state: GameState, playerId: string): Team | undefined {
  const teamId = state.players.find((p) => p.id === playerId)?.teamId;
  return teamId ? state.teams.find((t) => t.id === teamId) : undefined;
}

export function getTeamPlayers(state: GameState, teamId: string): Player[] {
  return state.players.filter((p) => p.teamId === teamId);
}

export function areTeammates(state: GameState, a: string, b: string): boolean {
  if (!state.settings.teamMode) return false;
  const ta = getTeamOf(state, a);
  return !!ta && ta.id === getTeamOf(state, b)?.id;
}

/**
 * Official scoring: the round winner earns the point value of every card left in the other hands.
 * In team mode only opponents' hands count, and the points go to the winner's team.
 */
export function calculateRoundScore(state: GameState, winnerId: string): RoundResult {
  const handPoints: Record<string, number> = {};
  let points = 0;
  for (const player of state.players) {
    handPoints[player.id] = getHandScore(player.hand);
    if (player.id !== winnerId && !areTeammates(state, player.id, winnerId)) {
      points += handPoints[player.id];
    }
  }
  const winningTeamId = state.settings.teamMode ? getTeamOf(state, winnerId)?.id ?? null : null;
  return { roundNumber: state.roundNumber, winnerId, winningTeamId, points, handPoints };
}

/** Team whose member won the current/last round (team mode). */
export function getRoundWinningTeam(state: GameState): Team | null {
  if (!state.settings.teamMode || !state.winnerId) return null;
  return getTeamOf(state, state.winnerId) ?? null;
}

/** Team that reached the target score, if any (team mode). */
export function getGameWinningTeam(state: GameState): Team | null {
  if (!state.gameWinnerTeamId) return null;
  return state.teams.find((t) => t.id === state.gameWinnerTeamId) ?? null;
}

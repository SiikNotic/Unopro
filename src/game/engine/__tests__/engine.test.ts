import { describe, expect, it } from 'vitest';
import { applyAction, createGame, replay } from '../game';
import { Actions } from '../actions';
import type { GameAction, GameSettings, GameState } from '../types';
import { allCards, players, randomLegalAction } from './helpers';

interface SimResult {
  state: GameState;
  actions: GameAction[];
  steps: number;
}

function simulate(seed: number, n = 4, settings: Partial<GameSettings> = {}, extra = {}): SimResult {
  let state = createGame({ players: players(n), seed, settings, ...extra });
  const initial = state;
  let rngState = seed ^ 0x9e3779b9;
  const actions: GameAction[] = [];
  let steps = 0;
  while (state.status === 'PLAYING' && steps < 3000) {
    const pick = randomLegalAction(state, rngState);
    rngState = pick.rngState;
    const result = applyAction(state, pick.action);
    if (!result.ok) throw new Error(`Seed ${seed} step ${steps}: ${result.error}`);
    state = result.state;
    actions.push(pick.action);
    steps++;
    checkInvariants(state);
  }
  expect(replay(initial, actions)).toEqual(state);
  return { state, actions, steps };
}

function checkInvariants(state: GameState) {
  const cards = allCards(state);
  if (cards.length !== 108) throw new Error(`Card count ${cards.length}`);
  if (new Set(cards.map((c) => c.id)).size !== 108) throw new Error('Duplicate card');
  for (const p of state.players) if (p.cardsRemaining !== p.hand.length) throw new Error('cardsRemaining out of sync');
  if (state.discardPile.length === 0) throw new Error('Empty discard pile');
}

describe('Engine determinism', () => {
  it('same state + same action → same new state', () => {
    const s = createGame({ players: players(3), seed: 21 });
    const action = Actions.drawCard('p0');
    expect(applyAction(s, action)).toEqual(applyAction(s, action));
  });

  it('records timestamps supplied by the caller, never reads the clock', () => {
    const s = createGame({ players: players(3), seed: 21 });
    const next = applyAction(s, { ...Actions.callUno('p1'), timestamp: 1234 });
    expect(next.state.log.at(-1)?.timestamp).toBe(1234);
    expect(next.state.unoState.calls[0].timestamp).toBe(1234);
  });

  it('log entries are sequential and carry round and turn', () => {
    const { state } = simulate(5);
    state.log.forEach((entry, i) => expect(entry.seq).toBe(i + 1));
    expect(state.log[0]).toMatchObject({ type: 'ROUND_STARTED', roundNumber: 1, turnNumber: 1 });
    expect(state.log.at(-1)?.type).toMatch(/ROUND_ENDED|GAME_ENDED/);
  });
});

describe('Full game simulations', () => {
  it('plays 120 complete rounds with official rules, keeping every invariant', () => {
    let recycled = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { state } = simulate(seed, 2 + (seed % 5));
      expect(state.status).toBe('ROUND_OVER');
      expect(state.players.find((p) => p.id === state.winnerId)?.hand).toHaveLength(0);
      if (state.log.some((e) => e.type === 'DECK_RECYCLED')) recycled++;
    }
    expect(recycled).toBeGreaterThan(0);
  });

  it('plays complete rounds with every house rule enabled', () => {
    const settings = { stacking: true, jumpIn: true, drawUntilPlayable: true, forcePlay: true };
    for (let seed = 1; seed <= 40; seed++) {
      expect(simulate(seed, 4, settings).state.status).toBe('ROUND_OVER');
    }
  });

  it('plays complete 2 vs 2 rounds and credits the winning team', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state } = simulate(seed, 4, { teamMode: true }, {
        players: players(4).map((p, i) => ({ ...p, teamId: i < 2 ? 'A' : 'B' })),
        teams: [
          { id: 'A', name: 'A' },
          { id: 'B', name: 'B' },
        ],
      });
      const round = state.rounds[0];
      const team = state.players.find((p) => p.id === round.winnerId)?.teamId;
      expect(round.winningTeamId).toBe(team);
      expect(state.teamScores[team!]).toBe(round.points);
    }
  });

  it('plays a multi-round game until someone reaches the target score', () => {
    let state = createGame({ players: players(3), seed: 77, settings: { targetScore: 200 } });
    let rngState = 1;
    let rounds = 0;
    while (state.status !== 'GAME_OVER' && rounds < 50) {
      if (state.status === 'ROUND_OVER') {
        state = applyAction(state, Actions.startGame()).state;
        rounds++;
        continue;
      }
      const pick = randomLegalAction(state, rngState);
      rngState = pick.rngState;
      state = applyAction(state, pick.action).state;
      checkInvariants(state);
    }
    expect(state.status).toBe('GAME_OVER');
    expect(state.scores[state.gameWinnerId!]).toBeGreaterThanOrEqual(200);
    expect(state.rounds.length).toBe(state.roundNumber);
  });
});

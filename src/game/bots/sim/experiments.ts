// The experiment catalogue for the bot validation report.
import type { BotDifficulty, BotPersonality } from '../profiles';
import type { Experiment } from './simulator';

const D: BotDifficulty[] = ['easy', 'normal', 'hard'];
const bal = (difficulty: BotDifficulty) => ({ difficulty, personality: 'balanced' as BotPersonality });

export function difficultyExperiments(): Experiment[] {
  const pairs: [BotDifficulty, BotDifficulty][] = [
    ['easy', 'easy'], ['easy', 'normal'], ['easy', 'hard'], ['normal', 'normal'], ['normal', 'hard'], ['hard', 'hard'],
  ];
  return pairs.flatMap(([a, b]) => [
    {
      id: `diff-2p-${a}-${b}`,
      title: `${a} vs ${b} (1 vs 1)`,
      seating: ['A', 'B'],
      setups: { A: bal(a), B: bal(b) },
      alternateSeats: true,
      consistencyEvery: 10,
    },
    {
      id: `diff-4p-${a}-${b}`,
      title: `${a} ×2 vs ${b} ×2 (4 players, alternating seats)`,
      seating: ['A', 'B', 'A', 'B'],
      setups: { A: bal(a), B: bal(b) },
      alternateSeats: true,
      consistencyEvery: 10,
    },
  ]);
}

export function personalityExperiments(): Experiment[] {
  const others: BotPersonality[] = ['aggressive', 'defensive', 'risky', 'teamPlayer'];
  return D.flatMap((difficulty) =>
    others.map((p) => ({
      id: `pers-4p-${difficulty}-balanced-${p}`,
      title: `${difficulty}: balanced ×2 vs ${p} ×2 (4 players)`,
      seating: ['A', 'B', 'A', 'B'] as const,
      setups: { A: bal(difficulty), B: { difficulty, personality: p } },
      alternateSeats: true,
      counterfactual: { group: 'B' as const, setup: bal(difficulty) },
    }))
  ).map((e) => ({ ...e, seating: [...e.seating] }));
}

export function teamExperiments(): Experiment[] {
  const tp = (difficulty: BotDifficulty) => ({ difficulty, personality: 'teamPlayer' as BotPersonality });
  return (['normal', 'hard'] as BotDifficulty[]).flatMap((difficulty) => [
    {
      id: `team-across-${difficulty}-tp-vs-bal`,
      title: `${difficulty} 2v2, partners across: team A teamPlayer ×2 vs team B balanced ×2`,
      seating: ['A', 'B', 'A', 'B'],
      teams: true,
      setups: { A: tp(difficulty), B: bal(difficulty) },
      alternateSeats: true,
      counterfactual: { group: 'A', setup: bal(difficulty) },
    },
    {
      id: `team-across-${difficulty}-bal-vs-bal`,
      title: `${difficulty} 2v2, partners across: balanced ×2 vs balanced ×2 (baseline)`,
      seating: ['A', 'B', 'A', 'B'],
      teams: true,
      setups: { A: bal(difficulty), B: bal(difficulty) },
      alternateSeats: true,
    },
    {
      id: `team-adjacent-${difficulty}-tp-vs-bal`,
      title: `${difficulty} 2v2, partners adjacent: team A teamPlayer ×2 vs team B balanced ×2`,
      seating: ['A', 'A', 'B', 'B'],
      teams: true,
      setups: { A: tp(difficulty), B: bal(difficulty) },
      alternateSeats: true,
      counterfactual: { group: 'A', setup: bal(difficulty) },
    },
    {
      id: `team-adjacent-${difficulty}-bal-vs-bal`,
      title: `${difficulty} 2v2, partners adjacent: balanced ×2 vs balanced ×2 (baseline)`,
      seating: ['A', 'A', 'B', 'B'],
      teams: true,
      setups: { A: bal(difficulty), B: bal(difficulty) },
      alternateSeats: true,
    },
  ] as Experiment[]);
}

export function allExperiments(): Experiment[] {
  return [...difficultyExperiments(), ...personalityExperiments(), ...teamExperiments()];
}

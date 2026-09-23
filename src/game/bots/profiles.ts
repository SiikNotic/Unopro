// Difficulty and personality are plain numbers mixed into one profile — no per-bot classes.

export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type BotPersonality = 'balanced' | 'aggressive' | 'defensive' | 'risky' | 'teamPlayer';

export interface BotProfile {
  /** Random score noise added to every option (higher = sloppier). */
  noise: number;
  /** Chance of picking a random legal play instead of the best one. */
  mistakeRate: number;
  /** Chance of calling UNO when it applies. */
  unoCallRate: number;
  /** Chance of catching an opponent who forgot UNO. */
  challengeRate: number;
  /** Chance of naming a random color instead of the best one. */
  randomColorRate: number;
  /** Weight of keeping the resulting color favourable to its own hand. */
  colorWeight: number;
  /** Weight of dumping high-value cards (fewer points given away). */
  shedWeight: number;
  /** How much it values holding Wilds back. */
  wildConserve: number;
  /** How much it values holding Skip/Reverse/+2 back when they are not needed. */
  actionConserve: number;
  /** How much it likes hitting opponents, especially those close to winning. */
  attack: number;
  /** Opponents with this many cards or fewer are treated as threats. */
  threatThreshold: number;
  /** How much it protects/helps its teammate. */
  team: number;
  /** Uses public history (who drew on which color) and looks at who plays next. */
  readsTable: boolean;
}

export const DIFFICULTIES: Record<BotDifficulty, BotProfile> = {
  easy: {
    noise: 10,
    mistakeRate: 0.3,
    unoCallRate: 0.55,
    challengeRate: 0.25,
    randomColorRate: 0.4,
    colorWeight: 0.4,
    shedWeight: 0,
    wildConserve: 0.3,
    actionConserve: 0,
    attack: 0.4,
    threatThreshold: 1,
    team: 0.3,
    readsTable: false,
  },
  normal: {
    noise: 2.5,
    mistakeRate: 0.05,
    unoCallRate: 0.85,
    challengeRate: 0.6,
    randomColorRate: 0.05,
    colorWeight: 1,
    shedWeight: 0.6,
    wildConserve: 1,
    actionConserve: 0.4,
    attack: 1,
    threatThreshold: 2,
    team: 1,
    readsTable: false,
  },
  hard: {
    noise: 0.6,
    mistakeRate: 0,
    unoCallRate: 0.97,
    challengeRate: 0.9,
    randomColorRate: 0,
    colorWeight: 1.3,
    shedWeight: 1,
    wildConserve: 1.3,
    actionConserve: 0.7,
    attack: 1.3,
    threatThreshold: 3,
    team: 1.5,
    readsTable: true,
  },
};

type Modifier = Partial<Record<keyof BotProfile, number>>;

/** Multipliers (or additions for threatThreshold/noise) applied on top of the difficulty. */
export const PERSONALITIES: Record<BotPersonality, Modifier> = {
  balanced: {},
  aggressive: { attack: 1.8, wildConserve: 0.7, actionConserve: 0.3, threatThreshold: 1 },
  defensive: { wildConserve: 1.7, actionConserve: 2, attack: 0.8 },
  risky: { wildConserve: 0.35, actionConserve: 0, attack: 1.3, noise: 1.5 },
  teamPlayer: { team: 2.2, attack: 1.1 },
};

const ADDITIVE: (keyof BotProfile)[] = ['threatThreshold', 'noise'];

export function resolveProfile(difficulty: BotDifficulty, personality: BotPersonality): BotProfile {
  const base: BotProfile = { ...DIFFICULTIES[difficulty] };
  for (const [key, value] of Object.entries(PERSONALITIES[personality]) as [keyof BotProfile, number][]) {
    const current = base[key];
    if (typeof current !== 'number') continue;
    (base as unknown as Record<string, number>)[key] = ADDITIVE.includes(key) ? current + value : current * value;
  }
  return base;
}

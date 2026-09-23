// Many complete multi-round games (to 500 points) with invariant checks, to hunt for rare failures.
// Usage: npx vite-node scripts/bot-long.ts -- --games 50 --out reports/bots/long.json
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runLongGame } from '../src/game/bots/sim/longGame';
import type { LongGameConfig } from '../src/game/bots/sim/longGame';
import type { BotSetup } from '../src/game/bots/botController';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const games = Number(arg('games', '50'));
const out = arg('out', 'reports/bots/long.json');

const lineups: BotSetup[] = (['easy', 'normal', 'hard'] as const).flatMap((difficulty) =>
  (['balanced', 'aggressive', 'defensive', 'risky', 'teamPlayer'] as const).map((personality) => ({ difficulty, personality }))
);
const variants: { name: string; cfg: Omit<LongGameConfig, 'seed' | 'setups'> }[] = [
  { name: '2 players', cfg: { players: 2 } },
  { name: '3 players', cfg: { players: 3 } },
  { name: '4 players', cfg: { players: 4 } },
  { name: '6 players', cfg: { players: 6 } },
  { name: '10 players', cfg: { players: 10 } },
  { name: '2v2', cfg: { players: 4, teams: true } },
  { name: '3v3', cfg: { players: 6, teams: true } },
  { name: '4p stacking', cfg: { players: 4, settings: { stacking: true } } },
  { name: '4p jump-in', cfg: { players: 4, settings: { jumpIn: true } } },
  { name: '4p draw-until-playable + force play', cfg: { players: 4, settings: { drawUntilPlayable: true, forcePlay: true } } },
  { name: '2v2 all house rules', cfg: { players: 4, teams: true, settings: { stacking: true, jumpIn: true, drawUntilPlayable: true, forcePlay: true } } },
  { name: '2p all house rules', cfg: { players: 2, settings: { stacking: true, jumpIn: true, drawUntilPlayable: true, forcePlay: true } } },
];

const report: Record<string, unknown> = {};
for (const v of variants) {
  const start = performance.now();
  let finished = 0;
  let rounds = 0;
  let actions = 0;
  const failures: unknown[] = [];
  for (let seed = 1; seed <= games; seed++) {
    const setups = [lineups[(seed * 3) % 15], lineups[(seed * 7 + 5) % 15], lineups[(seed * 11 + 2) % 15]];
    const r = runLongGame({ seed, setups, ...v.cfg });
    rounds += r.rounds;
    actions += r.actions;
    if (r.finished) finished++;
    else failures.push({ seed, variant: v.name, setups, failure: r.failure });
  }
  const ms = Math.round(performance.now() - start);
  report[v.name] = { games, finished, rounds, actions, failures, ms };
  console.log(`${v.name}: ${finished}/${games} games finished, ${rounds} rounds, ${actions} actions, ${failures.length} failures, ${ms} ms`);
}
writeFileSync(out, JSON.stringify(report, null, 1));

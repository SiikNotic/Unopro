// Runs bot validation experiments headlessly and writes JSON results.
// Usage: npx vite-node scripts/bot-sim.ts -- --rounds 5000 --filter diff- --out reports/bots/diff.json
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { allExperiments } from '../src/game/bots/sim/experiments';
import { runBatch } from '../src/game/bots/sim/simulator';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const rounds = Number(arg('rounds', '1000'));
const filter = arg('filter', '');
const out = arg('out', 'reports/bots/results.json');

const results: Record<string, unknown> = {};
for (const exp of allExperiments().filter((e) => e.id.includes(filter))) {
  const start = performance.now();
  const metrics = runBatch(exp, rounds);
  metrics.elapsedMs = Math.round(performance.now() - start);
  results[exp.id] = { title: exp.title, setups: exp.setups, seating: exp.seating, teams: !!exp.teams, metrics };
  console.log(`${exp.id}: ${rounds} rounds in ${metrics.elapsedMs} ms, A won ${metrics.groups.A.roundsWon}, failures ${metrics.failures.length}`);
}
writeFileSync(out, JSON.stringify(results, null, 1));

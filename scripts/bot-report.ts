// Builds reports/bots/REPORT-DATA.md from the JSON files written by bot-sim.ts.
// Usage: npx vite-node scripts/bot-report.ts -- reports/bots/diff-2p.json reports/bots/diff-4p.json ...
import { readFileSync, writeFileSync } from 'node:fs';
import type { BatchMetrics, GroupMetrics } from '../src/game/bots/sim/metrics';

interface Entry {
  title: string;
  setups: Record<'A' | 'B', { difficulty: string; personality: string }>;
  teams: boolean;
  metrics: BatchMetrics;
}

const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));
const entries: [string, Entry][] = files.flatMap((f) => Object.entries(JSON.parse(readFileSync(f, 'utf8')) as Record<string, Entry>));

const pct = (num: number, den: number, digits = 1) => (den > 0 ? `${((100 * num) / den).toFixed(digits)}%` : '—');
const ratio = (num: number, den: number, digits = 2) => (den > 0 ? (num / den).toFixed(digits) : '—');
const ci = (wins: number, n: number) => (n > 0 ? `±${(196 * Math.sqrt((wins / n) * (1 - wins / n) / n)).toFixed(1)}` : '');
const plays = (g: GroupMetrics) => g.playNumber + g.playAction + g.playWild + g.playWildFour;
const label = (s: { difficulty: string; personality: string }) => `${s.difficulty}/${s.personality}`;
const errors = (m: BatchMetrics) => m.illegalActions + m.invariantViolations + m.stalls + m.loops;

const lines: string[] = [];
const out = (s = '') => lines.push(s);

function summaryTable(rows: [string, Entry][]) {
  out('| Configuration | A | B | Wins A | Wins B | % A (95% CI) | % B | Avg turns | UNO calls/round | Unfinished | Errors | Time |');
  out('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [, e] of rows) {
    const m = e.metrics;
    const a = m.groups.A.roundsWon;
    const b = m.groups.B.roundsWon;
    out(
      `| ${e.title} | ${label(e.setups.A)} | ${label(e.setups.B)} | ${a} | ${b} | ${pct(a, m.finished)} ${ci(a, m.finished)} | ${pct(b, m.finished)} | ${ratio(m.turnsSum, m.finished, 1)} | ${ratio(m.groups.A.unoCalls + m.groups.B.unoCalls, m.finished)} | ${m.unfinished} | ${errors(m)} | ${(m.elapsedMs / 1000).toFixed(1)} s |`
    );
  }
  out();
}

function behaviourTable(rows: [string, Entry][], withCounterfactual = false, withTeam = false) {
  const cols = [
    'Group', 'Profile', 'Win %', 'Cards left (losers)', 'Cards drawn/seat', 'Wilds/seat', 'Actions/seat',
    'Number %', 'Action %', 'Wild %', 'Wild w/ alternative', 'Color change/play', 'Color fit', 'Attack % of plays',
    'Hits threat', 'Draw w/ legal play', 'UNO call', 'UNO forget', 'Challenge', 'Consistency',
  ];
  if (withCounterfactual) cols.push('Same decision as balanced');
  if (withTeam) cols.push('Turn → mate', 'Mate ≤2: turn → mate', 'Attacks on mate /1000 dec.', 'Mate color fit (wilds)');
  out(`| Configuration | ${cols.join(' | ')} |`);
  out(`|---|${cols.map(() => '---:').join('|')}|`);
  for (const [, e] of rows) {
    for (const key of ['A', 'B'] as const) {
      const g = e.metrics.groups[key];
      const p = plays(g);
      const cells = [
        key, label(e.setups[key]), pct(g.roundsWon, e.metrics.finished), ratio(g.endHandCardsLosers, g.losingSeatRounds, 1),
        ratio(g.cardsDrawn, g.seats, 1), ratio(g.playWild + g.playWildFour, g.seats), ratio(g.playAction, g.seats),
        pct(g.playNumber, p), pct(g.playAction, p), pct(g.playWild + g.playWildFour, p),
        pct(g.wildWhenAlternative, g.wildAlternativeOpportunities), ratio(g.colorChanges, p), ratio(g.colorFitSum, g.colorFitSamples),
        pct(g.attackPlays, p), pct(g.attackOnThreatTaken, g.attackOnThreatOpportunities), pct(g.drawsWithLegalPlay, g.draws),
        pct(g.unoCalls, g.unoOpportunities), pct(g.unoForgets, g.unoOpportunities), pct(g.challenges, g.challengeOpportunities),
        pct(g.consistencyAgree, g.consistencyCompared),
      ];
      if (withCounterfactual) cells.push(pct(g.counterfactualAgree, g.counterfactualCompared, 2));
      if (withTeam) {
        cells.push(
          pct(g.turnToTeammate, g.turnDecisions), pct(g.teammateNearWinPassTurn, g.teammateNearWinDecisions),
          ratio((1000 * g.attacksOnTeammate), g.decisions, 1), ratio(g.teammateColorFitSum, g.teammateColorFitSamples)
        );
      }
      out(`| ${key === 'A' ? e.title : ''} | ${cells.join(' | ')} |`);
    }
  }
  out();
}

const section = (prefix: string) => entries.filter(([id]) => id.startsWith(prefix));

out('# Bot validation — raw data');
out();
out(`Generated from: ${files.join(', ')}`);
out();
const total = entries.reduce(
  (t, [, e]) => ({
    rounds: t.rounds + e.metrics.rounds, finished: t.finished + e.metrics.finished, unfinished: t.unfinished + e.metrics.unfinished,
    illegal: t.illegal + e.metrics.illegalActions, invariants: t.invariants + e.metrics.invariantViolations,
    stalls: t.stalls + e.metrics.stalls, loops: t.loops + e.metrics.loops, ms: t.ms + e.metrics.elapsedMs,
  }),
  { rounds: 0, finished: 0, unfinished: 0, illegal: 0, invariants: 0, stalls: 0, loops: 0, ms: 0 }
);
out(`**Totals:** ${total.rounds} rounds, ${total.finished} finished, ${total.unfinished} unfinished, ${total.illegal} illegal actions, ${total.invariants} invariant violations, ${total.stalls} stalls, ${total.loops} loops, ${(total.ms / 1000).toFixed(0)} s CPU.`);
out();
const failures = entries.flatMap(([, e]) => e.metrics.failures);
out(`**Failures recorded:** ${failures.length}`);
for (const f of failures.slice(0, 50)) out(`- seed ${f.seed} [${f.kind}] ${f.detail}`);
out();

out('## Difficulty — 1 vs 1');
summaryTable(section('diff-2p'));
behaviourTable(section('diff-2p'));
out('## Difficulty — 4 players (2 seats each, alternating)');
summaryTable(section('diff-4p'));
behaviourTable(section('diff-4p'));
out('## Personality — same difficulty, balanced ×2 vs personality ×2');
summaryTable(section('pers-'));
behaviourTable(section('pers-'), true);
out('## Team mode');
summaryTable(section('team-'));
behaviourTable(section('team-'), true, true);

out('## Column definitions');
out('- **Cards left (losers):** average cards in a losing seat’s hand when the round ends.');
out('- **Cards drawn/seat, Wilds/seat, Actions/seat:** per seat per round.');
out('- **Number/Action/Wild %:** share of the group’s card plays.');
out('- **Wild w/ alternative:** of the turns where both a wild and a non-wild card were legal, how often a wild was played (lower = conserves wilds).');
out('- **Color change/play:** plays that changed the active color. **Color fit:** after its play, the share of the bot’s remaining hand matching the new color (wilds count as matching).');
out('- **Attack % of plays:** plays that skipped or made an opponent draw. **Hits threat:** when the next player was an opponent with ≤2 cards and an attack card was legal, how often one was played.');
out('- **Draw w/ legal play:** draws taken although a card was playable.');
out('- **UNO call / forget:** on turns with 2 cards, a legal play and no UNO declared yet. **Challenge:** when an opponent could be caught.');
out('- **Consistency:** every 10th decision re-asked with 4 other bot seeds; share of identical answers (100% = no randomness in that decision).');
out('- **Same decision as balanced:** for the personality group, every decision was also computed with the balanced profile on the same state and seed.');
out('- **Turn → mate:** turn-passing decisions after which the teammate acts next. **Mate ≤2:** same, restricted to when the teammate had 1–2 cards. **Mate color fit:** after the bot chose a wild color, the share of the teammate’s real hand matching it (measured with full information; the bot never sees it).');

writeFileSync('reports/bots/REPORT-DATA.md', lines.join('\n') + '\n');
console.log(`wrote reports/bots/REPORT-DATA.md (${entries.length} experiments)`);

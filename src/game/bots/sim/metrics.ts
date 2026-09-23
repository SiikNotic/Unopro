// Counters collected per group of seats ("A" / "B") during a batch of simulated rounds.

export interface GroupMetrics {
  seats: number;
  roundsWon: number;
  decisions: number;
  playNumber: number;
  playAction: number;
  playWild: number;
  playWildFour: number;
  draws: number;
  drawsWithLegalPlay: number;
  endTurns: number;
  colorChoices: number;
  colorChanges: number;
  colorFitSum: number;
  colorFitSamples: number;
  wildWhenAlternative: number;
  wildAlternativeOpportunities: number;
  attackPlays: number;
  attackOnThreatOpportunities: number;
  attackOnThreatTaken: number;
  attacksOnTeammate: number;
  unoOpportunities: number;
  unoCalls: number;
  unoForgets: number;
  unoPenaltiesSuffered: number;
  challengeOpportunities: number;
  challenges: number;
  cardsDrawn: number;
  endHandCards: number;
  endHandCardsLosers: number;
  losingSeatRounds: number;
  // team-specific (only when the seat has a teammate)
  teammateNearWinDecisions: number;
  teammateNearWinPassTurn: number;
  teammateNearWinAttacks: number;
  turnToTeammate: number;
  turnDecisions: number;
  teammateColorFitSum: number;
  teammateColorFitSamples: number;
  // decision comparisons
  counterfactualCompared: number;
  counterfactualAgree: number;
  consistencyCompared: number;
  consistencyAgree: number;
}

export function emptyGroupMetrics(): GroupMetrics {
  return {
    seats: 0, roundsWon: 0, decisions: 0, playNumber: 0, playAction: 0, playWild: 0, playWildFour: 0, draws: 0,
    drawsWithLegalPlay: 0, endTurns: 0, colorChoices: 0, colorChanges: 0, colorFitSum: 0, colorFitSamples: 0,
    wildWhenAlternative: 0, wildAlternativeOpportunities: 0, attackPlays: 0, attackOnThreatOpportunities: 0,
    attackOnThreatTaken: 0, attacksOnTeammate: 0, unoOpportunities: 0, unoCalls: 0, unoForgets: 0,
    unoPenaltiesSuffered: 0, challengeOpportunities: 0, challenges: 0, cardsDrawn: 0, endHandCards: 0,
    endHandCardsLosers: 0, losingSeatRounds: 0, teammateNearWinDecisions: 0, teammateNearWinPassTurn: 0,
    teammateNearWinAttacks: 0, turnToTeammate: 0, turnDecisions: 0, teammateColorFitSum: 0, teammateColorFitSamples: 0,
    counterfactualCompared: 0, counterfactualAgree: 0, consistencyCompared: 0, consistencyAgree: 0,
  };
}

export interface BatchMetrics {
  rounds: number;
  finished: number;
  unfinished: number;
  loops: number;
  stalls: number;
  illegalActions: number;
  invariantViolations: number;
  turnsSum: number;
  stepsSum: number;
  failures: { seed: number; kind: string; detail: string }[];
  groups: Record<'A' | 'B', GroupMetrics>;
  /** Hash of every decision taken, to compare runs for determinism. */
  decisionHash: number;
  elapsedMs: number;
}

export function emptyBatchMetrics(): BatchMetrics {
  return {
    rounds: 0, finished: 0, unfinished: 0, loops: 0, stalls: 0, illegalActions: 0, invariantViolations: 0,
    turnsSum: 0, stepsSum: 0, failures: [], groups: { A: emptyGroupMetrics(), B: emptyGroupMetrics() },
    decisionHash: 0x811c9dc5, elapsedMs: 0,
  };
}

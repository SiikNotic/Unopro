// Integration point for rewarded videos in Jewellery (e.g. "watch an ad → +5 moves" when a level is lost,
// or credits). NOT wired yet: no offer is shown in the game.
//
// When it is wired, the reward must be granted by the backend only after the ad provider confirms the
// view (server-side verification — the Bank already does this with AdMob SSV: src/bank). The client never
// grants a reward on its own, and never on a timer.
//
// Jewellery's score is not money and never becomes account coins; any credit reward goes through the
// account wallet on the server, kept apart from the score.

export type RewardOffer = 'extraMoves';

export type RewardOutcome = 'unavailable' | 'granted' | 'cancelled';

/** Asks for a rewarded video. Until a provider is connected for Jewellery it always answers 'unavailable'. */
export async function requestReward(_offer: RewardOffer): Promise<RewardOutcome> {
  return 'unavailable';
}

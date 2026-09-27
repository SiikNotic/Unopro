// AIR HOCKEY ↔ the `casino` edge function (account coins). The browser asks to open a match with an entry and a
// level, plays it with the seed it gets back, and sends its input log at the end; the server replays the match and
// pays by its own result. Both calls are idempotent on the match id, so a lost answer is simply asked again.
import { casinoCall } from '@/account/casinoApi';
import type { CasinoResult } from '@/account/casinoApi';
import { serverRound } from '@/account/serverRound';
import { newRequestId } from '@/casino/premium/service';
import type { AirHockeyResult, AirHockeyStart } from '@/casino/server/protocol';
import type { AiLevel } from './ai';

export function startMatch(stake: number, level: AiLevel, requestId = newRequestId()): Promise<CasinoResult<AirHockeyStart>> {
  return serverRound<AirHockeyStart>({ op: 'ah_start', requestId, stake, level });
}

/** Sends the finished match. Retries a few times on network trouble (the server settles each match once). */
export async function finishMatch(requestId: string, log: string, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<CasinoResult<AirHockeyResult>> {
  let last: CasinoResult<AirHockeyResult> = { ok: false, code: 'server' };
  for (let attempt = 0; attempt < 4; attempt++) {
    // op first: the edge function allows a larger body only for this request.
    last = await casinoCall<AirHockeyResult>({ op: 'ah_finish', requestId, log }, undefined, undefined, 20000);
    if (last.ok || (last.code !== 'server' && last.code !== 'rate_limited')) return last;
    await wait(800 * (attempt + 1));
  }
  return last;
}

// One casino round on the account server. A lost answer is retried once with the same request id: the
// server books each id only once, so a retry can only return the booking that already happened.
import { casinoCall } from './casinoApi';
import type { CasinoResult } from './casinoApi';
import type { CasinoRequest } from '@/casino/server/protocol';

export async function serverRound<T>(req: CasinoRequest): Promise<CasinoResult<T>> {
  const first = await casinoCall<T>(req);
  if (first.ok || first.code !== 'server') return first;
  await new Promise((r) => setTimeout(r, 600));
  return casinoCall<T>(req);
}

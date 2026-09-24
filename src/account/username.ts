// The same rules the database applies (public.username_problem), for instant feedback while typing.
// The database decides; this only avoids a round trip for obvious mistakes.
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED_PART = /(admin|owner|staff|moderat|soporte|support|system|sistema|official|oficial)/;
const RESERVED = new Set(['root', 'null', 'undefined', 'guest', 'invitado', 'anonymous', 'anonimo', 'player', 'jugador', 'carta', 'unopro', 'mod', 'mods', 'dealer', 'crupier', 'bot', 'bots']);

export type UsernameProblem = 'format' | 'reserved' | null;

export function usernameProblem(name: string): UsernameProblem {
  if (!USERNAME_RE.test(name)) return 'format';
  const lower = name.toLowerCase();
  if (RESERVED_PART.test(lower) || RESERVED.has(lower)) return 'reserved';
  return null;
}

/** Signed in with a username → that; otherwise the guest's local name. */
export function playerNameFor(status: string, username: string | null, local: string): string {
  return (status === 'user' && username) || local;
}

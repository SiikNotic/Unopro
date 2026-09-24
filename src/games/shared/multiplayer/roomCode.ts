// Room codes for the future online lobby: 5 characters without look-alikes (no 0/O, 1/I/L).
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

export function newRoomCode(random: (n: number) => number = cryptoIndex): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += ROOM_ALPHABET[random(ROOM_ALPHABET.length)];
  return code;
}

/** Normalises what a person typed (case, spaces, dashes) or returns null. */
export function parseRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  return ROOM_CODE_RE.test(code) ? code : null;
}

function cryptoIndex(n: number): number {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps every character equally likely.
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

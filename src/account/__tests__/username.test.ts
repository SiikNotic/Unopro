import { describe, expect, it } from 'vitest';
import { playerNameFor, usernameProblem } from '../username';

describe('username rules (the same the database applies)', () => {
  it('accepts 3–16 letters, numbers and _', () => {
    for (const ok of ['KingPlayer', 'casino_king', 'abc', 'A1234567890_bcde']) expect(usernameProblem(ok)).toBeNull();
  });
  it('refuses bad formats', () => {
    for (const bad of ['ab', 'averyveryverylongname', 'King Player', 'niño', 'x!y', '']) expect(usernameProblem(bad)).toBe('format');
  });
  it('refuses reserved names, in any case', () => {
    for (const bad of ['admin', 'Owner', 'TheRealAdmin', 'STAFF_1', 'support', 'Player', 'guest']) expect(usernameProblem(bad)).toBe('reserved');
  });
  it('the games show the account username when signed in, else the guest name', () => {
    expect(playerNameFor('user', 'KingPlayer', 'Ana')).toBe('KingPlayer');
    expect(playerNameFor('user', 'CasinoKing', 'Ana')).toBe('CasinoKing');
    expect(playerNameFor('guest', null, 'Ana')).toBe('Ana');
    expect(playerNameFor('user', null, 'Ana')).toBe('Ana');
  });
});

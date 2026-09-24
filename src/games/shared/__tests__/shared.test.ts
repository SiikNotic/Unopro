import { describe, expect, it } from 'vitest';
import { newRoomCode, parseRoomCode, ROOM_CODE_RE } from '../multiplayer/roomCode';
import { normalizeBingo, normalizeDomino, DEFAULT_BINGO, DEFAULT_DOMINO } from '../setup';
import { createRng, hashSeed, shuffle } from '../rng';

describe('room codes', () => {
  it('are 5 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(ROOM_CODE_RE);
    expect(newRoomCode()).not.toMatch(/[01OIL]/);
  });
  it('accept what people type, refuse the rest', () => {
    expect(parseRoomCode(' ab7k2 ')).toBe('AB7K2');
    expect(parseRoomCode('ab-7k2')).toBe('AB7K2');
    expect(parseRoomCode('AB0K2')).toBeNull();
    expect(parseRoomCode('ABCD')).toBeNull();
    expect(parseRoomCode('<scr>')).toBeNull();
  });
});

describe('match setup', () => {
  it('falls back to defaults for anything malformed', () => {
    expect(normalizeDomino(null)).toEqual(DEFAULT_DOMINO);
    expect(normalizeBingo('x')).toEqual(DEFAULT_BINGO);
    expect(normalizeDomino({ seats: 9, others: ['local', 'hacker'], difficulty: 'god', target: 5, scene: 'moon' })).toEqual({ ...DEFAULT_DOMINO, others: ['local', 'bot', 'bot'] });
    expect(normalizeBingo({ players: 1, speed: 'fast', autoMark: true, scene: 'party' })).toMatchObject({ players: 1, speed: 'fast', autoMark: true, scene: 'party' });
  });
});

describe('seeded randomness', () => {
  it('shuffles reproducibly and hashes stably', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRng(5));
    expect(shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRng(5))).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});

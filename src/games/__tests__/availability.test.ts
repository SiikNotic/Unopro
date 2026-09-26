import { describe, expect, it } from 'vitest';
import { fetchAvailability, parseAvailability, screenGame } from '../availability';

describe('game availability (what the app shows; the servers enforce it)', () => {
  it('parses the public table, ignoring unknown games and bad rows', () => {
    expect(parseAvailability([{ game: 'slots', enabled: false }, { game: 'domino', enabled: true }, { game: 'poker', enabled: false }, { game: 'bingo', enabled: 'no' }, null])).toEqual({ slots: false, domino: true, carta: true, bingo: true });
    expect(parseAvailability({})).toBeNull();
  });

  it('reads with the public key only and survives network errors', async () => {
    const cfg = { base: 'https://x.supabase.co', apiUrl: 'https://x.supabase.co/functions/v1/game-room', apiKey: 'pk' };
    let asked = '';
    const ok = await fetchAvailability(cfg, (async (url: string, init: RequestInit) => {
      asked = `${url} ${JSON.stringify(init.headers)}`;
      return new Response(JSON.stringify([{ game: 'carta', enabled: false }]), { status: 200 });
    }) as typeof fetch);
    expect(ok?.carta).toBe(false);
    expect(asked).toContain('/rest/v1/game_availability?select=game,enabled');
    expect(await fetchAvailability(cfg, (async () => { throw new Error('offline'); }) as typeof fetch)).toBeNull();
  });

  it('gates the screens that start a match, not a match already running', () => {
    expect(screenGame('slotMachine', {})).toBe('slots');
    expect(screenGame('dominoSetup', {})).toBe('domino');
    expect(screenGame('domino', {})).toBe('domino');
    expect(screenGame('domino', { room: 'AB7K2' })).toBeNull();
    expect(screenGame('room', { game: 'bingo' })).toBe('bingo');
    expect(screenGame('room', { game: 'bingo', room: 'AB7K2' })).toBeNull();
    expect(screenGame('room', { game: 'blackjack' })).toBeNull();
    expect(screenGame('play', {})).toBe('carta');
    expect(screenGame('home', {})).toBeNull();
  });
});

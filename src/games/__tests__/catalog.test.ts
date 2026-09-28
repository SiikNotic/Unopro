import { describe, expect, it } from 'vitest';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';
import { SCREENS } from '@/types/navigation';
import { CONTROLLED_GAMES, screenGame } from '../availability';
import { GAME_IDS, GAMES, GENERAL_TOPICS, TOPIC_ORDER } from '../catalog';

const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

describe('game catalog (the one list of games)', () => {
  it('has each game once, opening a real screen', () => {
    expect(new Set(GAME_IDS).size).toBe(GAME_IDS.length);
    for (const g of GAMES) expect(SCREENS).toContain(g.screen);
  });

  it("matches the owner's on/off switches", () => {
    const controlled = GAMES.flatMap((g) => (g.controlled ? [g.controlled] : []));
    // every switch belongs to a listed game, and every listed game's switch exists
    expect([...controlled].sort()).toEqual([...CONTROLLED_GAMES].sort());
    for (const g of GAMES) {
      // the screen a game opens is the one the availability gate guards (Air Hockey guards itself between matches)
      if (g.controlled && g.id !== 'airhockey') expect(screenGame(g.screen, {})).toBe(g.controlled);
    }
  });

  it('has names and a tutorial for every game, in Spanish and English', () => {
    for (const locale of [es, en]) {
      for (const g of GAMES) {
        expect(typeof get(locale, g.nameKey)).toBe('string');
        expect(typeof get(locale, g.descKey)).toBe('string');
        expect(g.tutorials.length).toBeGreaterThan(0);
      }
      for (const { id } of TOPIC_ORDER) {
        const topic = get(locale, `tutorial.topics.${id}`) as Record<string, string>;
        expect(topic, id).toBeTruthy();
        for (const k of ['title', 'summary', 'intro', 's1t', 's1b', 's2t', 's2b', 's3t', 's3b']) expect(typeof topic[k], `${id}.${k}`).toBe('string');
      }
    }
    const topics = TOPIC_ORDER.map((x) => x.id);
    expect(new Set(topics).size).toBe(topics.length);
    for (const id of GENERAL_TOPICS) expect(topics).toContain(id);
    // no lesson for a game that no longer exists
    expect(Object.keys((es as { tutorial: { topics: object } }).tutorial.topics).sort()).toEqual([...topics].sort());
    expect(Object.keys((en as { tutorial: { topics: object } }).tutorial.topics).sort()).toEqual([...topics].sort());
  });
});

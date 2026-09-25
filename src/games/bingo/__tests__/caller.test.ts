import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callUrl } from '../ui/bingoCaller';

describe('bingo caller', () => {
  it('has a recorded call for every ball in Spanish and English', () => {
    for (const lang of ['es', 'en'] as const)
      for (let n = 1; n <= 75; n++) {
        const file = resolve(__dirname, `../../../../public/audio/bingo/${lang}/${n}.mp3`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(1000);
      }
  });

  it('builds the clip url under the app base', () => {
    expect(callUrl(12, 'es')).toMatch(/audio\/bingo\/es\/12\.mp3$/);
    expect(callUrl(75, 'en')).toMatch(/audio\/bingo\/en\/75\.mp3$/);
  });
});

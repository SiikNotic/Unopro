import { describe, expect, it } from 'vitest';
import { NAME_MAX, normalizeName } from '../profile';

describe('profile name', () => {
  it('cleans what the player types or what storage contains', () => {
    expect(normalizeName('  Ana   María ')).toBe('Ana María');
    expect(normalizeName('<script>x</script>')).toBe('scriptx/script');
    expect(normalizeName('a\u0000b\nc')).toBe('abc');
    expect(normalizeName(42)).toBe('');
    expect(normalizeName('x'.repeat(50))).toHaveLength(NAME_MAX);
  });
});

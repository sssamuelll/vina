// format.ts must stand on its own: imported first, before index.ts or any catalog (spec § 5.1).
import { formatNumber } from '../format';
import { describe, expect, it } from 'vitest';

describe('format.ts import order', () => {
  it('formats when it is the first module imported', () => {
    expect(() => formatNumber(1.5, { decimals: 1 })).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { cuantasCaben } from '../cuantasCaben';

/** Cuántas opciones quedan a la vista en la línea al pie (spec 2026-10-02 § 5.3). */
describe('cuantasCaben', () => {
  it('si caben todas, todas: sin «Más»', () => {
    expect(cuantasCaben([100, 100, 100], 320, 10, 64)).toBe(3);
  });

  it('cabe justo, con su aire entre medias', () => {
    expect(cuantasCaben([100, 100, 100], 320, 10, 64)).toBe(3);
    expect(cuantasCaben([100, 100, 100], 319, 10, 64)).toBeLessThan(3);
  });

  it('si no caben, las primeras que quepan junto a «Más»', () => {
    // «Más» 64 + 100 + 10 = 174 ≤ 300; + 100 + 10 = 284 ≤ 300; + 100 + 10 = 394 > 300.
    expect(cuantasCaben([100, 100, 100, 100], 300, 10, 64)).toBe(2);
  });

  it('con un hueco menor que «Más», ninguna a la vista: todas en el menú', () => {
    expect(cuantasCaben([100, 100], 50, 10, 64)).toBe(0);
  });

  it('sin opciones, cero', () => {
    expect(cuantasCaben([], 500, 10, 64)).toBe(0);
  });
});

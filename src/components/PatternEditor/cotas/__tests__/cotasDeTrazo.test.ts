import { describe, it, expect } from 'vitest';
import { cotasDeTrazo } from '../cotas';
import type { Trazo } from '../../../../types/types';

const trazo: Trazo = { id: 't', createdAt: 1, path: [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] },
] };

describe('cotasDeTrazo (spec 2026-09-12 § 5.3)', () => {
  it('un tramo da largo y ángulo, en patrón, y escribir el largo mueve solo su nodo final', () => {
    const cotas = cotasDeTrazo(trazo, 2);
    expect(cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(cotas[0].valueMm).toBe(50);
    expect(cotas[1].valueMm).toBe(-90); // hacia abajo en pantalla = −90° (convención 29-08)
    const u = cotas[0].apply(80);
    expect(u).toEqual({ kind: 'trazo', trazoId: 't', path: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 80] },
    ] });
  });
  it('un índice que no es tramo no da cotas', () => {
    expect(cotasDeTrazo(trazo, 0)).toEqual([]);
    expect(cotasDeTrazo(trazo, 7)).toEqual([]);
  });
});

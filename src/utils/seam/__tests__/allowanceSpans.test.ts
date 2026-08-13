import { describe, expect, it } from 'vitest';
import { normalizeSpans } from '../allowanceSpans';

describe('normalizeSpans', () => {
  it('ordena los tramos y descarta únicamente los menores al gesto mínimo', () => {
    expect(normalizeSpans([
      { tStart: 0.8, tEnd: 0.9, width: 30 },
      { tStart: 0.4, tEnd: 0.405, width: 20 },
      { tStart: 0, tEnd: 0.01, width: 10 },
    ])).toEqual([
      { tStart: 0, tEnd: 0.01, width: 10 },
      { tStart: 0.8, tEnd: 0.9, width: 30 },
    ]);
  });

  it('deja ganar al último tramo y parte el anterior a ambos lados', () => {
    expect(normalizeSpans([
      { tStart: 0.1, tEnd: 0.9, width: 10 },
      { tStart: 0.3, tEnd: 0.6, width: 20 },
    ])).toEqual([
      { tStart: 0.1, tEnd: 0.3, width: 10 },
      { tStart: 0.3, tEnd: 0.6, width: 20 },
      { tStart: 0.6, tEnd: 0.9, width: 10 },
    ]);
  });

  it('reemplaza con el último tramo las porciones de varios tramos previos', () => {
    expect(normalizeSpans([
      { tStart: 0, tEnd: 0.4, width: 10 },
      { tStart: 0.4, tEnd: 0.8, width: 12 },
      { tStart: 0.2, tEnd: 0.6, width: 20 },
    ])).toEqual([
      { tStart: 0, tEnd: 0.2, width: 10 },
      { tStart: 0.2, tEnd: 0.6, width: 20 },
      { tStart: 0.6, tEnd: 0.8, width: 12 },
    ]);
  });
});

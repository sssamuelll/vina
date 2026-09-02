import { describe, it, expect } from 'vitest';
import { cotaDeMargen } from '../cotaDeMargen';
import type { PatternPiece, SemanticEdge } from '../../../../types/types';

/**
 * Spec 2026-09-02 § 4.3 y § 5.5: la cota del margen se para en el PUNTO del
 * borde (a = b), 18 px hacia fuera; hueca con `de la pieza`, rellena sin
 * rótulo, rellena con `del tramo`; sin scrub; y `apply` devuelve la escritura
 * que corresponde a la fuente.
 */
/** 200 × 80 en local; pivote de la caja (100, 40). */
const rect = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 80] }, { type: 'L', values: [0, 80] }, { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [],
  edges: [{ id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' }],
  ...over,
} as unknown as PatternPiece);
const top = (over: Partial<SemanticEdge> = {}): SemanticEdge => ({
  id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', ...over,
});

describe('cotaDeMargen — anatomía', () => {
  it('de la pieza: hueca, rótulo "de la pieza", el número de la pieza', () => {
    const c = cotaDeMargen(rect(), top(), 0.5)!;
    expect(c).toMatchObject({
      id: 'margen:p:p:top', kind: 'margen', label: 'Margen · top', valueMm: 10, unit: 'mm',
      min: 0, max: 100, primary: false, rotulo: 'de la pieza', scrub: false,
    });
  });

  it('propia del borde: rellena y sin rótulo', () => {
    const c = cotaDeMargen(rect(), top({ seamAllowanceWidth: 25 }), 0.5)!;
    expect(c.valueMm).toBe(25);
    expect(c.primary).toBe(true);
    expect(c.rotulo).toBeUndefined();
  });

  it('dentro de un tramo: rellena con "del tramo"; fuera del tramo, lo de siempre', () => {
    const e = top({ seamAllowanceSpans: [{ tStart: 0.4, tEnd: 0.6, width: 7 }] });
    const dentro = cotaDeMargen(rect(), e, 0.5)!;
    expect(dentro).toMatchObject({ valueMm: 7, primary: true, rotulo: 'del tramo' });
    const fuera = cotaDeMargen(rect(), e, 0.1)!;
    expect(fuera).toMatchObject({ valueMm: 10, primary: false, rotulo: 'de la pieza' });
  });

  it('el id es estable por borde: cambiar el valor no remonta el chip', () => {
    expect(cotaDeMargen(rect(), top(), 0.2)!.id).toBe(cotaDeMargen(rect(), top({ seamAllowanceWidth: 3 }), 0.9)!.id);
  });
});

describe('cotaDeMargen — dónde se para', () => {
  it('a = b = el punto del borde en t, en espacio de patrón; outward apunta lejos de la pieza', () => {
    const c = cotaDeMargen(rect({ position: { x: 100, y: 50 } }), top(), 0.25)!;
    expect(c.a.x).toBeCloseTo(150, 6);
    expect(c.a.y).toBeCloseTo(50, 6);
    expect(c.b).toEqual(c.a);
    expect(c.outward.x).toBeCloseTo(0, 6);
    expect(c.outward.y).toBeCloseTo(-1, 6);
  });

  it('pieza girada 90°: el punto y la normal giran con ella (#1064/#1068: donde SE VE)', () => {
    // Local (100, 0) girado 90° sobre (100, 40) → (140, 40); la normal (0,-1) → (1, 0).
    const c = cotaDeMargen(rect({ rotation: 90 }), top(), 0.5)!;
    expect(c.a.x).toBeCloseTo(140, 3);
    expect(c.a.y).toBeCloseTo(40, 3);
    expect(c.outward.x).toBeCloseTo(1, 3);
    expect(c.outward.y).toBeCloseTo(0, 3);
  });

  it('t = 0 y t = 1 caen en los extremos del borde, no fuera', () => {
    expect(cotaDeMargen(rect(), top(), 0)!.a).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(0, 6) });
    expect(cotaDeMargen(rect(), top(), 1)!.a).toMatchObject({ x: expect.closeTo(200, 6), y: expect.closeTo(0, 6) });
  });
});

describe('cotaDeMargen — apply', () => {
  it('de la pieza → escribe el borde (promueve): setEdgesSeamAllowance', () => {
    expect(cotaDeMargen(rect(), top(), 0.5)!.apply(20)).toEqual({
      kind: 'margen', pieceId: 'p', edgeId: 'p:top', fuente: 'pieza', width: 20,
    });
  });

  it('propia del borde → el mismo destino', () => {
    expect(cotaDeMargen(rect(), top({ seamAllowanceWidth: 25 }), 0.5)!.apply(20)).toEqual({
      kind: 'margen', pieceId: 'p', edgeId: 'p:top', fuente: 'borde', width: 20,
    });
  });

  it('del tramo → ese índice, con el tramo entero', () => {
    const e = top({ seamAllowanceSpans: [{ tStart: 0.1, tEnd: 0.3, width: 8 }, { tStart: 0.4, tEnd: 0.6, width: 7 }] });
    expect(cotaDeMargen(rect(), e, 0.5)!.apply(20)).toEqual({
      kind: 'margen', pieceId: 'p', edgeId: 'p:top', fuente: 'tramo', spanIndex: 1, width: 20,
    });
  });
});

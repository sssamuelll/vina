import { describe, it, expect } from 'vitest';
import { margenEnPunto } from '../margenEnPunto';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

/**
 * Spec 2026-09-02 § 3: la cascada tiene TRES fuentes, no dos —
 * `span.width` > `edge.seamAllowanceWidth` > `piece.seamAllowance`. Es la
 * misma cascada que `EdgePropertiesSection` (:169) y `perEdgeWidths`
 * (cornerTypes.ts:744-780); si divergen, el chip miente sobre el dibujo.
 */
const pieza = (seamAllowance?: number) => ({
  id: 'p', name: 'p', seamAllowance, outline: [], internals: [], position: { x: 0, y: 0 },
} as unknown as PatternPiece);

const borde = (over: Partial<SemanticEdge> = {}): SemanticEdge => ({
  id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', ...over,
});

describe('margenEnPunto — tramo > borde > pieza', () => {
  it('sin nada propio: el de la pieza, fuente "pieza"', () => {
    expect(margenEnPunto(pieza(10), borde(), 0.5)).toEqual({ mm: 10, fuente: 'pieza' });
  });

  it('pieza sin margen: 0 de la pieza (hueco), no un borde en 0', () => {
    expect(margenEnPunto(pieza(undefined), borde(), 0.5)).toEqual({ mm: 0, fuente: 'pieza' });
  });

  it('el borde con ancho propio gana a la pieza', () => {
    expect(margenEnPunto(pieza(10), borde({ seamAllowanceWidth: 25 }), 0.5)).toEqual({ mm: 25, fuente: 'borde' });
  });

  it('0 propio del borde es "borde", no "pieza": el 0 relleno existe', () => {
    expect(margenEnPunto(pieza(10), borde({ seamAllowanceWidth: 0 }), 0.5)).toEqual({ mm: 0, fuente: 'borde' });
  });

  it('dentro de un tramo gana el tramo, con su índice', () => {
    const e = borde({
      seamAllowanceWidth: 25,
      seamAllowanceSpans: [{ tStart: 0.1, tEnd: 0.3, width: 8 }, { tStart: 0.5, tEnd: 0.8, width: 14 }],
    });
    expect(margenEnPunto(pieza(10), e, 0.2)).toEqual({ mm: 8, fuente: 'tramo', spanIndex: 0 });
    expect(margenEnPunto(pieza(10), e, 0.6)).toEqual({ mm: 14, fuente: 'tramo', spanIndex: 1 });
  });

  it('fuera de los tramos cae al borde (o a la pieza si el borde no tiene)', () => {
    const spans = [{ tStart: 0.5, tEnd: 0.8, width: 14 }];
    expect(margenEnPunto(pieza(10), borde({ seamAllowanceWidth: 25, seamAllowanceSpans: spans }), 0.4))
      .toEqual({ mm: 25, fuente: 'borde' });
    expect(margenEnPunto(pieza(10), borde({ seamAllowanceSpans: spans }), 0.4))
      .toEqual({ mm: 10, fuente: 'pieza' });
  });

  it('la frontera: tStart entra, tEnd queda fuera — como perEdgeWidths', () => {
    const e = borde({ seamAllowanceSpans: [{ tStart: 0.25, tEnd: 0.75, width: 12 }] });
    expect(margenEnPunto(pieza(10), e, 0.25).fuente).toBe('tramo');
    expect(margenEnPunto(pieza(10), e, 0.75).fuente).toBe('pieza');
  });

  it('t = 1 con un tramo que llega hasta 1 lee el tramo: el final del borde no queda huérfano', () => {
    const e = borde({ seamAllowanceSpans: [{ tStart: 0.6, tEnd: 1, width: 12 }] });
    expect(margenEnPunto(pieza(10), e, 1)).toEqual({ mm: 12, fuente: 'tramo', spanIndex: 0 });
  });
});

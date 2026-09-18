/**
 * El lado como sujeto (#1167, spec 2026-09-18 § 3.1).
 *
 * Dos helpers puros y su productor de cotas:
 *
 *  · `ladoDelHit` traduce la convención de `nearestSegment` —que rotula el lado
 *    de cierre con el índice de la `Z`— a la de `segmentPolar`, que lo rotula
 *    con el de la `M` porque es su ancla la que se mueve.
 *  · `ladoMasCercano` contesta la única pregunta que el issue dejó abierta:
 *    qué lado abre Tab.
 *  · `cotasDelLado` entrega la pareja Largo · Ángulo del lado elegido, y su
 *    escritura deja FIJO el extremo de partida (spec 08-09 § 3.1).
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../../types/types';
import { ladoDelHit, ladoMasCercano } from '../lado';
import { cotasDelLado } from '../cotas';

/** (0,0) → (200,0) → (200,100) → (0,100) → cierra. Cuatro lados. */
const RECTANGULO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

function pieza(outline: PathCommand[] = RECTANGULO): PatternPiece {
  return {
    id: 'p1', name: 'Pieza', outline,
    position: { x: 0, y: 0 }, internals: [],
  } as unknown as PatternPiece;
}

describe('ladoDelHit — traducir la convención de nearestSegment', () => {
  it('un hit sobre una L es su propio índice', () => {
    expect(ladoDelHit(RECTANGULO, 1)).toBe(1);
    expect(ladoDelHit(RECTANGULO, 3)).toBe(3);
  });

  it('un hit sobre la Z es el lado de cierre, y su índice es el de la M', () => {
    expect(ladoDelHit(RECTANGULO, 4)).toBe(0);
  });

  it('un hit sobre un lado CURVO no da lado editable', () => {
    const conCurva: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 200, 0] },
      { type: 'L', values: [200, 100] },
      { type: 'Z', values: [] },
    ];
    expect(ladoDelHit(conCurva, 1)).toBe(null);
    expect(ladoDelHit(conCurva, 2)).toBe(2);
  });

  it('un índice fuera del contorno no inventa un lado', () => {
    expect(ladoDelHit(RECTANGULO, 99)).toBe(null);
  });
});

describe('ladoMasCercano — qué lado abre Tab', () => {
  it('el puntero sobre el lado de abajo elige ese lado', () => {
    // (100, 105) está a 5 mm del lado (200,100)→(0,100), que llega al índice 3.
    expect(ladoMasCercano(RECTANGULO, { x: 100, y: 105 })).toBe(3);
  });

  it('el puntero sobre el lado de cierre elige el lado de cierre', () => {
    // (-5, 50) está a 5 mm del lado izquierdo, que es el de cierre → índice de la M.
    expect(ladoMasCercano(RECTANGULO, { x: -5, y: 50 })).toBe(0);
  });

  it('sin puntero, el primer lado del contorno', () => {
    expect(ladoMasCercano(RECTANGULO, null)).toBe(1);
  });

  it('salta los lados curvos: el más cercano de los RECTOS', () => {
    const conCurva: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [60, -40, 140, -40, 200, 0] }, // arriba, curvo
      { type: 'L', values: [200, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    // Justo encima del lado curvo: el recto más cercano es el derecho (índice 2).
    expect(ladoMasCercano(conCurva, { x: 190, y: -10 })).toBe(2);
  });

  it('una pieza sin ningún lado recto no tiene lado que abrir', () => {
    const soloCurvas: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [60, -40, 140, -40, 200, 0] },
      { type: 'C', values: [140, 60, 60, 60, 0, 0] },
      { type: 'Z', values: [] },
    ];
    expect(ladoMasCercano(soloCurvas, { x: 100, y: 0 })).toBe(null);
  });
});

describe('cotasDelLado — la caja del lado', () => {
  it('una sola caja: Largo y Ángulo del lado elegido, y de ningún otro', () => {
    const cotas = cotasDelLado(pieza(), 3);
    expect(cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(cotas[0].valueMm).toBeCloseTo(200, 6);
    // Comparten caja (§ 14 de cotas vivas): un solo `grupo`.
    expect(cotas[0].grupo).toBe(cotas[1].grupo);
  });

  it('el lado de CIERRE también tiene caja, con SU largo', () => {
    const cotas = cotasDelLado(pieza(), 0);
    expect(cotas).toHaveLength(2);
    expect(cotas[0].valueMm).toBeCloseTo(100, 6);
  });

  it('escribir el largo mueve el extremo de LLEGADA y deja fijo el de partida', () => {
    const cotas = cotasDelLado(pieza(), 3);
    const update = cotas[0].apply(250);
    // El lado (200,100)→(0,100): partida (200,100) queda; llegada se va a (-50,100).
    expect(update).toEqual({
      kind: 'nodo', pieceId: 'p1', commandIndex: 3,
      destino: { x: expect.closeTo(-50, 6), y: expect.closeTo(100, 6) },
    });
  });

  it('escribir el largo del lado de cierre mueve el ancla de la M', () => {
    const cotas = cotasDelLado(pieza(), 0);
    const update = cotas[0].apply(250);
    // El de cierre: (0,100)→(0,0). Partida (0,100) queda; llegada sube a (0,-150).
    expect(update).toMatchObject({ kind: 'nodo', commandIndex: 0 });
    expect((update as { destino: { x: number; y: number } }).destino.x).toBeCloseTo(0, 6);
    expect((update as { destino: { x: number; y: number } }).destino.y).toBeCloseTo(-150, 6);
  });

  it('un lado curvo no tiene caja', () => {
    const conCurva = pieza([
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 200, 0] },
      { type: 'L', values: [200, 100] },
      { type: 'Z', values: [] },
    ]);
    expect(cotasDelLado(conCurva, 1)).toHaveLength(0);
  });

  it('un índice que ya no existe no devuelve las cotas de sus hermanos', () => {
    expect(cotasDelLado(pieza(), 99)).toHaveLength(0);
  });

  it('la pieza desplazada lleva sus cotas a coordenadas de PATRÓN', () => {
    const movida = { ...pieza(), position: { x: 1000, y: 500 } } as PatternPiece;
    const cotas = cotasDelLado(movida, 1);
    expect(cotas[0].a.x).toBeCloseTo(1000, 6);
    expect(cotas[0].b.x).toBeCloseTo(1200, 6);
    // El largo NO cambia por desplazar la pieza.
    expect(cotas[0].valueMm).toBeCloseTo(200, 6);
  });
});

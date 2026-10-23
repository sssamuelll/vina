import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../../types/types';
import { meshPiece } from '../../../mesh/cdtMesher';
import type { SeamInitData } from '../../seamAssembly';
import { ladosSoldados, soldadura } from '../soldadura';
import { armarPrenda, costurasDePrenda } from '../prenda';

/** Un rectángulo de ancho × alto (mm) con sus cuatro bordes: abajo, derecha, arriba e izquierda (de (0, alto) a (0, 0)). */
function rectangulo(id: string, ancho: number, alto: number): PatternPiece {
  return {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [ancho, 0] }, { type: 'L', values: [ancho, alto] }, { type: 'L', values: [0, alto] },
      { type: 'L', values: [0, 0] }, { type: 'Z', values: [] },
    ] as PathCommand[],
    edges: [
      { name: 'abajo', segmentRange: [1, 2] }, { name: 'der', segmentRange: [2, 3] },
      { name: 'arriba', segmentRange: [3, 4] }, { name: 'izq', segmentRange: [4, 5] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0,
    active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

/** La derecha de A (de y = 0 a 60) cosida a la izquierda de B (de y = 0 a 75, al revés de como la recorre B). */
function costura(extra: Partial<SeamInitData> = {}): SeamInitData {
  return {
    id: 'c', pieceAId: 'A', pieceAEdgeName: 'der', pieceBId: 'B', pieceBEdgeName: 'izq', pieceBReversed: true,
    type: 'standard', tension: 100, strength: 1, active: true, taped: false, ...extra,
  };
}

const A = rectangulo('A', 100, 60), B = rectangulo('B', 50, 75);

describe('la costura soldada (E17)', () => {
  it('los dos lados se parten en los mismos N tramos, con N del lado más largo', () => {
    const s = soldadura([A, B], [costura()], 10);
    expect(s.sueltas).toEqual([]);
    // N = ⌈75 / 10⌉ = 8: nueve muestras por lado, en el orden del cosido
    const [c] = s.costuras;
    expect(c.a.map((p) => [p.x, p.y])).toEqual(Array.from({ length: 9 }, (_, k) => [100, 7.5 * k]));
    expect(c.b.map((p) => p.x)).toEqual(Array(9).fill(0));
    c.b.forEach((p, k) => expect(p.y).toBeCloseTo(9.375 * k, 9));
    // un tramo por borde cosido, con sus puntas
    expect(s.tramos[0]).toHaveLength(1);
    expect(s.tramos[0][0].puntos).toHaveLength(9);
    expect(s.tramos[1][0].puntos).toHaveLength(9);
  });

  it('en la malla, cada punto de costura cae en un vértice del otro lado y no queda ninguno de vuelta', () => {
    const s = soldadura([A, B], [costura()], 10);
    const mallas = [A, B].map((p, k) => ({ pieceId: p.id, ...meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: 10 }, undefined, s.tramos[k]) }));
    const { pares, sueltas } = ladosSoldados(s, [A, B], mallas);
    expect(sueltas).toEqual([]);
    const l = pares[0].lados!;
    expect(l.a).toHaveLength(9);
    expect(l.b).toHaveLength(9);
    expect(l.ta).toEqual(l.tb);
    const prenda = armarPrenda(mallas.map((m) => {
      const n = m.vertices.length / 3;
      return { id: m.pieceId, x: m.vertices, patron: Float64Array.from({ length: 2 * n }, (_, j) => m.vertices[3 * (j >> 1) + 2 * (j & 1)]), tris: m.triIds };
    }));
    const { puntos } = costurasDePrenda(prenda, pares);
    expect(puntos).toHaveLength(9);
    expect(puntos.every((p) => p.b0 === p.b1 && p.s === 0 && !p.inversa)).toBe(true);
  });

  it('un tramo parcial se suelda en su rango, y lo que no se cose se parte a la arista', () => {
    // B se cose del 20 % al 100 % de su recorrido (al revés, desde y = 0): de y = 15 a y = 75; de 0 a 15 queda suelto
    const s = soldadura([A, B], [costura({ pieceBRange: [0.2, 1] })], 10);
    const [c] = s.costuras;
    // N = ⌈máx(60, 60) / 10⌉ = 6
    expect(c.a).toHaveLength(7);
    expect(c.b).toHaveLength(7);
    c.b.forEach((p, k) => expect(p.y).toBeCloseTo(15 + 10 * k, 9));
    // el borde de B: los 15 mm sueltos en dos tramos, más los siete del cosido
    expect(s.tramos[1][0].puntos).toHaveLength(9);
  });

  it('dos costuras que se pisan en un borde no se sueldan', () => {
    const s = soldadura([A, B], [costura({ pieceARange: [0, 0.6] }), costura({ id: 'd', pieceARange: [0.4, 1], pieceBEdgeName: 'der', pieceBReversed: false })], 10);
    expect(s.sueltas).toEqual([0, 1]);
    expect(s.costuras).toEqual([]);
  });
});

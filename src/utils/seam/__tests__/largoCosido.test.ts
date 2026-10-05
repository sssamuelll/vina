import { describe, it, expect } from 'vitest';
import type { PatternPiece, Seam, SemanticEdge } from '../../../types/types';
import { largoCosidoDeLado, largosDeCostura } from '../largoCosido';

/**
 * El largo cosido de cada lado de una costura, medido en el momento: el borde
 * entero, no su primer comando, por la fracción cosida. El DXF de María trae
 * bordes de 14-20 comandos `L`.
 */
const pieza = (id: string, xs: number[]): PatternPiece => ({
  id, name: id, position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
    { type: 'L', values: [xs[xs.length - 1], 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
  edges: [{ id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' }] as SemanticEdge[],
  internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
});

const costura = (over: Partial<Seam> = {}): Seam => ({
  id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
  type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0, ...over,
});

describe('largoCosidoDeLado', () => {
  it('mide el borde entero, de tres comandos, y no su primer comando', () => {
    expect(largoCosidoDeLado(pieza('a', [50, 80, 100]), { pieceId: 'a', edgeName: 'top' })).toBeCloseTo(100, 6);
  });
  it('una costura parcial mide su fracción del borde', () => {
    expect(largoCosidoDeLado(pieza('a', [50, 80, 100]), { pieceId: 'a', edgeName: 'top', tStart: 0.25, tEnd: 0.75 })).toBeCloseTo(50, 6);
  });
  it('un «edge-N» heredado es el comando N, y mide ese comando', () => {
    const sinBordes = { ...pieza('a', [50, 80, 100]), edges: undefined };
    expect(largoCosidoDeLado(sinBordes, { pieceId: 'a', edgeName: 'edge-1' })).toBeCloseTo(50, 6);
  });
  it('un borde que no existe no se inventa: undefined', () => {
    expect(largoCosidoDeLado(pieza('a', [100]), { pieceId: 'a', edgeName: 'manga' })).toBeUndefined();
  });
});

describe('largosDeCostura', () => {
  it('dos bordes de 100 mm partidos distinto miden lo mismo; reversed no cambia el largo', () => {
    const piezas = [pieza('a', [50, 80, 100]), pieza('b', [20, 50, 100])];
    const { a, b } = largosDeCostura(costura({ pieceB: { pieceId: 'b', edgeName: 'top', reversed: true } }), piezas);
    expect(a).toBeCloseTo(100, 6);
    expect(b).toBeCloseTo(100, 6);
  });
  it('una pieza que ya no está da undefined en su lado', () => {
    expect(largosDeCostura(costura(), [pieza('a', [100])]).b).toBeUndefined();
  });
});

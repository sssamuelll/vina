import { describe, it, expect } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { findEdgeForPoint } from '../notchMirror';

/**
 * De qué borde es un piquete que está SOBRE una curva. La distancia al borde
 * se medía con una ida y vuelta: `distanceAlongPath` (largo de arco) y de
 * vuelta `pointAtPathDistance`, que dentro de un `C` usa t = d / largo,
 * lineal en el parámetro y no en el arco. Sobre la curva, esa vuelta cae en
 * otro punto de la misma curva y la «distancia» sale de hasta 20 mm: un
 * borde recto cercano ganaba.
 *
 * Una pieza fina: la curva de `M0,0 C0,120 40,180 120,180` y, a 8 mm de su
 * punto en t = 0,3 —(10,8; 91,8)—, la esquina (18, 88) de dos bordes rectos.
 */
const pieza: PatternPiece = {
  id: 'p', name: 'p', position: { x: 0, y: 0 },
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [0, 120, 40, 180, 120, 180] },
    { type: 'L', values: [120, 170] },
    { type: 'L', values: [18, 88] },
    { type: 'L', values: [18, 0] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'p:curva', name: 'curva', segmentRange: [1, 2], edgeType: 'seam' },
    { id: 'p:arriba', name: 'arriba', segmentRange: [2, 3], edgeType: 'seam' },
    { id: 'p:diagonal', name: 'diagonal', segmentRange: [3, 4], edgeType: 'seam' },
    { id: 'p:recta', name: 'recta', segmentRange: [4, 5], edgeType: 'seam' },
    { id: 'p:cierre', name: 'cierre', segmentRange: [0, 1], edgeType: 'seam' },
  ] as SemanticEdge[],
  internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
};

describe('findEdgeForPoint sobre una curva', () => {
  it('un punto de la curva es de la curva, aunque un borde recto pase a 8 mm', () => {
    expect(findEdgeForPoint(pieza, { x: 10.8, y: 91.8 })?.name).toBe('curva');
  });
});

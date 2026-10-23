import { describe, it, expect } from 'vitest';
import { preparePieces, type PreparedPiece } from '../pipeline';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * La maqueta mide la línea de corte, no el contorno. Con la caja del contorno,
 * un margen de costura más ancho que la mitad del espaciado mete una pieza en
 * la vecina, y la primera arranca en coordenada negativa.
 */

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 300] },
  { type: 'L', values: [0, 300] },
  { type: 'Z', values: [] },
];

function rect(id: string, seamAllowance: number): PatternPiece {
  return {
    id, name: id, outline: RECT, internals: [],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

/** Caja de la línea de corte ya emplazada. */
function corte(p: PreparedPiece) {
  const xs = p.flatSeamOutline.map(q => q.x + p.offsetX);
  const ys = p.flatSeamOutline.map(q => q.y + p.offsetY);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys) };
}

describe('preparePieces — la maqueta mide la línea de corte', () => {
  it('deja el espaciado entero entre las líneas de corte de dos piezas con margen de 40 mm', () => {
    const [a, b] = preparePieces([rect('a', 40), rect('b', 40)], { spacing: 30 });
    expect(corte(b).minX).toBeGreaterThanOrEqual(corte(a).maxX + 30 - 1e-6);
  });

  it('arranca la línea de corte en el origen, no en negativo', () => {
    const [a] = preparePieces([rect('a', 40)], { spacing: 30 });
    expect(corte(a).minX).toBeCloseTo(0);
    expect(corte(a).minY).toBeCloseTo(0);
  });
});

import { describe, expect, it } from 'vitest';
import { splitPieceAtLine, extendEdge } from '../patternOps';
import type { PatternPiece } from '../../types/types';

/**
 * #1126, quinto sitio — el que de verdad hacía daño.
 *
 * El censo del commit de #1126 buscó `JSON.parse(JSON.stringify(...))` y
 * `pieces.push`, y con eso encontró cuatro rutas. `clonePiece`
 * (`patternOps.ts:36`) clona con `...piece`, así que **el grep no la vio** —
 * el síntoma era el mismo, la escritura no. Un censo parcial delata al
 * detector, no al código.
 *
 * Y era la peligrosa. El vínculo es BIDIRECCIONAL, así que al cortar una
 * pieza vinculada las dos mitades nacen apuntando a la compañera; el
 * `updatePiece` del auto-cosido —que ocurre dentro del MISMO gesto— dispara
 * `linkedEditingMiddleware`, que le escribe a la compañera el contorno de una
 * mitad. La pieza entera de la compañera desaparece, dentro del mismo lote de
 * deshacer y sin un aviso.
 *
 * ── La regla, y por qué no es «limpiar siempre» ────────────────────────────
 * `clonePiece(piece, { id: piece.id })` es como `transferDart`, `extendEdge` y
 * `trimEdgeAtPoint` modifican EN SITIO. Ahí borrar el vínculo desvincularía
 * una pieza que la usuaria sí vinculó a propósito. La regla es la que el
 * comentario del propio `clonePiece` ya insinuaba: **identidad nueva, pieza
 * nueva**. Si el id cambia, se suelta el vínculo; si se conserva, no se toca
 * nada.
 */

const vinculada: PatternPiece = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 1_000,
  updatedAt: 1_000,
  linkedPieceId: 'q1',
  linkMode: 'symmetry',
};

describe('#1126 quinto sitio — cortar una pieza vinculada no toca a su compañera', () => {
  it('las dos mitades del corte nacen sueltas', () => {
    const [a, b] = splitPieceAtLine(vinculada, { x: -10, y: 100 }, { x: 110, y: 100 });

    for (const mitad of [a, b]) {
      expect(mitad.linkedPieceId).toBeUndefined();
      expect(mitad.linkMode).toBeUndefined();
    }
  });

  it('y tampoco heredan la fecha de la que se partió', () => {
    const [a] = splitPieceAtLine(vinculada, { x: -10, y: 100 }, { x: 110, y: 100 });

    expect(a.createdAt).toBeGreaterThan(1_000);
  });

  it('control: una op EN SITIO conserva el vínculo — el id no cambió', () => {
    // Sin esto, «limpiar en clonePiece» desvincularía una pieza cada vez que
    // se le estira un borde. Es el hermano bueno que el arreglo no puede
    // romper.
    const estirada = extendEdge(vinculada, 1, 'end', 20);

    expect(estirada?.id).toBe('p1');
    expect(estirada?.linkedPieceId).toBe('q1');
    expect(estirada?.linkMode).toBe('symmetry');
  });
});

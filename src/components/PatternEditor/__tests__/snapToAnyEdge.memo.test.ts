import { describe, it, expect } from 'vitest';
import { snapToAnyEdge } from '../useSegmentSewingTool';
import type { PatternPiece } from '../../../types/types';

/**
 * #1110 — `snapToAnyEdge` memoriza UNA entrada porque con Coser activa dos
 * consumidores resuelven el mismo punto en el mismo movimiento del ratón: el
 * selector de bordes y el encendido del par ya cosido.
 *
 * Un memo solo hace daño de una forma: devolviendo un resultado viejo cuando
 * la entrada cambió. Eso es lo que se prueba aquí — el camino feliz ya lo
 * cubren los tests de hit-test que existen.
 */
function cuadrado(id: string, x: number): PatternPiece {
  return {
    id,
    name: id,
    outline: [
      { type: 'M', values: [x, 0] },
      { type: 'L', values: [x + 100, 0] },
      { type: 'L', values: [x + 100, 100] },
      { type: 'L', values: [x, 100] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    internals: [],
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('snapToAnyEdge — el memo no puede servir comida vieja', () => {
  it('repetir la misma consulta da el mismo resultado', () => {
    const pieces = [cuadrado('p1', 0)];
    const uno = snapToAnyEdge({ x: 50, y: 0 }, pieces, 1);
    const dos = snapToAnyEdge({ x: 50, y: 0 }, pieces, 1);

    expect(uno?.pieceId).toBe('p1');
    expect(dos).toEqual(uno);
  });

  it('cambiar las piezas invalida el memo aunque el punto sea idéntico', () => {
    const antes = [cuadrado('p1', 0)];
    expect(snapToAnyEdge({ x: 50, y: 0 }, antes, 1)?.pieceId).toBe('p1');

    // Misma coordenada, otra colección: la pieza que estaba ahí ya no está.
    const despues = [cuadrado('p2', 0)];
    expect(snapToAnyEdge({ x: 50, y: 0 }, despues, 1)?.pieceId).toBe('p2');

    // Y una colección donde nada toca ese punto tiene que dar null, no el
    // enganche anterior.
    const lejos = [cuadrado('p3', 5000)];
    expect(snapToAnyEdge({ x: 50, y: 0 }, lejos, 1)).toBeNull();
  });

  it('cambiar el punto invalida el memo con las mismas piezas', () => {
    const pieces = [cuadrado('p1', 0)];
    expect(snapToAnyEdge({ x: 50, y: 0 }, pieces, 1)?.pieceId).toBe('p1');
    expect(snapToAnyEdge({ x: 9000, y: 9000 }, pieces, 1)).toBeNull();
  });

  it('un null memorizado no se sirve cuando las piezas cambian', () => {
    const vacio: PatternPiece[] = [];
    expect(snapToAnyEdge({ x: 50, y: 0 }, vacio, 1)).toBeNull();

    const conPieza = [cuadrado('p1', 0)];
    expect(snapToAnyEdge({ x: 50, y: 0 }, conPieza, 1)?.pieceId).toBe('p1');
  });
});

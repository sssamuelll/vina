import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { pieceLocalToPattern } from '../../geometry/pieceSpace';
import { esquinaDelMargenEn, margenMasAncho } from '../esquinaDelMargen';

/**
 * La esquina del margen bajo un clic de Seleccionar (spec 2026-10-02 § 5.2,
 * P3c, la puerta de vuelta). La llama la rama del VACÍO del lienzo: lo que
 * cae dentro de la pieza es de la pieza.
 */

const pieza = (id: string, x: number, y: number, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] }, { type: 'L', values: [300, 200] },
    { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x, y }, rotation: 0, mirrored: false, seamAllowance: 10,
  layer: 1, active: true, createdAt: 0, updatedAt: 0, ...over,
});

describe('esquinaDelMargenEn', () => {
  const p1 = pieza('p1', 100, 100);

  it('el clic en la punta del margen, fuera del contorno, elige esa esquina', () => {
    // Margen de 10: la punta de la esquina de arriba a la izquierda cae en (90, 90).
    expect(esquinaDelMargenEn([p1], { x: 93, y: 93 }, 1, true)).toEqual({ pieceId: 'p1', vertexIndex: 0 });
    // La de abajo a la derecha es el comando 2.
    expect(esquinaDelMargenEn([p1], { x: 407, y: 307 }, 1, true)).toEqual({ pieceId: 'p1', vertexIndex: 2 });
  });

  it('con el margen oculto, o sin margen, nada: el tipo de esquina no pinta nada', () => {
    expect(esquinaDelMargenEn([p1], { x: 93, y: 93 }, 1, false)).toBeNull();
    expect(esquinaDelMargenEn([pieza('p1', 100, 100, { seamAllowance: 0 })], { x: 93, y: 93 }, 1, true)).toBeNull();
  });

  it('sobre el margen de un borde, lejos de su esquina, nada: eso sigue siendo vacío', () => {
    expect(esquinaDelMargenEn([p1], { x: 160, y: 93 }, 1, true)).toBeNull();
  });

  it('fuera de la línea de corte, cerca del vértice, nada: ese clic sigue soltando la selección y tirando la goma', () => {
    // Revisión final de P3c (lente A): el disco de 24 px alrededor del vértice
    // robaba el clic al aire en una zona que no se ve. (80, 95) está a 10 mm
    // de la línea de corte, fuera de la banda pintada.
    expect(esquinaDelMargenEn([p1], { x: 80, y: 95 }, 1, true)).toBeNull();
  });

  it('dentro del contorno neto, junto al vértice, nada: el clic es de la pieza aunque su relleno no lo reciba («alambre»)', () => {
    expect(esquinaDelMargenEn([p1], { x: 104, y: 104 }, 1, true)).toBeNull();
  });

  it('un dobladillo ancho en otro borde no agranda la zona de esta esquina', () => {
    const conDobladillo = pieza('h', 100, 100, {
      edges: [{ id: 'h:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'seam', length: 300, seamAllowanceWidth: 40 }],
    });
    // La esquina de arriba a la izquierda tiene 10 mm a los dos lados: (75, 75) queda fuera de su banda.
    expect(esquinaDelMargenEn([conDobladillo], { x: 75, y: 75 }, 1, true)).toBeNull();
    expect(esquinaDelMargenEn([conDobladillo], { x: 93, y: 93 }, 1, true)).toEqual({ pieceId: 'h', vertexIndex: 0 });
  });

  it('a zoom alto, la punta exacta del margen sigue eligiendo su esquina', () => {
    // La punta (90, 90) está a 14,1 mm del vértice (lente B, M4).
    expect(esquinaDelMargenEn([p1], { x: 90, y: 90 }, 4, true)).toEqual({ pieceId: 'p1', vertexIndex: 0 });
  });

  it('la orilla de la línea de corte se mide en px: a menos zoom, abarca más patrón', () => {
    // (84, 84) está fuera del corte, a 8,5 mm de la punta. Zoom 0,5: 6 px = 12 mm → elige.
    expect(esquinaDelMargenEn([p1], { x: 84, y: 84 }, 0.5, true)).toEqual({ pieceId: 'p1', vertexIndex: 0 });
    // Zoom 2: 6 px = 3 mm → no.
    expect(esquinaDelMargenEn([p1], { x: 84, y: 84 }, 2, true)).toBeNull();
  });

  it('entre dos piezas, la esquina más cercana', () => {
    // La esquina de arriba a la derecha de p1 está en (400, 100); la de arriba a la izquierda de p2, en (406, 100).
    const p2 = pieza('p2', 406, 100);
    expect(esquinaDelMargenEn([p1, p2], { x: 405, y: 96 }, 1, true)).toEqual({ pieceId: 'p2', vertexIndex: 0 });
    expect(esquinaDelMargenEn([p1, p2], { x: 401, y: 96 }, 1, true)).toEqual({ pieceId: 'p1', vertexIndex: 1 });
  });

  it('una pieza girada: la punta de su esquina, donde la pinta el lienzo', () => {
    const girada = pieza('g', 100, 100, { rotation: 90 });
    const vertice = pieceLocalToPattern({ x: 0, y: 0 }, girada);
    const centro = pieceLocalToPattern({ x: 150, y: 100 }, girada);
    const d = Math.hypot(vertice.x - centro.x, vertice.y - centro.y);
    const fuera = {
      x: vertice.x + ((vertice.x - centro.x) / d) * 5,
      y: vertice.y + ((vertice.y - centro.y) / d) * 5,
    };
    expect(esquinaDelMargenEn([girada], fuera, 1, true)).toEqual({ pieceId: 'g', vertexIndex: 0 });
  });
});

describe('margenMasAncho', () => {
  it('el mayor del escalar de la pieza, el de cada borde y el de cada tramo', () => {
    expect(margenMasAncho(pieza('a', 0, 0))).toBe(10);
    expect(margenMasAncho(pieza('a', 0, 0, {
      seamAllowance: 0,
      edges: [
        { id: 'a:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 300, seamAllowanceWidth: 12 },
        { id: 'a:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam', length: 200,
          seamAllowanceSpans: [{ tStart: 0, tEnd: 0.5, width: 15 }] },
      ],
    }))).toBe(15);
  });
});

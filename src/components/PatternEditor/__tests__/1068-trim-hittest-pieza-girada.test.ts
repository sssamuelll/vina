/**
 * #1068 — colocar un avio no enganchaba el borde donde SE VE.
 *
 * `findClosestEdgePoint` construia el punto de patron sumando solo
 * `piece.position` al punto local del borde, asi que sobre una pieza girada
 * comparaba el cursor contra la sombra sin girar. Con el umbral de 20px eso no
 * engancha NADA: la usuaria no puede colocar el avio.
 *
 * Es uno de los dos sitios con impacto de usuario confirmado del censo de
 * #1068; el otro es `useWalkSeamTool`.
 *
 * El punto de referencia se PREGUNTA a `interpolateEdgePoint` en vez de
 * escribirlo a mano. No es comodidad: `segmentRange` esta declarado en espacio
 * de COMANDO (`types.ts:376`, y `edgePicker.ts:158` lo convierte con
 * `commandRangeToFlattened`) pero `interpolateEdgePoint` lo indexa contra el
 * array APLANADO sin convertir. Ese desajuste es un bug aparte —se ve en
 * cuanto el contorno tiene curvas— y este test no debe depender de como se
 * resuelva: lo que afirma es la ROTACION, sea cual sea el borde que la funcion
 * elija.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { interpolateEdgePoint } from '../../../utils/geometry/edgeInterpolation';
import { outlineBBoxCenter, rotatePoint } from '../../../utils/geometry/transform';
import { findClosestEdgePoint } from '../useTrimTool';

/** 100 x 40 en local; centro del bbox (50, 20). */
const pieza = (rotation: number, position = { x: 0, y: 0 }) => ({
  id: 'p1', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'e1', name: 'superior', segmentRange: [1, 2], edgeType: 'seam' },
  ],
  position, rotation,
  mirrored: false, seamAllowance: 0, internals: [],
}) as unknown as PatternPiece;

/** Donde la mitad del borde CAE EN LOCAL, segun la propia funcion de bordes. */
const mitadLocal = interpolateEdgePoint(pieza(0), 'superior', 0.5)!.point;

/** Y donde SE VE cuando la pieza esta girada `deg` sobre el centro del bbox. */
const mitadVista = (deg: number) => rotatePoint(
  mitadLocal, outlineBBoxCenter(pieza(0).outline), deg * Math.PI / 180,
);

describe('#1068 — colocar un avio sobre una pieza girada', () => {
  it('el fixture engancha sin rotacion (si no, el resto no prueba nada)', () => {
    const hit = findClosestEdgePoint(mitadLocal, [pieza(0)], 1);
    expect(hit).not.toBeNull();
    expect(hit!.edgeName).toBe('superior');
  });

  it('clicar donde el borde se ve engancha ESE borde', () => {
    const visto = mitadVista(90);
    const hit = findClosestEdgePoint(visto, [pieza(90)], 1);
    expect(hit).not.toBeNull();
    expect(hit!.edgeName).toBe('superior');
  });

  it('el punto enganchado esta donde la usuaria clico, no en la sombra', () => {
    const visto = mitadVista(90);
    const hit = findClosestEdgePoint(visto, [pieza(90)], 1);
    expect(hit!.point.x).toBeCloseTo(visto.x, 1);
    expect(hit!.point.y).toBeCloseTo(visto.y, 1);
  });

  it('clicar en la sombra sin girar ya NO engancha', () => {
    // Antes del arreglo este era el UNICO sitio que enganchaba, y esta a 28.3
    // del borde visible — mas que el umbral de 20.
    expect(findClosestEdgePoint(mitadLocal, [pieza(90)], 1)).toBeNull();
  });

  it('la posicion de la pieza sigue contando ademas del giro', () => {
    const desplazada = { x: 300, y: 5 };
    const visto = mitadVista(90);
    const hit = findClosestEdgePoint(
      { x: visto.x + desplazada.x, y: visto.y + desplazada.y },
      [pieza(90, desplazada)], 1,
    );
    expect(hit).not.toBeNull();
    expect(hit!.edgeName).toBe('superior');
  });

  it('un giro de 180 tampoco engancha en la sombra', () => {
    const visto = mitadVista(180);
    expect(findClosestEdgePoint(visto, [pieza(180)], 1)).not.toBeNull();
    expect(findClosestEdgePoint(mitadLocal, [pieza(180)], 1)).toBeNull();
  });
});

/**
 * #1068 — la distancia de recorrido no des-giraba el cursor.
 *
 * `handleMouseMove` calculaba el punto local restando solo
 * `stationary.piece.position`, asi que sobre una pieza girada proyectaba el
 * cursor contra el contorno sin girar. El numero que la usuaria lee en el
 * panel de metricas —cuanto lleva recorrido de la costura— sale mal, y con el
 * el fantasma que lo acompaña.
 *
 * Es el gemelo textual del `localPt` de `useMeasureTool`, arreglado en el lote
 * 3, en el archivo de al lado. Uno de los dos sitios con impacto de usuario
 * confirmado del censo.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { outlineBBoxCenter, rotatePoint } from '../../../utils/geometry/transform';
import { walkDistanceAt } from '../useWalkSeamTool';

/** 100 x 80 en local; centro del bbox (50, 40). */
const pieza = (rotation: number, position = { x: 0, y: 0 }) => ({
  id: 'pA', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 80] },
    { type: 'L', values: [0, 80] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'eA1', name: 'superior', segmentRange: [1, 2], edgeType: 'seam' },
  ],
  position, rotation,
  mirrored: false, seamAllowance: 0, internals: [],
}) as unknown as PatternPiece;

const borde = () => pieza(0).edges![0] as SemanticEdge;

/** La mitad del borde superior, en local. */
const MITAD_LOCAL = { x: 50, y: 0 };

const vista = (deg: number, p: PatternPiece) => rotatePoint(
  MITAD_LOCAL, outlineBBoxCenter(p.outline), deg * Math.PI / 180,
);

describe('#1068 — la distancia de recorrido sobre una pieza girada', () => {
  it('sin rotacion mide la mitad del borde (si no, el resto no prueba nada)', () => {
    expect(walkDistanceAt(MITAD_LOCAL, pieza(0), borde())).toBeCloseTo(50, 1);
  });

  it('girada, el cursor donde el borde SE VE mide lo mismo', () => {
    const p = pieza(90);
    expect(walkDistanceAt(vista(90, p), p, borde())).toBeCloseTo(50, 1);
  });

  it('el fallo que tenia: sin des-girar, la mitad medía 90 en vez de 50', () => {
    // El punto visible es (90,40). Restar solo `position` lo proyectaba sobre
    // el borde sin girar y devolvia 90 — casi el borde entero.
    const p = pieza(90);
    const visto = vista(90, p);
    expect(visto.x).toBeCloseTo(90, 1);
    expect(visto.y).toBeCloseTo(40, 1);
    expect(walkDistanceAt(visto, p, borde())).not.toBeCloseTo(90, 1);
  });

  it('la posicion de la pieza sigue contando ademas del giro', () => {
    const off = { x: 250, y: 15 };
    const p = pieza(90, off);
    const visto = vista(90, p);
    const d = walkDistanceAt({ x: visto.x + off.x, y: visto.y + off.y }, p, borde());
    expect(d).toBeCloseTo(50, 1);
  });

  it('un cuarto del borde mide un cuarto, girada', () => {
    const p = pieza(90);
    const cuarto = rotatePoint(
      { x: 25, y: 0 }, outlineBBoxCenter(p.outline), 90 * Math.PI / 180,
    );
    expect(walkDistanceAt(cuarto, p, borde())).toBeCloseTo(25, 1);
  });
});

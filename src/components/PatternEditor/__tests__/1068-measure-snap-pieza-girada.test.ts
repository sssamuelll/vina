/**
 * #1068 — el snap de medir entraba bien y salia mal.
 *
 * `snapToOutline` ya pasaba el cursor por `patternToPieceLocal` para buscar,
 * pero devolvia el punto encontrado sumando solo `piece.position`. Sobre una
 * pieza girada eso da un punto que NO esta donde se ve: la medida se ancla a
 * la sombra sin girar.
 *
 * La asimetria es el sintoma que delata el fallo — si una direccion necesita
 * el helper, la otra tambien.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { snapToOutline } from '../useMeasureTool';

/** 100 x 40 en local; centro del bbox (50, 20). */
const pieza = (rotation: number) => ({
  id: 'p1', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation,
  mirrored: false, seamAllowance: 0, internals: [],
}) as unknown as PatternPiece;


describe('#1068 — medir sobre una pieza girada', () => {
  it('el snap devuelve el punto donde SE VE, no su sombra', () => {
    // El borde local (0,0)->(100,0) se ve como la vertical x=70 entre
    // y=-30 e y=70. Un cursor en (72, 20) tiene que pegarse a (70, 20).
    const snap = snapToOutline({ x: 72, y: 20 }, pieza(90), 1);
    expect(snap).not.toBeNull();
    expect(snap!.point.x).toBeCloseTo(70, 3);
    expect(snap!.point.y).toBeCloseTo(20, 3);
  });

  // `buildEdgeInfo` (pathPoints / walkPoints) lleva la misma sustitucion, pero
  // sin caso propio: no consegui que `samplePathDense` produjera puntos con un
  // `segmentRange` sintetico, y un test que no ejercita nada da senal falsa.
  // Lo que lo cubre es el trinquete de #1069 —el archivo ya no tiene ninguna
  // conversion cruda— mas este caso del snap, que es la misma linea de codigo.

  it('sin rotacion se comporta igual que siempre', () => {
    const snap = snapToOutline({ x: 30, y: 2 }, pieza(0), 1);
    expect(snap!.point.x).toBeCloseTo(30, 3);
    expect(snap!.point.y).toBeCloseTo(0, 3);
  });
});

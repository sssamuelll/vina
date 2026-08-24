/**
 * #1068 — el arco del tramo se dibujaba en la sombra sin girar.
 *
 * Este NO es deuda heredada: es una DIVISION que abri yo. El lote 1 giro los
 * circulos del arrastre de piquete (`dragPreview.refWorld` / `currentWorld`,
 * useNotchTool.ts) y dejo `segmentArcPoints` sumando la posicion a mano. Antes
 * las dos cosas estaban mal juntas y coincidian; despues, los circulos quedaron
 * en su sitio y el trazo punteado que los une a 76 mm de sus propios extremos.
 *
 * El trinquete no lo vio por un rodeo nuevo: `piece.position?.x` con
 * encadenamiento opcional no casa `\.position\.[xy]`.
 *
 * Rectangulo con posicion NO nula: un cuadrado girado 90 ocupa el mismo sitio,
 * y con position (0,0) un fix que gira pero olvida trasladar pasaria igual.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import type { SegmentSelection } from '../useSegmentSewingTool';
import { segmentArcPoints } from '../renderers/overlays/segmentArc';

/** 100 x 40 en local; centro del bbox (50, 20); desplazada a (200, 100). */
const pieza = (rotation: number) => ({
  id: 'p1', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  position: { x: 200, y: 100 }, rotation,
  mirrored: false, seamAllowance: 0, internals: [], edges: [],
}) as unknown as PatternPiece;

const tramo: SegmentSelection = {
  pieceId: 'p1',
  edgeIndex: 1,
  edgeRange: [1, 1],
  startT: 0,
  endT: 1,
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 100, y: 0 },
};

describe('#1068 — el arco del tramo sobre una pieza girada', () => {
  it('los extremos del arco caen donde el borde SE VE', () => {
    // Girado 90 sobre (50,20) y desplazado a (200,100): el borde local
    // (0,0)->(100,0) se ve como la vertical x=270, de y=70 a y=170.
    // Sin el fix devuelve (200,100)->(300,100): la horizontal sin girar.
    const pts = segmentArcPoints(pieza(90), tramo)!;
    expect(pts).not.toBeNull();
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0].x).toBeCloseTo(270, 3);
    expect(pts[0].y).toBeCloseTo(70, 3);
    expect(pts[pts.length - 1].x).toBeCloseTo(270, 3);
    expect(pts[pts.length - 1].y).toBeCloseTo(170, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const pts = segmentArcPoints(pieza(0), tramo)!;
    expect(pts[0].x).toBeCloseTo(200, 3);
    expect(pts[0].y).toBeCloseTo(100, 3);
    expect(pts[pts.length - 1].x).toBeCloseTo(300, 3);
    expect(pts[pts.length - 1].y).toBeCloseTo(100, 3);
  });
});

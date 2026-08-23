/**
 * #1068 — el hit-testing de coser no giraba con la pieza.
 *
 * A diferencia de los lotes anteriores, esto NO es cosmetico. `sewingUtils`
 * alimenta `findClosestEdge`, que decide QUE BORDE se cose. Con una pieza
 * girada el `path` de la seleccion se construia desde el contorno crudo mas la
 * posicion, asi que el cursor se comparaba contra la sombra sin girar:
 * enganchaba el borde equivocado, y coser el borde equivocado si estropea el
 * patron.
 *
 * Es el hermano de rotacion de #1042, que va del mismo resalte por otro lado.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { buildEdgeSelection, findClosestEdge } from '../sewingUtils';

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
  mirrored: false, seamAllowance: 0, internals: [], edges: [],
}) as unknown as PatternPiece;

// Girado 90 sobre (50,20): el borde local (0,0)->(100,0) —comando 1— se ve
// como la vertical x=70, de y=-30 a y=70.
const VISTO_INI = { x: 70, y: -30 };
const VISTO_FIN = { x: 70, y: 70 };

describe('#1068 — coser sobre una pieza girada', () => {
  it('la seleccion describe el borde donde SE VE', () => {
    const sel = buildEdgeSelection(pieza(90), 1)!;
    expect(sel).not.toBeNull();
    expect(sel.start.x).toBeCloseTo(VISTO_INI.x, 3);
    expect(sel.start.y).toBeCloseTo(VISTO_INI.y, 3);
    expect(sel.end.x).toBeCloseTo(VISTO_FIN.x, 3);
    expect(sel.end.y).toBeCloseTo(VISTO_FIN.y, 3);
  });

  it('clicar donde el borde se ve engancha ESE borde', () => {
    // (70, 20) esta justo encima del borde visible. Sin el fix cae a 20
    // unidades de dos bordes distintos y engancha el que no es.
    const sel = findClosestEdge({ x: 70, y: 20 }, [pieza(90)], 1, 'free');
    expect(sel).not.toBeNull();
    expect(sel!.edgeIndex).toBe(1);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const sel = buildEdgeSelection(pieza(0), 1)!;
    expect(sel.start.x).toBeCloseTo(0, 3);
    expect(sel.start.y).toBeCloseTo(0, 3);
    expect(sel.end.x).toBeCloseTo(100, 3);
    expect(sel.end.y).toBeCloseTo(0, 3);
  });
});

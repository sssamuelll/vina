import { describe, it, expect } from 'vitest';
import { buildEdgeSelection, findClosestEdge, resolveEdgeName } from '../sewingUtils';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

/**
 * #1042 — la herramienta de coser de borde entero resaltaba UN COMANDO y cosía
 * el BORDE completo.
 *
 * `buildEdgeSelection` construía el trazo con `commandPolyline(outline,
 * edgeIndex)`, pero `resolveEdgeName` (mismo archivo) resuelve el borde
 * semántico entero, y ESE es el nombre que viaja al `Seam`. En un rectángulo
 * dibujado a mano coinciden; en un patrón importado un borde son 14-20
 * comandos, así que ella clicaba un lado, se le iluminaba una veinteava parte,
 * y la costura cosía el lado entero. El resalte no es un adorno: es la única
 * señal de qué se va a coser.
 *
 * Lo que NO cambia: el hit-test del modo 'point' sigue enganchando a los
 * vértices del COMANDO. "Clica cerca de un punto del contorno" es lo que ese
 * modo promete, y los vértices intermedios de una polilínea densa siguen
 * siendo puntos del contorno. Lo que cambia es lo que se DEVUELVE.
 */

/** Lado de arriba partido en dos comandos, como deja meter un punto o un DXF. */
const partida: PatternPiece = {
  id: 'p1',
  name: 'Pieza',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [30, 0] },    // 1: primer tramo del lado de arriba
    { type: 'L', values: [100, 0] },   // 2: el resto del MISMO lado
    { type: 'L', values: [100, 80] },  // 3: derecha
    { type: 'L', values: [0, 80] },    // 4: abajo
    { type: 'Z', values: [] },         // 5: izquierda
  ],
  edges: [
    { id: 'e-top', name: 'arriba', segmentRange: [1, 3] },
    { id: 'e-right', name: 'derecha', segmentRange: [3, 4] },
    { id: 'e-bottom', name: 'abajo', segmentRange: [4, 5] },
  ] as SemanticEdge[],
  position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

const rangoX = (pts: { x: number }[]) => [
  Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)),
];

describe('#1042 — el resalte enseña el borde que se va a coser', () => {
  it('el trazo cubre el borde entero, no el comando clicado', () => {
    const sel = buildEdgeSelection(partida, 1)!;
    expect(rangoX(sel.path)).toEqual([0, 100]); // recortado al comando: [0, 30]
  });

  it('los dos comandos del mismo borde dan la MISMA selección', () => {
    const a = buildEdgeSelection(partida, 1)!;
    const b = buildEdgeSelection(partida, 2)!;
    expect(a.path).toEqual(b.path);
    expect(a.start).toEqual(b.start);
    expect(a.end).toEqual(b.end);
  });

  it('los extremos son los del borde, que es donde van los dos puntos', () => {
    const sel = buildEdgeSelection(partida, 1)!;
    expect(sel.start).toEqual({ x: 0, y: 0 });
    expect(sel.end).toEqual({ x: 100, y: 0 });
    expect(sel.midpoint).toEqual({ x: 50, y: 0 });
  });

  it('lo resaltado y lo cosido coinciden', () => {
    const sel = buildEdgeSelection(partida, 2)!;
    expect(resolveEdgeName(partida, sel.edgeIndex)).toBe('arriba');
    expect(rangoX(sel.path)).toEqual([0, 100]);
  });

  it('un borde de un solo comando no cambia', () => {
    const sel = buildEdgeSelection(partida, 3)!;
    expect(sel.start).toEqual({ x: 100, y: 0 });
    expect(sel.end).toEqual({ x: 100, y: 80 });
  });

  it('la posición de la pieza sigue aplicándose al trazo', () => {
    const movida = { ...partida, position: { x: 500, y: 200 } };
    const sel = buildEdgeSelection(movida, 1)!;
    expect(rangoX(sel.path)).toEqual([500, 600]);
    expect(sel.start).toEqual({ x: 500, y: 200 });
  });

  it('sin bordes semánticos se queda en el comando, como antes', () => {
    const legacy = { ...partida, edges: undefined } as unknown as PatternPiece;
    const sel = buildEdgeSelection(legacy, 1)!;
    expect(rangoX(sel.path)).toEqual([0, 30]);
  });
});

describe('#1042 — el hit-test no cambia', () => {
  it('clicar en la segunda mitad del lado de arriba engancha el borde entero', () => {
    const sel = findClosestEdge({ x: 70, y: 1 }, [partida], 1, 'free')!;
    expect(sel).not.toBeNull();
    expect(resolveEdgeName(partida, sel.edgeIndex)).toBe('arriba');
    expect(rangoX(sel.path)).toEqual([0, 100]);
  });

  it('el modo punto SIGUE enganchando al vértice de en medio', () => {
    // (30,0) es el punto que parte el lado: es un vértice del contorno y
    // seguía siendo un blanco válido. No puede dejar de serlo.
    const sel = findClosestEdge({ x: 31, y: 1 }, [partida], 1, 'point');
    expect(sel).not.toBeNull();
    expect(resolveEdgeName(partida, sel!.edgeIndex)).toBe('arriba');
  });

  it('el modo punto no engancha lejos de todo vértice', () => {
    expect(findClosestEdge({ x: 65, y: 1 }, [partida], 1, 'point')).toBeNull();
  });

  it('otros bordes siguen enganchando por su lado', () => {
    const der = findClosestEdge({ x: 99, y: 40 }, [partida], 1, 'free')!;
    expect(resolveEdgeName(partida, der.edgeIndex)).toBe('derecha');
  });
});

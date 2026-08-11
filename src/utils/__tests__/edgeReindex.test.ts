import { describe, it, expect } from 'vitest';
import { reindexEdges, sameSegmentRanges } from '../edgeReindex';
import { detectSemanticEdges } from '../semanticEdges';
import { splitSegmentAt } from '../../components/PatternEditor/nodeEditorUtils';
import reducer, { restoreState, updatePiece } from '../../store/projectSlice';
import { resolveEdgeName } from '../../components/PatternEditor/sewingUtils';
import type { PatternPiece, PathCommand, SemanticEdge } from '../../types/types';

/**
 * samuel/#1043 — `SemanticEdge.segmentRange` es un rango de ÍNDICES sobre
 * `piece.outline`. Los bordes se detectan una sola vez (al crear o al cargar) y
 * `updatePiece` reemplaza la pieza entera sin volver a mirarlos. Cualquier
 * verbo que INSERTE o QUITE un comando corre los índices y deja los rangos
 * apuntando al sitio equivocado.
 *
 * Lo caro no es el resalte: `resolveEdgeName` devuelve el nombre del borde a
 * partir del comando clicado, y ese nombre es lo que persiste en el `Seam` y lo
 * que lee el solver. Con los rangos corridos, coser el lado de arriba puede
 * guardarse como si fuera el derecho.
 */

const rect = (): PathCommand[] => [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },   // 1: arriba
  { type: 'L', values: [200, 150] }, // 2: derecha
  { type: 'L', values: [0, 150] },   // 3: abajo
  { type: 'Z', values: [] },         // 4: izquierda
];

const piece = (outline: PathCommand[], edges?: SemanticEdge[]): PatternPiece => ({
  id: 'p', name: 'Delantero', outline, position: { x: 0, y: 0 },
  rotation: 0, mirrored: false, seamAllowance: 0, internals: [],
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  ...(edges ? { edges } : {}),
} as unknown as PatternPiece);

const ranges = (edges: SemanticEdge[] | undefined) =>
  (edges ?? []).map(e => `${e.name}[${e.segmentRange[0]},${e.segmentRange[1]})`);

describe('reindexEdges — insertar un comando', () => {
  const edges = [
    { id: 'a', name: 'arriba', segmentRange: [1, 2] },
    { id: 'b', name: 'derecha', segmentRange: [2, 3] },
    { id: 'c', name: 'abajo', segmentRange: [3, 4] },
  ] as SemanticEdge[];

  it('el borde partido CRECE y los siguientes se corren', () => {
    const nuevo = splitSegmentAt(rect(), 1, 0.5); // parte el lado de arriba
    expect(nuevo.length).toBe(6);
    const out = reindexEdges(edges, rect(), nuevo)!;
    expect(ranges(out)).toEqual(['arriba[1,3)', 'derecha[3,4)', 'abajo[4,5)']);
  });

  it('partir un borde de en medio no toca a los anteriores', () => {
    const nuevo = splitSegmentAt(rect(), 3, 0.5); // parte el de abajo
    const out = reindexEdges(edges, rect(), nuevo)!;
    expect(ranges(out)).toEqual(['arriba[1,2)', 'derecha[2,3)', 'abajo[3,5)']);
  });

  it('sin cambio de largo devuelve el MISMO array (no inventa trabajo)', () => {
    const movido = rect();
    movido[1] = { type: 'L', values: [180, 0] };
    expect(reindexEdges(edges, rect(), movido)).toBe(edges);
  });

  it('quitar un comando encoge el borde y corre los siguientes', () => {
    const partido = splitSegmentAt(rect(), 1, 0.5);
    const partidoEdges = reindexEdges(edges, rect(), partido)!;
    const out = reindexEdges(partidoEdges, partido, rect())!;
    expect(ranges(out)).toEqual(['arriba[1,2)', 'derecha[2,3)', 'abajo[3,4)']);
  });

  it('si el resultado sale degenerado no toca nada — mejor viejo que corrupto', () => {
    const unSoloComando = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
    ] as PathCommand[];
    const out = reindexEdges(edges, rect(), unSoloComando);
    expect(out).toBe(edges);
  });
});

describe('sameSegmentRanges — distinguir el arrastre sucio del recálculo', () => {
  const a = [{ id: 'x', name: 'n', segmentRange: [1, 2] }] as SemanticEdge[];

  it('el mismo contenido es un arrastre: hay que reindexar', () => {
    expect(sameSegmentRanges(a, [{ id: 'x', name: 'n', segmentRange: [1, 2] }] as SemanticEdge[])).toBe(true);
  });

  it('rangos distintos = el llamador ya los recalculó: no tocar', () => {
    expect(sameSegmentRanges(a, [{ id: 'x', name: 'n', segmentRange: [1, 4] }] as SemanticEdge[])).toBe(false);
  });

  it('otra cantidad de bordes tampoco es un arrastre', () => {
    expect(sameSegmentRanges(a, [])).toBe(false);
    expect(sameSegmentRanges(a, undefined)).toBe(false);
    expect(sameSegmentRanges(undefined, a)).toBe(false);
  });
});

describe('#1043 — coser un lado deja de guardarse con el nombre de otro', () => {
  it('tras meter un punto, el comando nuevo sigue siendo el borde de arriba', () => {
    const outline = rect();
    const p0 = piece(outline);
    const edges = detectSemanticEdges(p0);
    const arriba = edges.find(e => e.segmentRange[0] === 1)!;
    const derecha = edges.find(e => e.segmentRange[0] === 2)!;

    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(state, restoreState({ ...state, pieces: [piece(outline, edges)] }));

    // El tool Punto parte el lado de arriba: el contorno pasa a 6 comandos y
    // ese lado son ahora los comandos 1 Y 2.
    const nuevoOutline = splitSegmentAt(outline, 1, 0.5);
    state = reducer(state, updatePiece({ ...state.pieces[0], outline: nuevoOutline }));

    const p = state.pieces[0];
    expect(p.outline.length).toBe(6);
    // Sin reindexar, el comando 2 caía en el rango de 'derecha'.
    expect(resolveEdgeName(p, 1)).toBe(arriba.name);
    expect(resolveEdgeName(p, 2)).toBe(arriba.name);
    expect(resolveEdgeName(p, 3)).toBe(derecha.name);
  });

  it('un llamador que recalcula los bordes NO se ve corrido dos veces', () => {
    const outline = rect();
    const edges = detectSemanticEdges(piece(outline));
    let state = reducer(undefined, { type: '@@INIT' });
    state = reducer(state, restoreState({ ...state, pieces: [piece(outline, edges)] }));

    const nuevoOutline = splitSegmentAt(outline, 1, 0.5);
    const frescos = detectSemanticEdges(piece(nuevoOutline));
    state = reducer(state, updatePiece({
      ...state.pieces[0], outline: nuevoOutline, edges: frescos,
    }));

    expect(state.pieces[0].edges).toEqual(frescos);
  });
});

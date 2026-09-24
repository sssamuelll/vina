/** Las cotas del punto elegido de una interna en Q (spec 2026-09-24 § 4.5). */
import { describe, it, expect } from 'vitest';
import type { InternalLine, PatternPiece } from '../../../../types/types';
import { cotasDelSujeto, type SujetoInput } from '../sujeto';

const pieza = {
  id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0, edges: [],
  outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 150] }, { type: 'Z', values: [] }],
  internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }] }],
} as unknown as PatternPiece;

describe('el punto elegido de una interna es sujeto de cotas', () => {
  it('sus dos largos, de su línea', () => {
    const s = cotasDelSujeto({
      activeTool: 'editPattern', pieces: [pieza], selectedPieceIds: ['p'], selectedInternalLine: { pieceId: 'p', lineId: 'L' },
      hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
      nodoSeleccionado: { pieceId: 'p', commandIndex: 1, lineId: 'L' },
    }, { width: 100, height: 100 });
    expect(s.cotas.map(c => c.id)).toEqual(['nodo-L-1-anterior', 'nodo-L-1-siguiente']);
    expect(s.lineaDeSujeto).toBe('Editando: el punto seleccionado');
  });
});

/**
 * La tabla de § 4.5, en Q: un punto, sus dos largos (arriba); un tramo, su
 * largo y su ángulo; varios puntos, ninguna. Y lo que se escribe en Q pasa por
 * Q (`moveNodeTo`), como el lado del contorno: escrito por la línea, el hook lo
 * leía como un cambio de fuera y soltaba el tramo —y con él el campo Ángulo al
 * que iba el Tab— (revisión final de la frontera, I-2).
 */
describe('en Q, las cotas de una interna son las de lo elegido (spec § 4.5)', () => {
  const entrada = (over: Partial<SujetoInput>): SujetoInput => ({
    activeTool: 'editPattern', pieces: [pieza], selectedPieceIds: ['p'], selectedInternalLine: null,
    hotId: null, isDragging: false, contextMenuOpen: false, calibrationActive: false, hiddenLayerIds: [], layerLocked: {},
    ...over,
  });
  const RECT = { width: 100, height: 100 };

  it('varios puntos de una interna —la elegida sin tramo y sin punto único—: ninguna cota', () => {
    const s = cotasDelSujeto(entrada({ selectedInternalLine: { pieceId: 'p', lineId: 'L' } }), RECT);
    expect(s.cotas).toEqual([]);
  });

  it('en Z, la misma línea entera conserva las suyas', () => {
    const s = cotasDelSujeto(entrada({ activeTool: 'select', selectedInternalLine: { pieceId: 'p', lineId: 'L' } }), RECT);
    expect(s.cotas.length).toBeGreaterThan(0);
    expect(s.lineaDeSujeto).toBe(`Editando: la línea seleccionada · ${s.cotas.length} cotas`);
  });

  it('un tramo: el mismo largo y ángulo que en Z, escritos por el punto con su lineId', () => {
    const tramo = { pieceId: 'p', lineId: 'L', segmentIndex: 1 };
    const q = cotasDelSujeto(entrada({ selectedInternalLine: tramo }), RECT);
    const z = cotasDelSujeto(entrada({ activeTool: 'select', selectedInternalLine: tramo }), RECT);
    expect(q.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(q.cotas.map(c => [c.id, c.valueMm, c.referenceLabel])).toEqual(z.cotas.map(c => [c.id, c.valueMm, c.referenceLabel]));
    expect(q.lineaDeSujeto).toBe('Editando: el tramo seleccionado');

    const largo = q.cotas[0].apply(150);
    expect(largo).toMatchObject({ kind: 'nodo', pieceId: 'p', commandIndex: 1, lineId: 'L' });
    const destino = (largo as { destino: { x: number; y: number } }).destino;
    expect(destino.x).toBeCloseTo(170, 9);
    expect(destino.y).toBeCloseTo(20, 9);
    expect(q.cotas[1].apply(-90)).toMatchObject({ kind: 'nodo', pieceId: 'p', commandIndex: 1, lineId: 'L' });
    // En Z, la de siempre: por la línea.
    expect(z.cotas[0].apply(150)).toMatchObject({ kind: 'internal', pieceId: 'p', lineId: 'L' });
  });

  it('un tramo de una interna que Q no edita (el doblez de un pliegue, elegido en Z) sigue escribiendo por su línea', () => {
    const doblez: InternalLine = {
      id: 'F', type: 'fold', foldOptions: { direction: 'mountain', creaseAngleDeg: 180, pleatId: 'pl' },
      path: [{ type: 'M', values: [20, 60] }, { type: 'L', values: [120, 60] }],
    };
    const conDoblez = { ...pieza, internals: [doblez] } as PatternPiece;
    const s = cotasDelSujeto(entrada({ pieces: [conDoblez], selectedInternalLine: { pieceId: 'p', lineId: 'F', segmentIndex: 1 } }), RECT);
    expect(s.cotas[0].apply(150)).toMatchObject({ kind: 'internal', pieceId: 'p', lineId: 'F' });
  });
});

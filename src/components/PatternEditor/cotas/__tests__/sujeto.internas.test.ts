/** Las cotas del punto elegido de una interna en Q (spec 2026-09-24 § 4.5). */
import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { cotasDelSujeto } from '../sujeto';

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

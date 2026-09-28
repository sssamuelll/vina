/**
 * Supr sobre un tramo de interna quita SOLO ese tramo (spec 2026-09-24 § 4.6;
 * contrato 08-09 § 5), por el mismo reductor desde Q y desde Z.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, removeInternalLine, removeTramosDeInterna } from '../projectSlice';
import { resolverBorrado } from '../borradoDeSeleccion';
import { applyDartsToInternals, extractDarts } from '../../utils/dartEntity';
import type { InternalLine, PatternPiece } from '../../types/types';

const ELE: InternalLine = {
  id: 'L', type: 'fold', foldOptions: { direction: 'mountain', creaseAngleDeg: 180 },
  path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }],
};
function montar(internals: InternalLine[] = [ELE], extra: Partial<PatternPiece> = {}) {
  const store = configureStore({ reducer: { project: projectReducer } });
  const piece = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 200] }, { type: 'Z', values: [] }],
    internals, edges: [], ...extra,
  } as unknown as PatternPiece;
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece], isDirty: false }));
  return store;
}

describe('removeTramosDeInterna', () => {
  it('el tramo del medio parte la interna: el primer trozo conserva id, tipo y opciones', () => {
    const store = montar();
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [2] }));
    const internas = store.getState().project.pieces[0].internals;
    expect(internas).toHaveLength(2);
    expect(internas[0].id).toBe('L');
    expect(internas[1].id).not.toBe('L');
    expect(internas.every(l => l.type === 'fold' && l.foldOptions?.direction === 'mountain')).toBe(true);
  });

  it('sin trozos, la interna se va', () => {
    const store = montar([{ ...ELE, path: ELE.path.slice(0, 2) }]);
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [1] }));
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('un índice que no es tramo no ensucia el proyecto', () => {
    const store = montar();
    store.dispatch(removeTramosDeInterna({ pieceId: 'p', lineId: 'L', segmentIndices: [0] }));
    expect(store.getState().project.isDirty).toBe(false);
  });
});

/**
 * Supr sobre un tramo de pinza se la lleva entera por `removeInternalLine`
 * (spec § 4.6), desde Q y desde las dos puertas de Z. La pinza es dos datos
 * enlazados por el id (#1016): su línea y su copia `piece.darts`. Si el
 * reductor quita solo la línea, la siguiente operación de pinza
 * (`applyDartsToInternals`) vuelve a dibujar la que se borró (spec § 7).
 */
describe('removeInternalLine y la copia de las pinzas (spec § 7)', () => {
  const pinza = (id: string, x: number): InternalLine => ({
    id, type: 'dart', dartOptions: { capShape: 'pointed' },
    path: [{ type: 'M', values: [x, 0] }, { type: 'L', values: [x + 10, 50] }, { type: 'L', values: [x + 20, 0] }],
  });
  const conCopia = (internals: InternalLine[]) => ({ darts: extractDarts({ internals, edges: [] } as unknown as PatternPiece) });

  it('quitar la línea de una pinza quita su Dart; una operación de pinza después no la resucita', () => {
    const internals = [pinza('d1', 20), pinza('d2', 120)];
    const store = montar(internals, conCopia(internals));
    store.dispatch(removeInternalLine({ pieceId: 'p', lineId: 'd1' }));
    const piece = store.getState().project.pieces[0];
    expect(piece.internals.map(l => l.id)).toEqual(['d2']);
    expect(piece.darts!.map(d => d.id)).toEqual(['d2']);
    expect(applyDartsToInternals(piece, piece.darts!).map(l => l.id)).toEqual(['d2']);
  });

  it('una pieza sin copia sigue sin ella', () => {
    const store = montar([pinza('d1', 20)]);
    store.dispatch(removeInternalLine({ pieceId: 'p', lineId: 'd1' }));
    const piece = store.getState().project.pieces[0];
    expect(piece.internals).toHaveLength(0);
    expect(piece.darts).toBeUndefined();
  });
});

describe('resolverBorrado lleva el tramo de la interna', () => {
  it('con tramo elegido, el sujeto trae su segmentIndex', () => {
    expect(resolverBorrado({
      activeTool: 'select', selectedPieceIds: ['p'], selectedSeamId: null, selectedPOMId: null,
      selectedInternalLine: { pieceId: 'p', lineId: 'L', segmentIndex: 2 },
      piezasBloqueadas: new Set(),
    })).toEqual({ kind: 'internalLine', pieceId: 'p', lineId: 'L', segmentIndex: 2 });
  });
});

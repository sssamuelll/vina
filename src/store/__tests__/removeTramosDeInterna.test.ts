/**
 * Supr sobre un tramo de interna quita SOLO ese tramo (spec 2026-09-24 § 4.6;
 * contrato 08-09 § 5), por el mismo reductor desde Q y desde Z.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, removeTramosDeInterna } from '../projectSlice';
import { resolverBorrado } from '../borradoDeSeleccion';
import type { InternalLine, PatternPiece } from '../../types/types';

const ELE: InternalLine = {
  id: 'L', type: 'fold', foldOptions: { direction: 'mountain', creaseAngleDeg: 180 },
  path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }],
};
function montar(internals: InternalLine[] = [ELE]) {
  const store = configureStore({ reducer: { project: projectReducer } });
  const piece = {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, seamAllowance: 0,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 200] }, { type: 'Z', values: [] }],
    internals, edges: [],
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

describe('resolverBorrado lleva el tramo de la interna', () => {
  it('con tramo elegido, el sujeto trae su segmentIndex', () => {
    expect(resolverBorrado({
      activeTool: 'select', selectedPieceIds: ['p'], selectedSeamId: null, selectedPOMId: null,
      selectedInternalLine: { pieceId: 'p', lineId: 'L', segmentIndex: 2 },
      piezasBloqueadas: new Set(),
    })).toEqual({ kind: 'internalLine', pieceId: 'p', lineId: 'L', segmentIndex: 2 });
  });
});

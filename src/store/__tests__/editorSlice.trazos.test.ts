import { describe, it, expect } from 'vitest';
import reducer, { selectTrazo, selectPiece, selectInternalLine, clearSelection, toggleTrazos } from '../editorSlice';

const estado = () => reducer(undefined, { type: '@@init' });

describe('editorSlice — selección de trazo (spec 2026-09-12 § 5.2)', () => {
  it('nace sin trazo seleccionado y con la construcción visible', () => {
    const s = estado();
    expect(s.selectedTrazo).toBeNull();
    expect(s.showTrazos).toBe(true);
  });
  it('selectTrazo es excluyente con piezas e internas', () => {
    let s = reducer(estado(), selectPiece('p1'));
    s = reducer(s, selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(s.selectedTrazo).toEqual({ trazoId: 't1', segmentIndex: 1 });
    expect(s.selectedPieceIds).toEqual([]);
    expect(s.selectedInternalLine).toBeNull();
  });
  it('seleccionar una pieza o una interna suelta el trazo; clearSelection también', () => {
    const s = reducer(estado(), selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(reducer(s, selectPiece('p1')).selectedTrazo).toBeNull();
    expect(reducer(s, selectInternalLine({ pieceId: 'p1', lineId: 'l1' })).selectedTrazo).toBeNull();
    expect(reducer(s, clearSelection()).selectedTrazo).toBeNull();
  });
  it('apagar «Construcción» suelta la selección; encenderla no la devuelve', () => {
    let s = reducer(estado(), selectTrazo({ trazoId: 't1', segmentIndex: 1 }));
    s = reducer(s, toggleTrazos());
    expect(s.showTrazos).toBe(false);
    expect(s.selectedTrazo).toBeNull();
    s = reducer(s, toggleTrazos());
    expect(s.showTrazos).toBe(true);
    expect(s.selectedTrazo).toBeNull();
  });
});

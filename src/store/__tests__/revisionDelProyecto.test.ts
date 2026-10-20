import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece } from '../projectSlice';
import editorReducer, { selectPiece } from '../editorSlice';
import { revisionDelProyecto, seguirLaRevision } from '../revisionDelProyecto';

/** La revisión del proyecto (spec 2026-10-05 § 5.2): sube cuando el proyecto cambia, y solo entonces. */
describe('revisionDelProyecto', () => {
  it('sube con un cambio del proyecto y no con uno del editor', () => {
    const store = configureStore({
      reducer: { project: projectReducer, editor: editorReducer },
      middleware: g => g({ serializableCheck: false }),
    });
    const soltar = seguirLaRevision(store);
    const antes = revisionDelProyecto();
    store.dispatch(selectPiece('nadie'));
    expect(revisionDelProyecto()).toBe(antes);
    store.dispatch(addPiece({
      id: 'p1', name: 'p1', outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'Z', values: [] }],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
      layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    }));
    expect(revisionDelProyecto()).toBe(antes + 1);
    soltar();
  });
});

/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import workflowReducer, { setConfirmOverride } from '../workflowSlice';
import copilotUIReducer from '../copilotUISlice';
import projectReducer from '../projectSlice';
import constructionReducer from '../constructionSlice';
import { confirmationMiddleware } from '../confirmationMiddleware';
import { journalMiddleware } from '../journalMiddleware';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';

function makeStore() {
  return configureStore({
    reducer: {
      workflow: workflowReducer,
      copilotUI: copilotUIReducer,
      project: projectReducer,
      construction: constructionReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(journalMiddleware, confirmationMiddleware),
  });
}

const actions = () => getJournal().events.filter((e) => e.kind === 'action');

describe('journalMiddleware', () => {
  beforeEach(clearJournal);

  it('registra cada acción con su payload resumido y su meta', () => {
    const store = makeStore();
    store.dispatch({
      type: 'project/addInternalLine',
      payload: { pieceId: 'p1', line: { id: 'l1', type: 'reference', path: Array.from({ length: 20 }, () => ({ type: 'L', values: [0, 0] })) } },
      meta: { skipConfirmation: true },
    });
    expect(actions()).toEqual([
      expect.objectContaining({
        name: 'project/addInternalLine',
        data: {
          payload: { pieceId: 'p1', line: { id: 'l1', type: 'reference', path: { len: 20 } } },
          meta: { skipConfirmation: true },
        },
      }),
    ]);
  });

  it('una acción sin payload ni meta deja data vacía', () => {
    const store = makeStore();
    store.dispatch({ type: 'editor/clearSelection' });
    expect(actions()[0]).toMatchObject({ name: 'editor/clearSelection', data: {} });
  });

  it('no registra simulation/setFrameTime', () => {
    const store = makeStore();
    store.dispatch({ type: 'simulation/setFrameTime', payload: 16.6 });
    store.dispatch({ type: 'editor/setActiveTool', payload: 'pen' });
    expect(actions().map((e) => e.name)).toEqual(['editor/setActiveTool']);
  });

  it('ve la acción que la confirmación bloquea (va primera en la cadena)', () => {
    const store = makeStore();
    store.dispatch(setConfirmOverride({ operation: 'removePiece', value: 'always' }));
    store.dispatch({ type: 'project/removePiece', payload: 'piece-1' });
    expect(store.getState().copilotUI.pendingConfirmation).not.toBeNull();
    expect(actions().map((e) => e.name)).toContain('project/removePiece');
  });
});

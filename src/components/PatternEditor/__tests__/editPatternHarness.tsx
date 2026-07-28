/**
 * editPatternHarness.tsx — shared Redux + render harness for useEditPattern tests.
 *
 * Deliberately NOT a *.test.ts(x) file: vitest's include glob only collects
 * `src/**\/*.test.ts(x)`, so importing this module from a test file does not
 * re-execute anything as its own test run. (A test file importing another
 * *collected* test file for its exports was the original bug here — vitest
 * still globs the imported file and runs its top-level describe/it blocks a
 * second time, attributed to the importing file.)
 *
 * The render-tree component itself lives in EditPatternTestHarness.tsx so
 * this file's exports (setup, mouseAt, pieceLocalToPattern) stay all
 * non-component — react-refresh/only-export-components warns otherwise.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import type { PatternPiece, Point2D } from '../../../types/types';
import EditPatternTestHarness, { type EditorApi } from './EditPatternTestHarness';

export { pieceLocalToPattern } from '../pieceTransform';

export function setup(piece: PatternPiece) {
  const store = configureStore({
    reducer: { project: projectReducer, copilotUI: copilotUIReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const ref = React.createRef<EditorApi>();
  const view = render(<Provider store={store}><EditPatternTestHarness ref={ref} /></Provider>);
  act(() => ref.current!.enterEdit(piece.id));
  return { store, ref, view };
}

export function mouseAt(point: Point2D, shift = false): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0, shiftKey: shift, clientX: point.x, clientY: point.y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

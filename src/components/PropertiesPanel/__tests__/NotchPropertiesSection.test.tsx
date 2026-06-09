// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addSeam } from '../../../store/projectSlice';
import editorReducer, { selectInternalLine } from '../../../store/editorSlice';
import NotchPropertiesSection from '../NotchPropertiesSection';
import type { PatternPiece, Seam } from '../../../types/types';

afterEach(cleanup);

// A: right edge (cmd 2) = (200,0)→(200,400), with a notch at (200,100).
function pieceA(): PatternPiece {
  return {
    id: 'A', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 400] }, { type: 'L', values: [0, 400] }, { type: 'Z', values: [] },
    ],
    edges: [{ id: 'A:side', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' }],
    internals: [{
      id: 'n1', type: 'notch',
      path: [{ type: 'M', values: [200, 100] }, { type: 'L', values: [200, 108] }],
      notchOptions: { shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1 },
    }],
    position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}
// B: left edge (cmd 1) = (0,0)→(0,400), offset right.
function pieceB(): PatternPiece {
  return {
    id: 'B', name: 'Back',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [0, 400] },
      { type: 'L', values: [200, 400] }, { type: 'L', values: [200, 0] }, { type: 'Z', values: [] },
    ],
    edges: [{ id: 'B:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
    internals: [], position: { x: 300, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}
const seam: Seam = {
  id: 's1', pieceA: { pieceId: 'A', edgeName: 'sideSeam' }, pieceB: { pieceId: 'B', edgeName: 'sideSeam' },
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
} as unknown as Seam;

function setup(withSeam = true) {
  const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
  store.dispatch(addPiece(pieceA()));
  store.dispatch(addPiece(pieceB()));
  if (withSeam) store.dispatch(addSeam(seam));
  store.dispatch(selectInternalLine({ pieceId: 'A', lineId: 'n1' }));
  render(<Provider store={store}><NotchPropertiesSection /></Provider>);
  return store;
}

describe('NotchPropertiesSection (F3)', () => {
  it('shows the mirror control with the two-position sense toggle', () => {
    setup();
    expect(screen.getByText(/mirror to paired edge/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /opposite side/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /same side/i })).toBeTruthy();
  });

  it('defaults to Opposite side; toggling dispatches the sense', () => {
    const store = setup();
    expect(store.getState().editor.notchMirrorInvert).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /same side/i }));
    expect(store.getState().editor.notchMirrorInvert).toBe(false);
  });

  it('Create mirror notch adds a notch to the paired piece', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: /create mirror notch/i }));
    const back = store.getState().project.pieces.find(p => p.id === 'B')!;
    expect(back.internals.filter(i => i.type === 'notch')).toHaveLength(1);
  });

  it('without a seam, shows the feedback message and no create button', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: /create mirror notch/i })).toBeNull();
    expect(screen.getByText(/seam/i)).toBeTruthy();
  });
});

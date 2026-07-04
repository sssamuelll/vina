// @vitest-environment jsdom
/**
 * Sewn-range controls (CLO3D-style extents): percent inputs per half write
 * Seam tStart/tEnd via updateSeam — the ONLY write path. Full range stores
 * no fields; invalid input clamps; sewn cm + >10% mismatch warning render.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addSeam } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import SeamPropertiesPanel from '../SeamPropertiesPanel';
import type { Seam } from '../../../types/types';

afterEach(cleanup);

function makeSeam(overrides: Partial<Seam> = {}): Seam {
  return {
    id: 's1',
    pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

function mount(seam: Seam, lengths: { a?: number; b?: number } = {}) {
  const store = configureStore({ reducer: { project: projectReducer, editor: editorReducer } });
  store.dispatch(addSeam(seam));
  const ui = (s: Seam) => (
    <Provider store={store}>
      <SeamPropertiesPanel
        seam={s}
        pieceAName="Front"
        pieceBName="Back"
        edgeALengthMm={lengths.a}
        edgeBLengthMm={lengths.b}
        collapsed={false}
        onToggle={() => {}}
      />
    </Provider>
  );
  render(ui(seam));
  return store;
}

describe('SeamPropertiesPanel — sewn range', () => {
  it('shows 0–100 for a seam without stored ranges', () => {
    mount(makeSeam());
    expect((screen.getByLabelText('Sewn range start % (Front)') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Sewn range end % (Front)') as HTMLInputElement).value).toBe('100');
  });

  it('writes a sub-range as fractions via updateSeam', () => {
    const store = mount(makeSeam());
    fireEvent.change(screen.getByLabelText('Sewn range start % (Front)'), { target: { value: '30' } });
    const seam = store.getState().project.seams[0];
    expect(seam.pieceA.tStart).toBe(0.3);
    expect(seam.pieceA.tEnd).toBe(1);
    // The other half stays untouched.
    expect('tStart' in seam.pieceB).toBe(false);
  });

  it('restoring the full range removes the fields (no redundant 0/1)', () => {
    // [30, 100] displayed; one edit (start → 0) reaches the full range.
    const store = mount(makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.3, tEnd: 1 } }));
    fireEvent.change(screen.getByLabelText('Sewn range start % (Front)'), { target: { value: '0' } });
    const seam = store.getState().project.seams[0];
    expect('tStart' in seam.pieceA).toBe(false);
    expect('tEnd' in seam.pieceA).toBe(false);
  });

  it('clamps start >= end instead of storing an invalid range', () => {
    const store = mount(makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.2, tEnd: 0.5 } }));
    fireEvent.change(screen.getByLabelText('Sewn range start % (Front)'), { target: { value: '80' } });
    const seam = store.getState().project.seams[0];
    expect(seam.pieceA.tStart).toBe(0.8);
    expect(seam.pieceA.tEnd).toBe(0.81); // end pushed forward, never invalid
  });

  it('shows sewn length in cm per half and a >10% mismatch warning', () => {
    // A: 400mm full = 40.0 cm; B: 300mm × 0.5 = 15.0 cm → mismatch 62.5% → 63%
    mount(
      makeSeam({ pieceB: { pieceId: 'p2', edgeName: 'sideSeam', tStart: 0, tEnd: 0.5 } }),
      { a: 400, b: 300 },
    );
    expect(screen.getByText('40.0 cm sewn')).toBeTruthy();
    expect(screen.getByText('15.0 cm sewn')).toBeTruthy();
    expect(screen.getByText(/Sewn lengths differ by 63%/)).toBeTruthy();
  });

  it('hides length and warning when edge lengths are unknown', () => {
    mount(makeSeam());
    expect(screen.queryByText(/cm sewn/)).toBeNull();
    expect(screen.queryByText(/Sewn lengths differ/)).toBeNull();
  });
});

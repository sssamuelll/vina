/**
 * @vitest-environment jsdom
 *
 * BUG-9 (#612) representative regression test.
 *
 * Mannequin × bodyGeometry is the most controllable of the 5 leak sites:
 * useMemo deps are `[measurements]`, the only data dependency is a single
 * Redux slice, and the geometry type (LatheGeometry) has a stable
 * `dispose()` we can spy on prototype-level.
 *
 * The other 4 sites (standGeometry, GarmentSimulation.staticGeometry,
 * FloorGrid pair, PieceMesh.geometry) carry inline `// BUG-9 (#612):`
 * comments referencing the canonical-pattern decision pending in the C1
 * RFC. When C1 lands, all of them — including this test — get rewritten
 * around the canonical helper.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import * as THREE from 'three';
import projectReducer, { updateMeasurements } from '../../../store/projectSlice';
import Mannequin from '../Mannequin';

afterEach(cleanup);

function createTestStore() {
  return configureStore({
    reducer: { project: projectReducer },
  });
}

describe('Mannequin (BUG-9 / #612 inline dispose pattern)', () => {
  it('disposes a LatheGeometry when measurements change (deps mirror useMemo)', () => {
    const store = createTestStore();
    const disposeSpy = vi.spyOn(THREE.LatheGeometry.prototype, 'dispose');

    const { unmount } = render(
      <Provider store={store}>
        <Mannequin />
      </Provider>
    );

    // Initial render creates bodyGeometry and standGeometry.
    // No useEffect cleanups have fired yet.
    const afterMount = disposeSpy.mock.calls.length;

    // Trigger bodyGeometry's useMemo dep change.
    act(() => {
      store.dispatch(updateMeasurements({ height: 200 }));
    });

    // bodyGeometry's old instance must have been disposed by the [bodyGeometry]
    // useEffect cleanup. standGeometry has empty deps and is NOT disposed here.
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(afterMount);

    // Final unmount should dispose the current bodyGeometry + standGeometry.
    const beforeUnmount = disposeSpy.mock.calls.length;
    unmount();
    expect(disposeSpy.mock.calls.length).toBeGreaterThanOrEqual(beforeUnmount + 2);

    disposeSpy.mockRestore();
  });
});

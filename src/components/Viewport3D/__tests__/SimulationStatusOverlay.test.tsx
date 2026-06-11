/**
 * @vitest-environment jsdom
 *
 * SimulationStatusOverlay — superficie de observabilidad de seams
 * (plan de paridad CLO3D, Fase 4).
 *
 * El overlay es el "silent-absence surface" ratificado por C4 § 3.1.A;
 * la Fase 4 le añade el constraint-count de seams y el warning rojo
 * cuando un seam resuelve a 0 constraints (no coserá).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { SimulationStatusOverlay } from '../SimulationStatusOverlay';
import simulationReducer, {
  startSimulation,
  setSolverTier,
  setSeamResolution,
  type SeamResolutionSummary,
} from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';

function renderOverlay(seamResolution: SeamResolutionSummary | null) {
  const store = configureStore({
    reducer: { simulation: simulationReducer, tools: toolReducer },
  });
  store.dispatch(startSimulation());
  store.dispatch(setSolverTier('wasm'));
  store.dispatch(setSeamResolution(seamResolution));
  render(
    <Provider store={store}>
      <SimulationStatusOverlay />
    </Provider>,
  );
  return store;
}

describe('SimulationStatusOverlay — seam observability (Fase 4)', () => {
  afterEach(cleanup);

  it('shows the total seam constraint count when a summary exists', () => {
    renderOverlay({ totalConstraints: 124, zeroConstraintSeams: [] });
    expect(screen.getByText(/124 seam constraints/)).toBeTruthy();
    expect(screen.queryByText(/will not sew/)).toBeNull();
  });

  it('warns in red when seams resolved to 0 constraints, with per-seam cause in the tooltip', () => {
    renderOverlay({
      totalConstraints: 80,
      zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }],
    });
    const warning = screen.getByText(/1 seam resolved to 0 constraints — will not sew/);
    expect(warning).toBeTruthy();
    expect(warning.style.color).toBe('rgb(239, 68, 68)');
    expect(warning.title).toContain('seam-7 (unknown-edge)');
  });

  it('pluralizes the zero-constraint warning', () => {
    renderOverlay({
      totalConstraints: 0,
      zeroConstraintSeams: [
        { seamId: 's1', reason: 'unknown-edge' },
        { seamId: 's2', reason: 'empty-match' },
      ],
    });
    expect(screen.getByText(/2 seams resolved to 0 constraints/)).toBeTruthy();
  });

  it('renders no seam line at all when the summary is null (project without seams)', () => {
    renderOverlay(null);
    expect(screen.queryByText(/seam constraints/)).toBeNull();
    expect(screen.queryByText(/will not sew/)).toBeNull();
  });
});

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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { SimulationStatusOverlay } from '../SimulationStatusOverlay';
import simulationReducer, {
  startSimulation,
  setSolverTier,
  setSeamResolution,
  setParticleCount,
  type SeamResolutionSummary,
} from '../../../store/simulationSlice';
import toolReducer from '../../../store/toolSlice';

function renderOverlay(seamResolution: SeamResolutionSummary | null) {
  const store = configureStore({
    reducer: { simulation: simulationReducer, tools: toolReducer },
  });
  store.dispatch(startSimulation());
  store.dispatch(setSolverTier('wasm'));
  store.dispatch(setParticleCount(29338));
  store.dispatch(setSeamResolution(seamResolution));
  render(
    <Provider store={store}>
      <SimulationStatusOverlay />
    </Provider>,
  );
  return store;
}

/** El HUD arranca colapsado (Fase1-H2); el detalle vive detrás del toggle. */
function expandOverlay() {
  fireEvent.click(screen.getByRole('button', { name: /simulation status/i }));
}

describe('SimulationStatusOverlay — colapsado por defecto (Fase1-H2)', () => {
  afterEach(cleanup);

  it('starts collapsed: tier label visible, telemetry detail hidden', () => {
    renderOverlay({ totalConstraints: 124, zeroConstraintSeams: [] });
    expect(screen.getByText(/Wasm XPBD/)).toBeTruthy();
    expect(screen.queryByText(/particles/)).toBeNull();
    expect(screen.queryByText(/seam constraints/)).toBeNull();
    expect(screen.queryByText(/Mode:/)).toBeNull();
  });

  it('shows a warning badge while collapsed when a seam resolved to 0 constraints', () => {
    renderOverlay({
      totalConstraints: 80,
      zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }],
    });
    // La superficie de silent-absence (C4 § 3.1.A) no puede quedar invisible
    // por el colapso: colapsado debe seguir delatando que hay diagnósticos.
    expect(screen.getByLabelText(/warning/i)).toBeTruthy();
  });

  it('expands on click and collapses on second click', () => {
    renderOverlay({ totalConstraints: 124, zeroConstraintSeams: [] });
    expandOverlay();
    // Separador de miles según locale de la máquina (29,338 / 29.338)
    expect(screen.getByText(/29[.,]338 particles/)).toBeTruthy();
    expandOverlay();
    expect(screen.queryByText(/29[.,]338 particles/)).toBeNull();
  });
});

describe('SimulationStatusOverlay — seam observability (Fase 4, tras expandir)', () => {
  afterEach(cleanup);

  it('shows the total seam constraint count when a summary exists', () => {
    renderOverlay({ totalConstraints: 124, zeroConstraintSeams: [] });
    expandOverlay();
    expect(screen.getByText(/124 seam constraints/)).toBeTruthy();
    expect(screen.queryByText(/will not sew/)).toBeNull();
  });

  it('warns in red when seams resolved to 0 constraints, with per-seam cause in the tooltip', () => {
    renderOverlay({
      totalConstraints: 80,
      zeroConstraintSeams: [{ seamId: 'seam-7', reason: 'unknown-edge' }],
    });
    expandOverlay();
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
    expandOverlay();
    expect(screen.getByText(/2 seams resolved to 0 constraints/)).toBeTruthy();
  });

  it('renders no seam line at all when the summary is null (project without seams)', () => {
    renderOverlay(null);
    expandOverlay();
    expect(screen.queryByText(/seam constraints/)).toBeNull();
    expect(screen.queryByText(/will not sew/)).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer from '../../../store/simulationSlice';
import type { SimulationState, SolverTier, ViewMode3D, SurfaceMode3D } from '../../../store/simulationSlice';
import type { FitMapMode } from '../../../utils/cloth/fitMaps';
import FitMapToggle from '../FitMapToggle';

afterEach(cleanup);

function createTestStore() {
  return configureStore({
    reducer: {
      simulation: simulationReducer,
    },
    preloadedState: {
      simulation: {
        simulationState: 'running' as SimulationState,
        fitMapMode: 'stress' as FitMapMode,
        fitMapConfig: {
          stressRange: [0, 100] as [number, number],
          strainRange: [1.0, 1.2] as [number, number],
          fitThresholds: [0.8, 1.0] as [number, number],
          pressureDistance: 0.002,
        },
        pieceFabrics: {},
        defaultFabricId: 'cotton-poplin',
        particleDistance: 5,
        pieceParticleDistance: {},
        simulationMode: 'normal' as const,
        solverTier: 'none' as SolverTier,
        frameTimeMs: 0,
        particleCount: 0,
        bodyCollision: false,
        viewMode3D: 'arrange' as ViewMode3D,
        arrangementSnapshot: null,
        pinnedVertices: {},
        selectedPinId: null,
        showGarment: true,
        showSeamlines3D: true,
        showInternalLines3D: true,
        surfaceMode3D: 'textured' as SurfaceMode3D,
        snapshots: [],
        activeSnapshotId: null,
        isWarmStarting: false,
        fitMapStats: null,
        pieceTints: {},
        pieceTextureOverrides: {},
        pieceUVTransforms: {},
        windForce: [0, 0, 0] as [number, number, number],
        windEnabled: false,
        dragCoefficient: 1.0,
        frozenPieceIds: [],
        steamBrush: { active: false, radius: 0.05, strength: 0.3 },
      },
    },
  });
}

const testStats = {
  min: 0,
  max: 50,
  mean: 25,
  cantWearPct: 0,
  tightPct: 0,
  pressurePointCount: 0,
};

describe('FitMapToggle config popover', () => {
  it('opens config popover when gear icon is clicked', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FitMapToggle stats={testStats} />
      </Provider>,
    );
    const gearBtn = screen.getByTitle('Fit Map Config');
    fireEvent.click(gearBtn);
    expect(screen.getByText(/Stress Range/i)).toBeTruthy();
  });

  it('updates stress max via input', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FitMapToggle stats={testStats} />
      </Provider>,
    );
    const gearBtn = screen.getByTitle('Fit Map Config');
    fireEvent.click(gearBtn);
    const maxInput = screen.getByLabelText('Stress Max');
    fireEvent.change(maxInput, { target: { value: '200' } });
    const state = store.getState().simulation;
    expect(state.fitMapConfig.stressRange[1]).toBe(200);
  });
});

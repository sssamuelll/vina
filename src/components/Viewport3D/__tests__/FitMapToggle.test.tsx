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

function createTestStore(overrides: { simulationState?: SimulationState; fitMapMode?: FitMapMode } = {}) {
  return configureStore({
    reducer: {
      simulation: simulationReducer,
    },
    preloadedState: {
      simulation: {
        simulationState: (overrides.simulationState ?? 'running') as SimulationState,
        renderSettingsOpen: false,
        fitMapMode: (overrides.fitMapMode ?? 'stress') as FitMapMode,
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
        seamResolution: null,
        bodyCollision: false,
        collisionDistance: null,
        viewMode3D: 'arrange' as ViewMode3D,
        arrangementSnapshot: null,
        pinnedVertices: {},
        selectedPinId: null,
        selectedVertices: [],
        selectBox3D: null,
        selectLasso3D: null,
        showGarment: true,
        showSeamlines3D: true,
        showSimSeamLines: false,
        showInternalLines3D: true,
        surfaceMode3D: 'textured' as SurfaceMode3D,
        snapshots: [],
        activeSnapshotId: null,
        isWarmStarting: false,
        fitMapStats: null,
        pieceTints: {},
        pieceTextureOverrides: {},
        pieceUVTransforms: {},
        pieceOpacity: {},
        pieceEmission: {},
        pieceEmissionIntensity: {},
        windForce: [0, 0, 0] as [number, number, number],
        windEnabled: false,
        dragCoefficient: 1.0,
        frozenPieceIds: [],
        hiddenPieceIds: [],
        flippedPieceIds: [],
        steamBrush: { active: false, radius: 0.05, strength: 0.3 },
        meshGrab: { active: false, radius: 0.05, strength: 0.8 },
        hiddenLayerIds: [],
        layerOutlineColors: {},
        xrayMode: false,
        xrayActiveLayer: null,
        xrayOpacitySnapshot: null,
        piecePressures: {},
        armAxis: { left: null, right: null, ready: false },
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
    const gearBtn = screen.getByTitle('Ajustes del mapa de ajuste');
    fireEvent.click(gearBtn);
    expect(screen.getByText(/Rango de tensión/i)).toBeTruthy();
  });

  it('updates stress max via input', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FitMapToggle stats={testStats} />
      </Provider>,
    );
    const gearBtn = screen.getByTitle('Ajustes del mapa de ajuste');
    fireEvent.click(gearBtn);
    const maxInput = screen.getByLabelText('Tensión máx');
    fireEvent.change(maxInput, { target: { value: '200' } });
    const state = store.getState().simulation;
    expect(state.fitMapConfig.stressRange[1]).toBe(200);
  });
});

// #1010 punto 4: en idle la barra desaparecía por completo (`return null`), así
// que un usuario que nunca simuló no tenía cómo enterarse de que los fit maps
// existen. Ahora se muestra deshabilitada con la pista de qué hacer.
describe('FitMapToggle idle state (#1010)', () => {
  it('renders the bar disabled with a hint instead of vanishing', () => {
    const store = createTestStore({ simulationState: 'idle' });
    render(
      <Provider store={store}>
        <FitMapToggle stats={null} />
      </Provider>,
    );
    const strainBtn = screen.getByTitle(/Mapa de estiramiento/) as HTMLButtonElement;
    expect(strainBtn.disabled).toBe(true);
    expect(strainBtn.title).toMatch(/simula/i);
  });

  it('does not change fit map mode when clicked in idle', () => {
    const store = createTestStore({ simulationState: 'idle', fitMapMode: 'none' });
    render(
      <Provider store={store}>
        <FitMapToggle stats={null} />
      </Provider>,
    );
    fireEvent.click(screen.getByTitle(/Mapa de estiramiento/));
    expect(store.getState().simulation.fitMapMode).toBe('none');
  });

  it('keeps the buttons live while the simulation runs', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FitMapToggle stats={testStats} />
      </Provider>,
    );
    const strainBtn = screen.getByTitle('Mapa de estiramiento (Alt+7)') as HTMLButtonElement;
    expect(strainBtn.disabled).toBe(false);
  });
});

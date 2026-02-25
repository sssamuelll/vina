/**
 * Redux slice for cloth simulation state.
 *
 * Manages simulation lifecycle (idle/running/paused) and per-piece fabric assignments.
 *
 * @module simulationSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { FitMapMode, FitMapConfig } from '../utils/cloth/fitMaps';
import type { QualityLevel } from '../utils/cloth/gpu/qualityPresets';

/** Simulation lifecycle state. */
export type SimulationState = 'idle' | 'running' | 'paused';

/** Which solver tier is currently active. */
export type SolverTier = 'none' | 'webgpu' | 'wasm' | 'cpu-worker' | 'neural-drape';

interface SimulationSliceState {
  /** Current simulation state */
  simulationState: SimulationState;
  /** Fabric ID assigned to each pattern piece, keyed by piece ID */
  pieceFabrics: Record<string, string>;
  /** Default fabric ID for new pieces */
  defaultFabricId: string;
  /** Default particle distance in mm (CLO3D-style mesh density control) */
  particleDistance: number;
  /** Per-piece particle distance overrides in mm, keyed by piece ID */
  pieceParticleDistance: Record<string, number>;
  /** Active fit map visualization mode */
  fitMapMode: FitMapMode;
  /** Fit map visualization configuration */
  fitMapConfig: FitMapConfig;
  /** Quality preset level */
  qualityLevel: QualityLevel;
  /** Auto-quality detection enabled */
  autoQuality: boolean;
  /** Currently active solver tier */
  solverTier: SolverTier;
  /** Frame time in ms (rolling average) */
  frameTimeMs: number;
  /** Particle count in active simulation */
  particleCount: number;
}

const initialState: SimulationSliceState = {
  simulationState: 'idle',
  pieceFabrics: {},
  defaultFabricId: 'cotton-poplin',
  particleDistance: 5,
  pieceParticleDistance: {},
  fitMapMode: 'none' as FitMapMode,
  fitMapConfig: {
    stressRange: [0, 100],
    strainRange: [1.0, 1.2],
    fitThresholds: [0.8, 1.0],
    pressureDistance: 0.002,
  },
  qualityLevel: 'standard' as QualityLevel,
  autoQuality: true,
  solverTier: 'none' as SolverTier,
  frameTimeMs: 0,
  particleCount: 0,
};

const simulationSlice = createSlice({
  name: 'simulation',
  initialState,
  reducers: {
    /** Start the cloth simulation. */
    startSimulation(state) {
      state.simulationState = 'running';
    },
    /** Pause the cloth simulation. */
    pauseSimulation(state) {
      state.simulationState = 'paused';
    },
    /** Reset the cloth simulation to idle. */
    resetSimulation(state) {
      state.simulationState = 'idle';
    },
    /** Set the fabric for a specific pattern piece. */
    setFabric(state, action: PayloadAction<{ pieceId: string; fabricId: string }>) {
      state.pieceFabrics[action.payload.pieceId] = action.payload.fabricId;
    },
    /** Set the default fabric for new pieces. */
    setDefaultFabric(state, action: PayloadAction<string>) {
      state.defaultFabricId = action.payload;
    },
    /** Set the global particle distance (mm). Clamped to 2–20mm. */
    setParticleDistance(state, action: PayloadAction<number>) {
      state.particleDistance = Math.max(2, Math.min(20, action.payload));
    },
    /** Set per-piece particle distance override (mm). */
    setPieceParticleDistance(state, action: PayloadAction<{ pieceId: string; distance: number }>) {
      state.pieceParticleDistance[action.payload.pieceId] = Math.max(2, Math.min(20, action.payload.distance));
    },
    /** Set the active fit map visualization mode. */
    setFitMapMode(state, action: PayloadAction<FitMapMode>) {
      state.fitMapMode = action.payload;
    },
    /** Update fit map configuration (partial merge). */
    updateFitMapConfig(state, action: PayloadAction<Partial<FitMapConfig>>) {
      Object.assign(state.fitMapConfig, action.payload);
    },
    /** Set quality preset level. */
    setQualityLevel(state, action: PayloadAction<QualityLevel>) {
      state.qualityLevel = action.payload;
    },
    /** Toggle auto-quality detection. */
    setAutoQuality(state, action: PayloadAction<boolean>) {
      state.autoQuality = action.payload;
    },
    /** Set which solver tier is active. */
    setSolverTier(state, action: PayloadAction<SolverTier>) {
      state.solverTier = action.payload;
    },
    /** Update frame time (rolling average). */
    setFrameTime(state, action: PayloadAction<number>) {
      state.frameTimeMs = action.payload;
    },
    /** Set particle count. */
    setParticleCount(state, action: PayloadAction<number>) {
      state.particleCount = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFabric,
  setDefaultFabric,
  setParticleDistance,
  setPieceParticleDistance,
  setFitMapMode,
  updateFitMapConfig,
  setQualityLevel,
  setAutoQuality,
  setSolverTier,
  setFrameTime,
  setParticleCount,
} = simulationSlice.actions;

export default simulationSlice.reducer;

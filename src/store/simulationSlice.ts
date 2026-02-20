/**
 * Redux slice for cloth simulation state.
 *
 * Manages simulation lifecycle (idle/running/paused) and per-piece fabric assignments.
 *
 * @module simulationSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** Simulation lifecycle state. */
export type SimulationState = 'idle' | 'running' | 'paused';

interface SimulationSliceState {
  /** Current simulation state */
  simulationState: SimulationState;
  /** Fabric ID assigned to each pattern piece, keyed by piece ID */
  pieceFabrics: Record<string, string>;
  /** Default fabric ID for new pieces */
  defaultFabricId: string;
}

const initialState: SimulationSliceState = {
  simulationState: 'idle',
  pieceFabrics: {},
  defaultFabricId: 'cotton-poplin',
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
  },
});

export const {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFabric,
  setDefaultFabric,
} = simulationSlice.actions;

export default simulationSlice.reducer;

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  setSimulationMode,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('simulationMode state', () => {
  it('defaults to normal', () => {
    const store = createStore();
    expect(store.getState().simulation.simulationMode).toBe('normal');
  });

  it('setSimulationMode changes mode to complete', () => {
    const store = createStore();
    store.dispatch(setSimulationMode('complete'));
    expect(store.getState().simulation.simulationMode).toBe('complete');
  });

  it('setSimulationMode changes mode back to normal', () => {
    const store = createStore();
    store.dispatch(setSimulationMode('complete'));
    store.dispatch(setSimulationMode('normal'));
    expect(store.getState().simulation.simulationMode).toBe('normal');
  });
});

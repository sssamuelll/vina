import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  setMeshGrabActive,
  setMeshGrabRadius,
  setMeshGrabStrength,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('meshGrab state', () => {
  it('starts with meshGrab defaults', () => {
    const store = createStore();
    const { meshGrab } = store.getState().simulation;
    expect(meshGrab).toEqual({ active: false, radius: 0.08, strength: 0.6 });
  });

  it('setMeshGrabActive toggles active', () => {
    const store = createStore();
    store.dispatch(setMeshGrabActive(true));
    expect(store.getState().simulation.meshGrab.active).toBe(true);
  });

  it('setMeshGrabRadius updates radius', () => {
    const store = createStore();
    store.dispatch(setMeshGrabRadius(0.1));
    expect(store.getState().simulation.meshGrab.radius).toBe(0.1);
  });

  it('setMeshGrabRadius clamps to [0.01, 0.5]', () => {
    const store = createStore();
    store.dispatch(setMeshGrabRadius(0));
    expect(store.getState().simulation.meshGrab.radius).toBe(0.01);
    store.dispatch(setMeshGrabRadius(2));
    expect(store.getState().simulation.meshGrab.radius).toBe(0.5);
  });

  it('setMeshGrabStrength updates strength', () => {
    const store = createStore();
    store.dispatch(setMeshGrabStrength(0.5));
    expect(store.getState().simulation.meshGrab.strength).toBe(0.5);
  });

  it('setMeshGrabStrength clamps to [0, 1]', () => {
    const store = createStore();
    store.dispatch(setMeshGrabStrength(-1));
    expect(store.getState().simulation.meshGrab.strength).toBe(0);
    store.dispatch(setMeshGrabStrength(5));
    expect(store.getState().simulation.meshGrab.strength).toBe(1);
  });
});

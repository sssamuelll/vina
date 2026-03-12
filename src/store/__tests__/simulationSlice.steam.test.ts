import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  setSteamBrushActive,
  setSteamBrushRadius,
  setSteamBrushStrength,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('steamBrush state', () => {
  it('starts with steamBrush defaults', () => {
    const store = createStore();
    const { steamBrush } = store.getState().simulation;
    expect(steamBrush).toEqual({ active: false, radius: 0.05, strength: 0.3 });
  });

  it('setSteamBrushActive toggles active', () => {
    const store = createStore();
    store.dispatch(setSteamBrushActive(true));
    expect(store.getState().simulation.steamBrush.active).toBe(true);
  });

  it('setSteamBrushRadius updates radius', () => {
    const store = createStore();
    store.dispatch(setSteamBrushRadius(0.1));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.1);
  });

  it('setSteamBrushRadius clamps to [0.01, 0.5]', () => {
    const store = createStore();
    store.dispatch(setSteamBrushRadius(0));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.01);
    store.dispatch(setSteamBrushRadius(2));
    expect(store.getState().simulation.steamBrush.radius).toBe(0.5);
  });

  it('setSteamBrushStrength updates strength', () => {
    const store = createStore();
    store.dispatch(setSteamBrushStrength(0.8));
    expect(store.getState().simulation.steamBrush.strength).toBe(0.8);
  });

  it('setSteamBrushStrength clamps to [0, 1]', () => {
    const store = createStore();
    store.dispatch(setSteamBrushStrength(-1));
    expect(store.getState().simulation.steamBrush.strength).toBe(0);
    store.dispatch(setSteamBrushStrength(5));
    expect(store.getState().simulation.steamBrush.strength).toBe(1);
  });
});

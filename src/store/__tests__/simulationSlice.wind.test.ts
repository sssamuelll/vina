import { describe, it, expect } from 'vitest';
import reducer, {
  setWindForce,
  setWindEnabled,
  setDragCoefficient,
} from '../simulationSlice';

describe('simulationSlice wind state', () => {
  it('has default wind force [0,0,0]', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.windForce).toEqual([0, 0, 0]);
  });

  it('has default windEnabled = false', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.windEnabled).toBe(false);
  });

  it('has default dragCoefficient = 1.0', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.dragCoefficient).toBe(1.0);
  });

  it('setWindForce updates wind force vector', () => {
    const state = reducer(undefined, setWindForce([5, -2, 3]));
    expect(state.windForce).toEqual([5, -2, 3]);
  });

  it('setWindEnabled toggles wind on/off', () => {
    let state = reducer(undefined, setWindEnabled(true));
    expect(state.windEnabled).toBe(true);
    state = reducer(state, setWindEnabled(false));
    expect(state.windEnabled).toBe(false);
  });

  it('setDragCoefficient updates drag', () => {
    const state = reducer(undefined, setDragCoefficient(0.5));
    expect(state.dragCoefficient).toBe(0.5);
  });

  it('setDragCoefficient clamps to [0, 5]', () => {
    let state = reducer(undefined, setDragCoefficient(-1));
    expect(state.dragCoefficient).toBe(0);
    state = reducer(state, setDragCoefficient(10));
    expect(state.dragCoefficient).toBe(5);
  });
});

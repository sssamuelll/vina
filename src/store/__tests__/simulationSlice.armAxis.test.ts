import { describe, it, expect } from 'vitest';
import reducer, { setArmAxis } from '../simulationSlice';

describe('simulation.armAxis', () => {
  it('defaults to null/null/not-ready', () => {
    const s = reducer(undefined, { type: '@@init' });
    expect(s.armAxis).toEqual({ left: null, right: null, ready: false });
  });
  it('setArmAxis stores both directions + ready', () => {
    const s = reducer(undefined, setArmAxis({ left: [-1, 0, 0], right: [1, 0, 0], ready: true }));
    expect(s.armAxis).toEqual({ left: [-1, 0, 0], right: [1, 0, 0], ready: true });
  });
});

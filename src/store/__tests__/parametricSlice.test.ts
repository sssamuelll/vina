import { describe, it, expect } from 'vitest';
import reducer, {
  activateTemplate,
  setVariableOverride,
  setVariableOverrides,
  resetOverrides,
  resetVariable,
  clearTemplate,
  setGeneratedPieceIds,
  type ParametricState,
} from '../parametricSlice';

const initial: ParametricState = {
  activePattern: null,
  baseMeasurements: null,
  currentSize: null,
  sizeSystem: 'eu-women',
  variableOverrides: {},
  variableDefaults: {},
  generatedPieceIds: [],
};

const mockPattern = {
  name: 'test_shirt',
  variables: {
    '#BustEase': { formula: '40', description: 'Bust ease' },
    '#HemLength': { formula: '650', description: 'Hem length' },
  },
  construction: [],
};

const mockMeasurements = {
  height: 1680, chest: 920, waist: 740, hips: 980,
  shoulder: 128, armLength: 595, inseam: 780,
};

describe('parametricSlice', () => {
  it('returns initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initial);
  });

  it('activateTemplate sets all fields', () => {
    const state = reducer(initial, activateTemplate({
      pattern: mockPattern,
      measurements: mockMeasurements,
      size: 'M',
      sizeSystem: 'eu-women',
      resolvedVariables: { '#BustEase': 40, '#HemLength': 650 },
      pieceIds: ['p1', 'p2'],
    }));

    expect(state.activePattern).toEqual(mockPattern);
    expect(state.baseMeasurements).toEqual(mockMeasurements);
    expect(state.currentSize).toBe('M');
    expect(state.variableDefaults['#BustEase']).toBe(40);
    expect(state.generatedPieceIds).toEqual(['p1', 'p2']);
    expect(state.variableOverrides).toEqual({});
  });

  it('setVariableOverride updates single variable', () => {
    const state = reducer(initial, setVariableOverride({ key: '#BustEase', value: 50 }));
    expect(state.variableOverrides['#BustEase']).toBe(50);
  });

  it('setVariableOverrides batch updates', () => {
    const state = reducer(initial, setVariableOverrides({ '#BustEase': 50, '#HemLength': 700 }));
    expect(state.variableOverrides).toEqual({ '#BustEase': 50, '#HemLength': 700 });
  });

  it('resetOverrides clears all overrides', () => {
    let state = reducer(initial, setVariableOverride({ key: '#BustEase', value: 50 }));
    state = reducer(state, resetOverrides());
    expect(state.variableOverrides).toEqual({});
  });

  it('resetVariable clears one override', () => {
    let state = reducer(initial, setVariableOverrides({ '#BustEase': 50, '#HemLength': 700 }));
    state = reducer(state, resetVariable('#BustEase'));
    expect(state.variableOverrides).toEqual({ '#HemLength': 700 });
  });

  it('clearTemplate resets to initial', () => {
    let state = reducer(initial, activateTemplate({
      pattern: mockPattern,
      measurements: mockMeasurements,
      size: 'M',
      sizeSystem: 'eu-women',
      resolvedVariables: { '#BustEase': 40 },
      pieceIds: ['p1'],
    }));
    state = reducer(state, clearTemplate());
    expect(state).toEqual(initial);
  });

  it('setGeneratedPieceIds updates IDs', () => {
    const state = reducer(initial, setGeneratedPieceIds(['a', 'b', 'c']));
    expect(state.generatedPieceIds).toEqual(['a', 'b', 'c']);
  });

  it('multiple overrides accumulate', () => {
    let state = reducer(initial, setVariableOverride({ key: 'a', value: 1 }));
    state = reducer(state, setVariableOverride({ key: 'b', value: 2 }));
    state = reducer(state, setVariableOverride({ key: 'a', value: 3 }));
    expect(state.variableOverrides).toEqual({ a: 3, b: 2 });
  });
});

import { describe, it, expect } from 'vitest';
import nestingReducer, {
  setNestingConfig,
  setNestingResult,
  clearNesting,
  type NestingState,
} from '../nestingSlice';
import { NEW_PROJECT } from '../actions';
import type { NestingResult } from '../../utils/nesting/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockResult: NestingResult = {
  placements: [
    { pieceId: 'piece-1', sheetIndex: 0, x: 5, y: 5, rotation: 0, mirrored: false },
    { pieceId: 'piece-2', sheetIndex: 0, x: 300, y: 5, rotation: 90, mirrored: false },
  ],
  sheetsUsed: 1,
  utilization: 0.72,
  unplaced: [],
};

function getInitialState(): NestingState {
  return nestingReducer(undefined, { type: '@@INIT' });
}

// ─── Initial State ──────────────────────────────────────────────────────────

describe('nestingSlice — initial state', () => {
  it('has correct defaults', () => {
    const state = getInitialState();
    expect(state.config).toEqual({
      rollWidth: 1500,
      gap: 10,
      rotationStep: 180,
      allowMirror: false,
    });
    expect(state.result).toBeNull();
    expect(state.usedLength).toBeNull();
    expect(state.wastePercent).toBeNull();
    expect(state.lastNestedAt).toBeNull();
  });
});

// ─── setNestingConfig ───────────────────────────────────────────────────────

describe('setNestingConfig', () => {
  it('merges partial config', () => {
    const state = nestingReducer(getInitialState(), setNestingConfig({ rollWidth: 900 }));
    expect(state.config.rollWidth).toBe(900);
    // Other fields unchanged
    expect(state.config.gap).toBe(10);
    expect(state.config.rotationStep).toBe(180);
    expect(state.config.allowMirror).toBe(false);
  });

  it('updates multiple fields at once', () => {
    const state = nestingReducer(
      getInitialState(),
      setNestingConfig({ rollWidth: 1120, gap: 5, allowMirror: true }),
    );
    expect(state.config.rollWidth).toBe(1120);
    expect(state.config.gap).toBe(5);
    expect(state.config.allowMirror).toBe(true);
    expect(state.config.rotationStep).toBe(180);
  });

  it('does not affect result or metrics', () => {
    let state = getInitialState();
    state = nestingReducer(state, setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15 }));
    state = nestingReducer(state, setNestingConfig({ rollWidth: 900 }));
    expect(state.result).toEqual(mockResult);
    expect(state.usedLength).toBe(800);
    expect(state.wastePercent).toBe(15);
  });
});

// ─── setNestingResult ───────────────────────────────────────────────────────

describe('setNestingResult', () => {
  it('stores result and metrics', () => {
    const before = Date.now();
    const state = nestingReducer(
      getInitialState(),
      setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15.5 }),
    );
    expect(state.result).toEqual(mockResult);
    expect(state.usedLength).toBe(800);
    expect(state.wastePercent).toBe(15.5);
    expect(state.lastNestedAt).toBeGreaterThanOrEqual(before);
  });

  it('replaces previous result', () => {
    let state = nestingReducer(
      getInitialState(),
      setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15 }),
    );
    const newResult: NestingResult = {
      placements: [{ pieceId: 'piece-3', sheetIndex: 0, x: 0, y: 0, rotation: 0, mirrored: false }],
      sheetsUsed: 1,
      utilization: 0.5,
      unplaced: [],
    };
    state = nestingReducer(state, setNestingResult({ result: newResult, usedLength: 400, wastePercent: 30 }));
    expect(state.result).toEqual(newResult);
    expect(state.usedLength).toBe(400);
    expect(state.wastePercent).toBe(30);
  });

  it('does not modify config', () => {
    let state = nestingReducer(getInitialState(), setNestingConfig({ rollWidth: 900 }));
    state = nestingReducer(state, setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15 }));
    expect(state.config.rollWidth).toBe(900);
  });
});

// ─── clearNesting ───────────────────────────────────────────────────────────

describe('clearNesting', () => {
  it('clears result and metrics but keeps config', () => {
    let state = nestingReducer(getInitialState(), setNestingConfig({ rollWidth: 900 }));
    state = nestingReducer(state, setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15 }));
    state = nestingReducer(state, clearNesting());

    expect(state.result).toBeNull();
    expect(state.usedLength).toBeNull();
    expect(state.wastePercent).toBeNull();
    expect(state.lastNestedAt).toBeNull();
    // Config preserved
    expect(state.config.rollWidth).toBe(900);
  });

  it('is safe to call when already cleared', () => {
    const state = nestingReducer(getInitialState(), clearNesting());
    expect(state.result).toBeNull();
    expect(state.usedLength).toBeNull();
    expect(state.wastePercent).toBeNull();
    expect(state.lastNestedAt).toBeNull();
  });
});

// ─── NEW_PROJECT ────────────────────────────────────────────────────────────

describe('NEW_PROJECT', () => {
  it('resets to initial state (including config)', () => {
    let state = nestingReducer(getInitialState(), setNestingConfig({ rollWidth: 900, gap: 3 }));
    state = nestingReducer(state, setNestingResult({ result: mockResult, usedLength: 800, wastePercent: 15 }));
    state = nestingReducer(state, NEW_PROJECT());

    expect(state.config).toEqual({
      rollWidth: 1500,
      gap: 10,
      rotationStep: 180,
      allowMirror: false,
    });
    expect(state.result).toBeNull();
    expect(state.usedLength).toBeNull();
    expect(state.wastePercent).toBeNull();
    expect(state.lastNestedAt).toBeNull();
  });
});

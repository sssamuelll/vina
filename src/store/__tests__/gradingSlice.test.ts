import { describe, it, expect } from 'vitest';
import gradingReducer, {
  setEnabled,
  setSizeSystem,
  setBaseSize,
  setActiveSizes,
  setQuantity,
  setGradingResult,
  setStale,
  clearGrading,
  type GradingState,
} from '../gradingSlice';
import { NEW_PROJECT } from '../actions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitialState(): GradingState {
  return gradingReducer(undefined, { type: '@@INIT' });
}

function stateWithResult(): GradingState {
  let state = getInitialState();
  state = gradingReducer(state, setEnabled(true));
  state = gradingReducer(state, setSizeSystem('us-women'));
  state = gradingReducer(state, setBaseSize('8'));
  state = gradingReducer(state, setActiveSizes(['6', '8', '10']));
  state = gradingReducer(state, setQuantity({ size: '6', quantity: 50 }));
  state = gradingReducer(
    state,
    setGradingResult({
      generatedPieces: {
        'piece-1': ['piece-1-6', 'piece-1-10'],
        'piece-2': ['piece-2-6', 'piece-2-10'],
      },
    }),
  );
  return state;
}

// ─── Initial State ──────────────────────────────────────────────────────────

describe('gradingSlice — initial state', () => {
  it('has correct defaults', () => {
    const state = getInitialState();
    expect(state.enabled).toBe(false);
    expect(state.sizeSystem).toBe('eu-women');
    expect(state.baseSize).toBe('M');
    // Base size starts active — the panel must not open dead (Fase 3).
    expect(state.activeSizes).toEqual(['M']);
    expect(state.quantities).toEqual({});
    expect(state.generatedPieces).toEqual({});
    expect(state.stale).toBe(false);
    expect(state.lastGradedAt).toBeNull();
  });
});

// ─── setEnabled ─────────────────────────────────────────────────────────────

describe('setEnabled', () => {
  it('toggles enabled on', () => {
    const state = gradingReducer(getInitialState(), setEnabled(true));
    expect(state.enabled).toBe(true);
  });

  it('toggles enabled off', () => {
    let state = gradingReducer(getInitialState(), setEnabled(true));
    state = gradingReducer(state, setEnabled(false));
    expect(state.enabled).toBe(false);
  });
});

// ─── setSizeSystem ──────────────────────────────────────────────────────────

describe('setSizeSystem', () => {
  it('changes system and resets activeSizes and generatedPieces', () => {
    const state = gradingReducer(stateWithResult(), setSizeSystem('uk-women'));
    expect(state.sizeSystem).toBe('uk-women');
    expect(state.activeSizes).toEqual([]);
    expect(state.generatedPieces).toEqual({});
  });

  it('preserves other config fields', () => {
    const state = gradingReducer(stateWithResult(), setSizeSystem('eu-men'));
    expect(state.enabled).toBe(true);
    expect(state.baseSize).toBe('8');
    expect(state.quantities).toEqual({ '6': 50 });
  });
});

// ─── setBaseSize ────────────────────────────────────────────────────────────

describe('setBaseSize', () => {
  it('sets the base size', () => {
    const state = gradingReducer(getInitialState(), setBaseSize('L'));
    expect(state.baseSize).toBe('L');
  });
});

// ─── setActiveSizes ─────────────────────────────────────────────────────────

describe('setActiveSizes', () => {
  it('sets active sizes', () => {
    const state = gradingReducer(getInitialState(), setActiveSizes(['XS', 'S', 'M', 'L', 'XL']));
    expect(state.activeSizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('replaces previous active sizes', () => {
    let state = gradingReducer(getInitialState(), setActiveSizes(['S', 'M']));
    state = gradingReducer(state, setActiveSizes(['L', 'XL']));
    expect(state.activeSizes).toEqual(['L', 'XL']);
  });
});

// ─── setQuantity ────────────────────────────────────────────────────────────

describe('setQuantity', () => {
  it('sets quantity for a size', () => {
    const state = gradingReducer(getInitialState(), setQuantity({ size: 'M', quantity: 100 }));
    expect(state.quantities).toEqual({ M: 100 });
  });

  it('updates existing quantity', () => {
    let state = gradingReducer(getInitialState(), setQuantity({ size: 'M', quantity: 100 }));
    state = gradingReducer(state, setQuantity({ size: 'M', quantity: 200 }));
    expect(state.quantities.M).toBe(200);
  });

  it('handles multiple sizes', () => {
    let state = gradingReducer(getInitialState(), setQuantity({ size: 'S', quantity: 50 }));
    state = gradingReducer(state, setQuantity({ size: 'L', quantity: 75 }));
    expect(state.quantities).toEqual({ S: 50, L: 75 });
  });
});

// ─── setGradingResult ───────────────────────────────────────────────────────

describe('setGradingResult', () => {
  it('stores pieceIds, sets stale=false, sets lastGradedAt', () => {
    const before = Date.now();
    const generated = { 'piece-1': ['piece-1-S', 'piece-1-L'] };
    let state = gradingReducer(getInitialState(), setStale(true));
    state = gradingReducer(state, setGradingResult({ generatedPieces: generated }));

    expect(state.generatedPieces).toEqual(generated);
    expect(state.stale).toBe(false);
    expect(state.lastGradedAt).toBeGreaterThanOrEqual(before);
  });

  it('replaces previous result', () => {
    let state = gradingReducer(
      getInitialState(),
      setGradingResult({ generatedPieces: { a: ['a1'] } }),
    );
    state = gradingReducer(
      state,
      setGradingResult({ generatedPieces: { b: ['b1', 'b2'] } }),
    );
    expect(state.generatedPieces).toEqual({ b: ['b1', 'b2'] });
  });
});

// ─── setStale ───────────────────────────────────────────────────────────────

describe('setStale', () => {
  it('marks as stale', () => {
    const state = gradingReducer(getInitialState(), setStale(true));
    expect(state.stale).toBe(true);
  });

  it('marks as not stale', () => {
    let state = gradingReducer(getInitialState(), setStale(true));
    state = gradingReducer(state, setStale(false));
    expect(state.stale).toBe(false);
  });
});

// ─── clearGrading ───────────────────────────────────────────────────────────

describe('clearGrading', () => {
  it('resets generatedPieces, stale, lastGradedAt but keeps config', () => {
    const state = gradingReducer(stateWithResult(), clearGrading());

    expect(state.generatedPieces).toEqual({});
    expect(state.stale).toBe(false);
    expect(state.lastGradedAt).toBeNull();

    // Config preserved
    expect(state.enabled).toBe(true);
    expect(state.sizeSystem).toBe('us-women');
    expect(state.baseSize).toBe('8');
    expect(state.activeSizes).toEqual(['6', '8', '10']);
    expect(state.quantities).toEqual({ '6': 50 });
  });

  it('is safe to call on initial state', () => {
    const state = gradingReducer(getInitialState(), clearGrading());
    expect(state.generatedPieces).toEqual({});
    expect(state.stale).toBe(false);
    expect(state.lastGradedAt).toBeNull();
  });
});

// ─── NEW_PROJECT ────────────────────────────────────────────────────────────

describe('NEW_PROJECT', () => {
  it('resets to initial state', () => {
    const state = gradingReducer(stateWithResult(), NEW_PROJECT());

    expect(state.enabled).toBe(false);
    expect(state.sizeSystem).toBe('eu-women');
    expect(state.baseSize).toBe('M');
    expect(state.activeSizes).toEqual(['M']);
    expect(state.quantities).toEqual({});
    expect(state.generatedPieces).toEqual({});
    expect(state.stale).toBe(false);
    expect(state.lastGradedAt).toBeNull();
  });
});

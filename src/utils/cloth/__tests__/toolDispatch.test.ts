import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchBrushStroke,
  dispatchBrushClear,
  dispatchGrabInit,
  dispatchGrabMove,
  dispatchGrabRelease,
  type ClothToolTiers,
  type GrabState,
} from '../toolDispatch';

/**
 * Tier client mocks. Shape mirrors the public methods consumed by the helpers.
 * `as unknown as ...` casts the mock to the concrete type without forcing us
 * to implement the full ~770L / ~380L / ~743L surfaces.
 */
interface MockGrabNodes {
  grabCenterX: { value: number };
  grabCenterY: { value: number };
  grabCenterZ: { value: number };
  grabRadius: { value: number };
  grabStrength: { value: number };
  grabActive: { value: number };
  grabInitPending: { value: number };
}

function makeGrabNodes(): MockGrabNodes {
  return {
    grabCenterX: { value: 0 },
    grabCenterY: { value: 0 },
    grabCenterZ: { value: 0 },
    grabRadius: { value: 0 },
    grabStrength: { value: 0 },
    grabActive: { value: 0 },
    grabInitPending: { value: 0 },
  };
}

function makeGpuMock() {
  return { setBrushParams: vi.fn() };
}

function makeWasmMock() {
  return { setPins: vi.fn(), clearPins: vi.fn() };
}

function makeTslMock(grabNodes: MockGrabNodes) {
  return { grabNodes };
}

function makeEmptyState(): GrabState {
  return { indices: [], basePositions: null, startPoint: [0, 0, 0] };
}

// Helper to build ClothToolTiers from optional partial mocks.
function makeTiers(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gpu?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wasm?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tslSolver?: any;
  positions?: Float32Array | null;
}): ClothToolTiers {
  return {
    gpu: opts.gpu ?? null,
    wasm: opts.wasm ?? null,
    tslSolver: opts.tslSolver ?? null,
    positions: opts.positions ?? null,
  };
}

describe('dispatchBrushStroke', () => {
  it('dispatches to GPU when present and returns true', () => {
    const gpu = makeGpuMock();
    const tiers = makeTiers({ gpu });
    const result = dispatchBrushStroke(
      { point: [1, 2, 3], radius: 0.05, strength: 0.5 },
      tiers,
    );
    expect(result).toBe(true);
    expect(gpu.setBrushParams).toHaveBeenCalledTimes(1);
    expect(gpu.setBrushParams).toHaveBeenCalledWith([1, 2, 3], 0.05, 0.5);
  });

  it('returns false when GPU absent (CPU/WASM/Neural-only configs)', () => {
    const wasm = makeWasmMock();
    expect(
      dispatchBrushStroke({ point: [0, 0, 0], radius: 0.05, strength: 0.5 }, makeTiers({ wasm })),
    ).toBe(false);
    expect(wasm.setPins).not.toHaveBeenCalled();
  });
});

describe('dispatchBrushClear', () => {
  it('zeroes brush params when GPU present', () => {
    const gpu = makeGpuMock();
    dispatchBrushClear(makeTiers({ gpu }));
    expect(gpu.setBrushParams).toHaveBeenCalledWith([0, 0, 0], 0, 0);
  });

  it('is a no-op when GPU absent', () => {
    expect(() => dispatchBrushClear(makeTiers({}))).not.toThrow();
  });
});

describe('dispatchGrabInit — GPU path', () => {
  let grabNodes: MockGrabNodes;
  let tiers: ClothToolTiers;
  let state: GrabState;

  beforeEach(() => {
    grabNodes = makeGrabNodes();
    tiers = makeTiers({ tslSolver: makeTslMock(grabNodes) });
    state = makeEmptyState();
  });

  it('writes grab uniforms and returns true', () => {
    const result = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.08, strength: 0.6 },
      tiers,
      state,
    );
    expect(result).toBe(true);
    expect(grabNodes.grabCenterX.value).toBe(1);
    expect(grabNodes.grabCenterY.value).toBe(2);
    expect(grabNodes.grabCenterZ.value).toBe(3);
    expect(grabNodes.grabRadius.value).toBe(0.08);
    expect(grabNodes.grabStrength.value).toBe(0.6);
    expect(grabNodes.grabActive.value).toBe(1);
    expect(grabNodes.grabInitPending.value).toBe(1);
  });

  it('does NOT mutate state (GPU path is uniform-driven)', () => {
    dispatchGrabInit({ point: [1, 2, 3], radius: 0.08, strength: 0.6 }, tiers, state);
    expect(state.indices).toEqual([]);
    expect(state.basePositions).toBeNull();
    expect(state.startPoint).toEqual([0, 0, 0]);
  });
});

describe('dispatchGrabInit — WASM path', () => {
  it('captures particles within radius, populates state, and calls setPins positionally', () => {
    const wasm = makeWasmMock();
    // Two particles: one at origin (within radius), one far away (outside).
    const positions = new Float32Array([0, 0, 0, /* p0 */ 10, 10, 10 /* p1 */]);
    const tiers = makeTiers({ wasm, positions });
    const state = makeEmptyState();

    const result = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
      state,
    );

    expect(result).toBe(true);
    expect(state.indices).toEqual([0]);
    expect(state.basePositions).not.toBeNull();
    expect(state.basePositions!.length).toBe(state.indices.length * 3);
    expect(Array.from(state.basePositions!)).toEqual([0, 0, 0]);
    expect(state.startPoint).toEqual([0, 0, 0]);
    expect(wasm.setPins).toHaveBeenCalledTimes(1);
    expect(wasm.setPins).toHaveBeenCalledWith([
      { vertexIndex: 0, position: [0, 0, 0] },
    ]);
  });

  it('returns false when no particles fall within radius (state untouched)', () => {
    const wasm = makeWasmMock();
    const positions = new Float32Array([10, 10, 10]);
    const tiers = makeTiers({ wasm, positions });
    const state = makeEmptyState();

    const result = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
      state,
    );

    expect(result).toBe(false);
    expect(state.indices).toEqual([]);
    expect(state.basePositions).toBeNull();
    expect(wasm.setPins).not.toHaveBeenCalled();
  });

  it('returns false when WASM present but positions null (early exit)', () => {
    const wasm = makeWasmMock();
    expect(
      dispatchGrabInit(
        { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
        makeTiers({ wasm, positions: null }),
        makeEmptyState(),
      ),
    ).toBe(false);
    expect(wasm.setPins).not.toHaveBeenCalled();
  });

  it('uses STRICT inequality (particle exactly on radius boundary is excluded)', () => {
    const wasm = makeWasmMock();
    // Place particle at exactly distance r=0.5 (rSq = 0.25 == 0.25 → not <).
    const positions = new Float32Array([0.5, 0, 0]);
    const tiers = makeTiers({ wasm, positions });
    const state = makeEmptyState();

    const result = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
      state,
    );
    expect(result).toBe(false);
    expect(state.indices).toEqual([]);
  });

  it('mutates state.startPoint defensively (caller buffer reuse safe)', () => {
    const wasm = makeWasmMock();
    const positions = new Float32Array([0, 0, 0]);
    const tiers = makeTiers({ wasm, positions });
    const state = makeEmptyState();

    const reusedPoint: [number, number, number] = [1, 2, 3];
    dispatchGrabInit(
      { point: reusedPoint, radius: 0.5, strength: 1.0 },
      tiers,
      state,
    );
    // Mutating caller's buffer post-init must not corrupt anchor.
    reusedPoint[0] = 999;
    reusedPoint[1] = 999;
    reusedPoint[2] = 999;
    expect(state.startPoint).toEqual([1, 2, 3]);
  });
});

describe('dispatchGrabMove — GPU path', () => {
  it('updates only grab center uniforms, leaves radius/strength alone', () => {
    const grabNodes = makeGrabNodes();
    grabNodes.grabRadius.value = 0.08;
    grabNodes.grabStrength.value = 0.6;
    grabNodes.grabActive.value = 1;
    const tiers = makeTiers({ tslSolver: makeTslMock(grabNodes) });
    const state = makeEmptyState();

    const result = dispatchGrabMove({ point: [5, 6, 7] }, tiers, state);

    expect(result).toBe(true);
    expect(grabNodes.grabCenterX.value).toBe(5);
    expect(grabNodes.grabCenterY.value).toBe(6);
    expect(grabNodes.grabCenterZ.value).toBe(7);
    // Radius/strength preserved.
    expect(grabNodes.grabRadius.value).toBe(0.08);
    expect(grabNodes.grabStrength.value).toBe(0.6);
    expect(grabNodes.grabActive.value).toBe(1);
  });
});

describe('dispatchGrabMove — WASM path', () => {
  it('writes setPins with base + delta math (axis correctness — no XYZ swap)', () => {
    const wasm = makeWasmMock();
    const tiers = makeTiers({ wasm });
    const state: GrabState = {
      indices: [3],
      basePositions: new Float32Array([10, 20, 30]),
      startPoint: [1, 2, 3],
    };

    dispatchGrabMove({ point: [4, 6, 8] }, tiers, state);

    // delta = (3, 4, 5); expected = (10+3, 20+4, 30+5) = (13, 24, 35).
    expect(wasm.setPins).toHaveBeenCalledTimes(1);
    expect(wasm.setPins).toHaveBeenCalledWith([
      { vertexIndex: 3, position: [13, 24, 35] },
    ]);
  });

  it('returns false when state.indices is empty (no init preceded)', () => {
    const wasm = makeWasmMock();
    const result = dispatchGrabMove(
      { point: [1, 2, 3] },
      makeTiers({ wasm }),
      makeEmptyState(),
    );
    expect(result).toBe(false);
    expect(wasm.setPins).not.toHaveBeenCalled();
  });
});

describe('dispatchGrabRelease — tier-agnostic cleanup', () => {
  it('clears GPU grabActive when tslSolver present', () => {
    const grabNodes = makeGrabNodes();
    grabNodes.grabActive.value = 1;
    const state = makeEmptyState();
    dispatchGrabRelease(makeTiers({ tslSolver: makeTslMock(grabNodes) }), state);
    expect(grabNodes.grabActive.value).toBe(0);
  });

  it('clears WASM pins when state has indices (regardless of which tier dispatched init)', () => {
    const wasm = makeWasmMock();
    const state: GrabState = {
      indices: [1, 2, 3],
      basePositions: new Float32Array(9),
      startPoint: [0, 0, 0],
    };
    dispatchGrabRelease(makeTiers({ wasm }), state);
    expect(wasm.clearPins).toHaveBeenCalledTimes(1);
    expect(state.indices).toEqual([]);
    expect(state.basePositions).toBeNull();
  });

  it('clears BOTH tiers if tslSolver + WASM both present (mid-session swap repro)', () => {
    // Repro: grab init en WASM (state populated) → user/system swap a GPU
    // (tslSolver becomes truthy) → release sees both tiers. Both must clear.
    const grabNodes = makeGrabNodes();
    grabNodes.grabActive.value = 1;
    const wasm = makeWasmMock();
    const state: GrabState = {
      indices: [5],
      basePositions: new Float32Array([1, 2, 3]),
      startPoint: [0, 0, 0],
    };

    dispatchGrabRelease(
      makeTiers({ tslSolver: makeTslMock(grabNodes), wasm }),
      state,
    );

    // GPU uniform cleared.
    expect(grabNodes.grabActive.value).toBe(0);
    // WASM pins cleared (state had indices, regardless of TSL presence).
    expect(wasm.clearPins).toHaveBeenCalledTimes(1);
    // State always reset (idempotent).
    expect(state.indices).toEqual([]);
    expect(state.basePositions).toBeNull();
  });

  it('is idempotent — releasing without state still resets fields', () => {
    const state = makeEmptyState();
    dispatchGrabRelease(makeTiers({}), state);
    expect(state.indices).toEqual([]);
    expect(state.basePositions).toBeNull();
  });

  it('does NOT call clearPins when state.indices is empty', () => {
    const wasm = makeWasmMock();
    const state = makeEmptyState();
    dispatchGrabRelease(makeTiers({ wasm }), state);
    expect(wasm.clearPins).not.toHaveBeenCalled();
  });
});

describe('Tier precedence — GPU wins when both GPU + WASM present', () => {
  it('dispatchGrabInit: tslSolver present → grab uniforms set, wasm.setPins NOT called', () => {
    const grabNodes = makeGrabNodes();
    const wasm = makeWasmMock();
    const positions = new Float32Array([0, 0, 0]);
    const state = makeEmptyState();

    const result = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.5, strength: 1.0 },
      makeTiers({ tslSolver: makeTslMock(grabNodes), wasm, positions }),
      state,
    );

    expect(result).toBe(true);
    expect(grabNodes.grabActive.value).toBe(1);
    expect(wasm.setPins).not.toHaveBeenCalled();
    expect(state.indices).toEqual([]); // GPU path leaves state alone
  });

  it('dispatchGrabMove: tslSolver present → grab center uniforms set, wasm.setPins NOT called', () => {
    const grabNodes = makeGrabNodes();
    const wasm = makeWasmMock();
    const state: GrabState = {
      indices: [0],
      basePositions: new Float32Array([0, 0, 0]),
      startPoint: [0, 0, 0],
    };

    dispatchGrabMove(
      { point: [1, 2, 3] },
      makeTiers({ tslSolver: makeTslMock(grabNodes), wasm }),
      state,
    );

    expect(grabNodes.grabCenterX.value).toBe(1);
    expect(wasm.setPins).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchBrushStroke,
  dispatchBrushClear,
  dispatchGrabInit,
  type ClothToolTiers,
} from '../toolDispatch';

/**
 * Tier client mocks. Shape mirrors the public methods consumed by the helpers.
 * `as unknown as ...` casts the mock to the concrete type without forcing us
 * to implement the full ~770L / ~380L / ~743L surfaces.
 *
 * Tests updated per C4 follow-ups #701, #702, #703, #704, #706:
 * - `ClothToolTiers` is now a discriminated union over `kind` (#701).
 * - `dispatchGrabInit` returns a `GrabHandle | null` whose `.move`/`.release`
 *   methods replace the previous `dispatchGrabMove` / `dispatchGrabRelease`
 *   free functions + shared `GrabState` (#702).
 * - GPU grab uniforms flow through `tslSolver.setGrabUniforms()` (#703),
 *   so the TSL mock exposes that method in addition to `grabNodes`.
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

/**
 * TSL solver mock for the GPU variant. `setGrabUniforms` mirrors the real
 * `TslSolver` impl (#703): writes the same fields the helper previously
 * touched directly, so the existing per-uniform assertions still apply.
 */
function makeTslMock(grabNodes: MockGrabNodes) {
  const tslSolver = {
    grabNodes,
    setGrabUniforms: vi.fn(
      (
        point: [number, number, number],
        opts?: {
          radius?: number;
          strength?: number;
          active?: 0 | 1;
          initPending?: 0 | 1;
        },
      ) => {
        grabNodes.grabCenterX.value = point[0];
        grabNodes.grabCenterY.value = point[1];
        grabNodes.grabCenterZ.value = point[2];
        if (opts?.radius !== undefined) grabNodes.grabRadius.value = opts.radius;
        if (opts?.strength !== undefined) grabNodes.grabStrength.value = opts.strength;
        if (opts?.active !== undefined) grabNodes.grabActive.value = opts.active;
        if (opts?.initPending !== undefined) grabNodes.grabInitPending.value = opts.initPending;
      },
    ),
  };
  return tslSolver;
}

// Discriminated-union tier builders for the four canonical tier configs.
function gpuTiers(grabNodes: MockGrabNodes, gpu = makeGpuMock()): {
  tiers: ClothToolTiers;
  gpu: ReturnType<typeof makeGpuMock>;
  tslSolver: ReturnType<typeof makeTslMock>;
} {
  const tslSolver = makeTslMock(grabNodes);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tiers: { kind: 'gpu', gpu: gpu as any, tslSolver: tslSolver as any },
    gpu,
    tslSolver,
  };
}

function wasmTiers(positions: Float32Array, wasm = makeWasmMock()): {
  tiers: ClothToolTiers;
  wasm: ReturnType<typeof makeWasmMock>;
} {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tiers: { kind: 'wasm', wasm: wasm as any, positions },
    wasm,
  };
}

function noneTiers(): ClothToolTiers {
  return { kind: 'none' };
}

describe('dispatchBrushStroke', () => {
  it('dispatches to GPU variant and returns true', () => {
    const { tiers, gpu } = gpuTiers(makeGrabNodes());
    const result = dispatchBrushStroke(
      { point: [1, 2, 3], radius: 0.05, strength: 0.5 },
      tiers,
    );
    expect(result).toBe(true);
    expect(gpu.setBrushParams).toHaveBeenCalledTimes(1);
    expect(gpu.setBrushParams).toHaveBeenCalledWith([1, 2, 3], 0.05, 0.5);
  });

  it('returns false on WASM variant (CPU/WASM/Neural-only configs)', () => {
    const { tiers, wasm } = wasmTiers(new Float32Array([0, 0, 0]));
    expect(
      dispatchBrushStroke({ point: [0, 0, 0], radius: 0.05, strength: 0.5 }, tiers),
    ).toBe(false);
    expect(wasm.setPins).not.toHaveBeenCalled();
  });

  it('returns false on `none` variant', () => {
    expect(
      dispatchBrushStroke({ point: [0, 0, 0], radius: 0.05, strength: 0.5 }, noneTiers()),
    ).toBe(false);
  });
});

describe('dispatchBrushClear', () => {
  it('zeroes brush params on GPU variant', () => {
    const { tiers, gpu } = gpuTiers(makeGrabNodes());
    dispatchBrushClear(tiers);
    expect(gpu.setBrushParams).toHaveBeenCalledWith([0, 0, 0], 0, 0);
  });

  it('is a no-op on non-GPU variants', () => {
    expect(() => dispatchBrushClear(noneTiers())).not.toThrow();
    const { tiers } = wasmTiers(new Float32Array([0, 0, 0]));
    expect(() => dispatchBrushClear(tiers)).not.toThrow();
  });
});

describe('dispatchGrabInit — GPU path', () => {
  let grabNodes: MockGrabNodes;
  let tiers: ClothToolTiers;
  let tslSolver: ReturnType<typeof makeTslMock>;

  beforeEach(() => {
    grabNodes = makeGrabNodes();
    ({ tiers, tslSolver } = gpuTiers(grabNodes));
  });

  it('writes grab uniforms via setGrabUniforms and returns a non-null handle', () => {
    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.08, strength: 0.6 },
      tiers,
    );
    expect(handle).not.toBeNull();
    // setGrabUniforms encapsulates the uniform write (#703); per-field
    // values still observable through the mock's grabNodes proxy.
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledTimes(1);
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledWith(
      [1, 2, 3],
      { radius: 0.08, strength: 0.6, active: 1, initPending: 1 },
    );
    expect(grabNodes.grabCenterX.value).toBe(1);
    expect(grabNodes.grabCenterY.value).toBe(2);
    expect(grabNodes.grabCenterZ.value).toBe(3);
    expect(grabNodes.grabRadius.value).toBe(0.08);
    expect(grabNodes.grabStrength.value).toBe(0.6);
    expect(grabNodes.grabActive.value).toBe(1);
    expect(grabNodes.grabInitPending.value).toBe(1);
  });
});

describe('dispatchGrabInit — WASM path', () => {
  it('captures particles within radius and calls setPins positionally', () => {
    // Two particles: one at origin (within radius), one far away (outside).
    const positions = new Float32Array([0, 0, 0, /* p0 */ 10, 10, 10 /* p1 */]);
    const { tiers, wasm } = wasmTiers(positions);

    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );

    expect(handle).not.toBeNull();
    expect(wasm.setPins).toHaveBeenCalledTimes(1);
    expect(wasm.setPins).toHaveBeenCalledWith([
      { vertexIndex: 0, position: [0, 0, 0] },
    ]);
  });

  it('returns null when no particles fall within radius', () => {
    const positions = new Float32Array([10, 10, 10]);
    const { tiers, wasm } = wasmTiers(positions);

    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );

    expect(handle).toBeNull();
    expect(wasm.setPins).not.toHaveBeenCalled();
  });

  it('uses STRICT inequality (particle exactly on radius boundary is excluded)', () => {
    // Place particle at exactly distance r=0.5 (rSq = 0.25 == 0.25 → not <).
    const positions = new Float32Array([0.5, 0, 0]);
    const { tiers } = wasmTiers(positions);

    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );
    expect(handle).toBeNull();
  });

  it('captures startPoint defensively (caller buffer reuse safe)', () => {
    // Place particle exactly at the click point so it falls within radius
    // and the defensive-copy code path is exercised.
    const positions = new Float32Array([1, 2, 3]);
    const { tiers, wasm } = wasmTiers(positions);

    const reusedPoint: [number, number, number] = [1, 2, 3];
    const handle = dispatchGrabInit(
      { point: reusedPoint, radius: 0.5, strength: 1.0 },
      tiers,
    );
    expect(handle).not.toBeNull();
    // Mutate caller's buffer post-init.
    reusedPoint[0] = 999;
    reusedPoint[1] = 999;
    reusedPoint[2] = 999;
    // Anchor preserved: a subsequent move() must compute delta from the
    // original [1,2,3] init point, not the corrupted [999,999,999] buffer.
    handle!.move([2, 3, 4]); // delta = (1, 1, 1)
    // Latest setPins call: base [1,2,3] + delta (1,1,1) = [2,3,4]
    expect(wasm.setPins).toHaveBeenLastCalledWith([
      { vertexIndex: 0, position: [2, 3, 4] },
    ]);
  });
});

describe('dispatchGrabInit — none variant', () => {
  it('returns null without invoking any client method', () => {
    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.5, strength: 1.0 },
      noneTiers(),
    );
    expect(handle).toBeNull();
  });
});

describe('GrabHandle.move — GPU path', () => {
  it('updates only grab center via setGrabUniforms, leaves radius/strength alone', () => {
    const grabNodes = makeGrabNodes();
    const { tiers, tslSolver } = gpuTiers(grabNodes);

    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.08, strength: 0.6 },
      tiers,
    );
    expect(handle).not.toBeNull();
    // Reset to focus assertions on move() alone.
    tslSolver.setGrabUniforms.mockClear();

    const ok = handle!.move([5, 6, 7]);

    expect(ok).toBe(true);
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledTimes(1);
    // Move call must NOT pass radius/strength/active/initPending — only point.
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledWith([5, 6, 7]);
    expect(grabNodes.grabCenterX.value).toBe(5);
    expect(grabNodes.grabCenterY.value).toBe(6);
    expect(grabNodes.grabCenterZ.value).toBe(7);
    // Radius/strength preserved from init.
    expect(grabNodes.grabRadius.value).toBe(0.08);
    expect(grabNodes.grabStrength.value).toBe(0.6);
    expect(grabNodes.grabActive.value).toBe(1);
  });

  it('returns false if called after release()', () => {
    const grabNodes = makeGrabNodes();
    const { tiers } = gpuTiers(grabNodes);
    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.08, strength: 0.6 },
      tiers,
    );
    handle!.release();
    expect(handle!.move([1, 2, 3])).toBe(false);
  });
});

describe('GrabHandle.move — WASM path', () => {
  it('writes setPins with base + delta math (axis correctness — no XYZ swap)', () => {
    // Build a WASM handle by going through init with a particle exactly at
    // [1,2,3] so basePositions captures [10,20,30] from positions array.
    // But the simpler route: use a 1-particle scenario where base = the
    // particle's position and startPoint = init args.point.
    //
    // Construct positions = [10,20,30], init point = [1,2,3] with a large
    // enough radius. base[] captured = [10,20,30], startPoint = [1,2,3].
    // Then move([4,6,8]) → delta = (3,4,5) → setPins position = [13,24,35].
    const positions = new Float32Array([10, 20, 30]);
    const { tiers, wasm } = wasmTiers(positions);
    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 100, strength: 1.0 },
      tiers,
    );
    expect(handle).not.toBeNull();
    // The init call captures the particle (radius 100 covers it). Move now.
    wasm.setPins.mockClear();

    const ok = handle!.move([4, 6, 8]);

    expect(ok).toBe(true);
    // delta = (3, 4, 5); expected = (10+3, 20+4, 30+5) = (13, 24, 35).
    expect(wasm.setPins).toHaveBeenCalledTimes(1);
    expect(wasm.setPins).toHaveBeenCalledWith([
      { vertexIndex: 0, position: [13, 24, 35] },
    ]);
  });

  it('returns false after release()', () => {
    const positions = new Float32Array([0, 0, 0]);
    const { tiers } = wasmTiers(positions);
    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );
    handle!.release();
    expect(handle!.move([1, 2, 3])).toBe(false);
  });
});

describe('GrabHandle.release — tier-bound cleanup', () => {
  it('GPU release flips grabActive to 0 via setGrabUniforms (other uniforms preserved)', () => {
    const grabNodes = makeGrabNodes();
    const { tiers, tslSolver } = gpuTiers(grabNodes);
    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.08, strength: 0.6 },
      tiers,
    );
    expect(grabNodes.grabActive.value).toBe(1);
    tslSolver.setGrabUniforms.mockClear();

    handle!.release();

    expect(grabNodes.grabActive.value).toBe(0);
    // Last call must have written active=0 (radius/strength unchanged).
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledTimes(1);
    const [, opts] = tslSolver.setGrabUniforms.mock.calls[0];
    expect(opts).toEqual({ active: 0 });
    // Radius/strength preserved (release should not zero them).
    expect(grabNodes.grabRadius.value).toBe(0.08);
    expect(grabNodes.grabStrength.value).toBe(0.6);
  });

  it('WASM release clears pins when state has indices', () => {
    const positions = new Float32Array([0, 0, 0]);
    const { tiers, wasm } = wasmTiers(positions);
    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );
    expect(handle).not.toBeNull();

    handle!.release();

    expect(wasm.clearPins).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second release() is a no-op', () => {
    const grabNodes = makeGrabNodes();
    const { tiers, tslSolver } = gpuTiers(grabNodes);
    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.08, strength: 0.6 },
      tiers,
    );
    handle!.release();
    tslSolver.setGrabUniforms.mockClear();
    handle!.release();
    expect(tslSolver.setGrabUniforms).not.toHaveBeenCalled();
  });

  it('idempotent on WASM too — second release() does not call clearPins again', () => {
    const positions = new Float32Array([0, 0, 0]);
    const { tiers, wasm } = wasmTiers(positions);
    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );
    handle!.release();
    wasm.clearPins.mockClear();
    handle!.release();
    expect(wasm.clearPins).not.toHaveBeenCalled();
  });
});

describe('Tier precedence — discriminated union enforces single tier per init', () => {
  // Previously: a single ClothToolTiers could hold gpu+wasm+positions all at
  // once and the helper picked GPU first. With the discriminated union
  // (#701) the caller commits to a single variant at construction time;
  // `makeTiers()` in GarmentSimulation picks GPU when both are present.
  //
  // These tests pin that callers building a 'gpu' variant get GPU-only
  // dispatch and callers building a 'wasm' variant get WASM-only dispatch
  // — there is no longer a runtime fallthrough.

  it('gpu variant: dispatchGrabInit writes uniforms, never reaches WASM client', () => {
    const grabNodes = makeGrabNodes();
    const { tiers, tslSolver } = gpuTiers(grabNodes);

    const handle = dispatchGrabInit(
      { point: [1, 2, 3], radius: 0.5, strength: 1.0 },
      tiers,
    );

    expect(handle).not.toBeNull();
    expect(grabNodes.grabActive.value).toBe(1);
    expect(tslSolver.setGrabUniforms).toHaveBeenCalledTimes(1);
  });

  it('wasm variant: GrabHandle.move calls setPins, never reaches TSL uniforms', () => {
    const positions = new Float32Array([0, 0, 0]);
    const { tiers, wasm } = wasmTiers(positions);

    const handle = dispatchGrabInit(
      { point: [0, 0, 0], radius: 0.5, strength: 1.0 },
      tiers,
    );
    expect(handle).not.toBeNull();
    wasm.setPins.mockClear();
    handle!.move([1, 2, 3]);
    expect(wasm.setPins).toHaveBeenCalledTimes(1);
  });
});

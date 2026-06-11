import { describe, it, expect, vi } from 'vitest';

// Module-load shims for the GPU dependency tree. The client classes under
// test (`GpuSolverClient`, transitively `tslBuffers`/`tslSolver`/etc.)
// import non-type symbols from `three/webgpu` + `three/tsl`. We never
// invoke those symbols here — the contract suite only inspects prototypes
// + frozen capability constants — so the shims just need to satisfy the
// module loader.
//
// `three/webgpu` and `three/tsl` resolve to the same bundle in real
// builds, so both mocks must include the same surface (cf. the existing
// pattern in `src/utils/cloth/gpu/__tests__/tslSolver.test.ts:92-102`).
// The chain-callable proxy + StorageBufferAttribute stub matches the
// minimum surface that downstream module-level imports touch.
const { MockSBA, tslExports } = vi.hoisted(() => {
  class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    itemSize: number;
    count: number;
    version = 0;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function chainStub() { return chain; }, {
    get(_t, prop) {
      // Stop infinite recursion on Symbol-based lookups (e.g. iteration,
      // toPrimitive). Returning `undefined` lets the JS runtime fall back
      // to default behaviour for those slots, which is enough since we
      // never iterate the proxy ourselves.
      if (typeof prop === 'symbol') return undefined;
      return chain;
    },
    apply: () => chain,
  });
  const tslExports = {
    storage: () => chain,
    Fn: () => () => chain,
    If: () => ({ Else: () => undefined }),
    compute: (_fn: unknown, count: number) => ({ __tslCompute: true, dispatchCount: count }),
    uniform: (val: unknown) => ({ value: val }),
    float: (val: unknown) => ({ value: val }),
    uint: (val: unknown) => ({ value: val }),
    int: (val: unknown) => ({ value: val }),
    vec3: () => chain,
    instanceIndex: chain,
    Loop: () => undefined,
    atomicStore: () => chain,
    atomicAdd: () => chain,
    atomicLoad: () => chain,
    atomicMin: () => chain,
  };
  return { MockSBA, tslExports };
});

vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: MockSBA,
  ...tslExports,
}));

vi.mock('three/tsl', () => ({
  StorageBufferAttribute: MockSBA,
  ...tslExports,
}));

import {
  CPU_CAPABILITIES,
  WASM_CAPABILITIES,
  GPU_CAPABILITIES,
  NEURAL_CAPABILITIES,
  type SolverCapabilities,
} from '../solverCapabilities';
import { ClothWorkerClient } from '../clothWorkerClient';
import { WasmSolverClient } from '../wasm/wasmSolverClient';
import { GpuSolverClient } from '../gpu/gpuSolverClient';
import { NeuralDrapeClient } from '../neural/neuralDrapeClient';

// Pin the full capability matrix per tier so any silent flag flip lights this
// up loud. Most flips here are intentional decisions (e.g. flipping
// `bodyCollision: false → true` once a tier validates against a baseline
// scenario), so this test is the forcing function: a flip without an updated
// pin = test failure, which forces the author to confirm the criterion
// was actually verified.
//
// `frameDriven` is intentionally absent on CPU/WASM literals (the field is
// optional on the type), so the pin matches the literal as-written.

describe('SolverCapabilities frozen shape', () => {
  it('CPU pin', () => {
    expect(CPU_CAPABILITIES).toEqual({
      selfCollision: true,
      bodyCollision: true,
      lra: true,
      pressure: true,
      fold: true,
      pieceStiffness: true,
      seams: true,
      tools: { steamBrush: false, meshGrab: false },
    });
  });

  it('WASM pin', () => {
    expect(WASM_CAPABILITIES).toEqual({
      selfCollision: true,
      bodyCollision: true,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      seams: true,
      tools: { steamBrush: false, meshGrab: true },
    });
  });

  it('GPU pin — bodyCollision + seams stay false until each verifies against baseline', () => {
    expect(GPU_CAPABILITIES).toEqual({
      selfCollision: false,
      bodyCollision: false,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      seams: false,
      frameDriven: true,
      tools: { steamBrush: true, meshGrab: true },
    });
  });

  it('Neural pin', () => {
    expect(NEURAL_CAPABILITIES).toEqual({
      selfCollision: false,
      bodyCollision: false,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      seams: false,
      frameDriven: false,
      tools: { steamBrush: false, meshGrab: false },
    });
  });

  it('all four matrices are frozen (Object.freeze)', () => {
    expect(Object.isFrozen(CPU_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(WASM_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(GPU_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(NEURAL_CAPABILITIES)).toBe(true);
  });
});

// ── Capability flag ↔ runtime method-presence contract (#764) ───────────────
//
// Companion to the per-tier bridge contract suites ratified in
// #761/#774 (WASM), #762/#773 (GPU), and #775 (CPU). Those suites pin
// per-tier message shapes; this suite pins the cross-tier capability
// matrix — the meta-contract that joins the three bridges plus the
// Neural client.
//
// The `SolverCapabilities` flags split into two groups by enforcement
// shape (per A6 RFC § 3.1.C + A7 RFC § 3.3 ratifications):
//
//   1. Method-anchored flags — `tools.steamBrush`, `tools.meshGrab`,
//      `frameDriven`. These map to concrete-class methods or lifecycle
//      semantics. Flag `true` ↔ method present (or lifecycle-no-op for
//      `frameDriven`); flag `false` ↔ method absent. A mismatch is a
//      real bug.
//   2. Config-anchored flags — `selfCollision`, `bodyCollision`, `lra`,
//      `pressure`, `fold`, `pieceStiffness`, `seams`. These flow through
//      per-tier `setConfig` / construct-time toggles / init parameters,
//      NOT method presence. The frozen-shape pins above already enforce
//      their declared values per tier; there is no separate
//      method-presence contract to pin (intentionally — a `setConfig`
//      method exists on every tier regardless of which sub-fields it
//      honors, and `initMultiPiece` exists on every tier regardless of
//      whether it consumes a seam parameter). `seams` consumption per
//      tier is pinned by the Epic-746 bridge suites instead:
//      `wasmSolverClient.test.ts` (seams forwarded verbatim, BP-1
//      default), `clothWorkerClient` contracts (seamData in init), and
//      `gpuSolverClient.test.ts` (seamPairs shape).
//
// `meshGrab=true` has tier-specific implementation surface (per
// `solverCapabilities.ts:54-79`):
//   - GPU drives it via `tslSolverRef.grabNodes.*` uniforms exposed
//     through `grabStart` / `grabMove` / `grabRelease`.
//   - WASM drives it via positional pins through `setPins` / `clearPins`
//     (per A6 RFC Q2 — `position` field is the target).
// CPU has freeze-only `pinParticle` / `unpinParticle` (single-arg, no
// position vector — A6 #684 caveat); that is NOT `meshGrab` and the
// CPU capability flag correctly reports `false`.

interface TierEntry {
  name: 'CPU' | 'WASM' | 'GPU' | 'Neural';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctor: { prototype: any };
  capabilities: SolverCapabilities;
}

const TIERS: TierEntry[] = [
  { name: 'CPU',    ctor: ClothWorkerClient, capabilities: CPU_CAPABILITIES },
  { name: 'WASM',   ctor: WasmSolverClient,  capabilities: WASM_CAPABILITIES },
  { name: 'GPU',    ctor: GpuSolverClient,   capabilities: GPU_CAPABILITIES },
  { name: 'Neural', ctor: NeuralDrapeClient, capabilities: NEURAL_CAPABILITIES },
];

/**
 * Read the `capabilities` getter off the prototype without instantiating
 * the class. Required for `GpuSolverClient` (constructor needs a real
 * `GPUDevice`) and convenient for the other tiers (no worker spin-up).
 *
 * The getter is constant-returning per tier — `this` is unused — so
 * `.call({})` is safe.
 */
function readCapabilitiesFromPrototype(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctor: { prototype: any },
): SolverCapabilities {
  const desc = Object.getOwnPropertyDescriptor(ctor.prototype, 'capabilities');
  if (!desc?.get) {
    throw new Error('capabilities is not a getter on the prototype');
  }
  return desc.get.call({}) as SolverCapabilities;
}

describe('Capability surface ↔ runtime contract (#764)', () => {
  describe('capabilities getter resolves to the canonical frozen constant', () => {
    for (const tier of TIERS) {
      it(`${tier.name} client.capabilities === ${tier.name}_CAPABILITIES`, () => {
        const caps = readCapabilitiesFromPrototype(tier.ctor);
        // Referential identity — each client returns the singleton frozen
        // constant, not a per-instance copy.
        expect(caps).toBe(tier.capabilities);
      });
    }
  });

  describe('tools.steamBrush ↔ setBrushParams presence', () => {
    // Only tier with `setBrushParams` is GPU (TSL `brushNodes` uniforms).
    // CPU/WASM/Neural have no live velocity buffer access, so the method
    // is absent and the capability flag reports `false`.
    for (const tier of TIERS) {
      const flag = tier.capabilities.tools?.steamBrush ?? false;
      const has = typeof tier.ctor.prototype.setBrushParams === 'function';
      it(`${tier.name}: tools.steamBrush=${flag} ↔ setBrushParams ${flag ? 'exists' : 'absent'}`, () => {
        expect(has).toBe(flag);
      });
    }
  });

  describe('tools.meshGrab ↔ positional grab API presence', () => {
    // Tier-specific surface: GPU = `grab*` uniforms; WASM = positional
    // `setPins`. The capability flag reports `true` for both;
    // implementation method names diverge per A6 RFC Q2.
    it('GPU: meshGrab=true → grabStart/grabMove/grabRelease exist; setPins absent', () => {
      expect(GPU_CAPABILITIES.tools?.meshGrab).toBe(true);
      expect(typeof GpuSolverClient.prototype.grabStart).toBe('function');
      expect(typeof GpuSolverClient.prototype.grabMove).toBe('function');
      expect(typeof GpuSolverClient.prototype.grabRelease).toBe('function');
      // GPU does not expose `setPins` — pinning happens via TSL uniforms.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((GpuSolverClient.prototype as any).setPins).toBeUndefined();
    });

    it('WASM: meshGrab=true → setPins/clearPins exist (positional shape per A6 RFC Q2); grabStart absent', () => {
      expect(WASM_CAPABILITIES.tools?.meshGrab).toBe(true);
      expect(typeof WasmSolverClient.prototype.setPins).toBe('function');
      expect(typeof WasmSolverClient.prototype.clearPins).toBe('function');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((WasmSolverClient.prototype as any).grabStart).toBeUndefined();
    });

    it('CPU: meshGrab=false → no setPins, no grabStart (only freeze-only pinParticle)', () => {
      expect(CPU_CAPABILITIES.tools?.meshGrab).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((ClothWorkerClient.prototype as any).setPins).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((ClothWorkerClient.prototype as any).grabStart).toBeUndefined();
      // CPU exposes single-arg freeze-only pinning per A6 #684 caveat —
      // present but NOT meshGrab.
      expect(typeof ClothWorkerClient.prototype.pinParticle).toBe('function');
      expect(typeof ClothWorkerClient.prototype.unpinParticle).toBe('function');
    });

    it('Neural: meshGrab=false → no positional pin / grab API at all', () => {
      expect(NEURAL_CAPABILITIES.tools?.meshGrab).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((NeuralDrapeClient.prototype as any).setPins).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((NeuralDrapeClient.prototype as any).grabStart).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((NeuralDrapeClient.prototype as any).pinParticle).toBeUndefined();
    });
  });

  describe('frameDriven flag captures lifecycle convention (per A6 § 3.1 Constraint B)', () => {
    // Only GPU's `start()` is documented as no-op (consumer drives via
    // `useFrame`). CPU + WASM proxy to a worker that runs its own loop,
    // so the field is intentionally absent (optional on the interface).
    // Neural manages its own `requestAnimationFrame` loop and reports
    // `false` so consumers know to call `start()` rather than dispatch
    // frames themselves.
    it('GPU declares frameDriven=true', () => {
      expect(GPU_CAPABILITIES.frameDriven).toBe(true);
    });

    it('CPU does not declare frameDriven (worker-managed loop)', () => {
      expect(CPU_CAPABILITIES.frameDriven).toBeUndefined();
    });

    it('WASM does not declare frameDriven (worker-managed loop)', () => {
      expect(WASM_CAPABILITIES.frameDriven).toBeUndefined();
    });

    it('Neural declares frameDriven=false (manages its own RAF loop)', () => {
      expect(NEURAL_CAPABILITIES.frameDriven).toBe(false);
    });
  });

  describe('lifecycle subset is universal across all 4 tiers (A6 § 3.1.C)', () => {
    // start/stop/dispose + capabilities getter are the minimal core
    // ratified in `ClothSolverClient`. Every tier MUST expose them or
    // the `implements ClothSolverClient` declaration would not compile.
    // Pinning at runtime is belt-and-suspenders insurance against a
    // future refactor that loosens the interface.
    for (const tier of TIERS) {
      it(`${tier.name}: start / stop / dispose present on prototype`, () => {
        expect(typeof tier.ctor.prototype.start).toBe('function');
        expect(typeof tier.ctor.prototype.stop).toBe('function');
        expect(typeof tier.ctor.prototype.dispose).toBe('function');
      });

      it(`${tier.name}: capabilities is a getter on the prototype`, () => {
        const desc = Object.getOwnPropertyDescriptor(tier.ctor.prototype, 'capabilities');
        expect(desc?.get).toBeInstanceOf(Function);
      });
    }
  });
});

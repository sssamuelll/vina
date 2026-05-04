import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so MockSBA + setAtomicCalls are
// available to both mocks. `setAtomicCalls` is exposed for the atomic
// regression guards on the per-body scratch buffers.
const { MockSBA, setAtomicCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  const MockSBA = class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  };
  return { MockSBA, setAtomicCalls };
});

vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: MockSBA,
}));

vi.mock('three/tsl', () => {
  // Same chain proxy pattern as tslSelfCollision.test.ts — any property access
  // or function call returns another proxy, so arbitrarily chained TSL
  // operations work without explicit stubs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() { return createChainProxy(); },
      apply() { return createChainProxy(); },
    };
    return new Proxy(function () {}, handler);
  };
  const proxy = createChainProxy();

  return {
    StorageBufferAttribute: MockSBA,
    Fn: () => () => proxy,
    storage: (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = new Proxy(function () {}, {
        get(_target, prop) {
          if (prop === 'setAtomic') {
            return function (value: boolean) {
              setAtomicCalls.push({ sba: args[0], value });
              return node;
            };
          }
          return createChainProxy();
        },
        apply() { return createChainProxy(); },
      });
      return node;
    },
    compute: () => proxy,
    uniform: () => proxy,
    instanceIndex: proxy,
    uint: () => proxy,
    int: () => proxy,
    float: () => proxy,
    If: () => proxy,
    Loop: () => proxy,
    atomicAdd: () => proxy,
    atomicStore: () => proxy,
    atomicLoad: () => proxy,
    atomicMin: () => proxy,
  };
});

import { createTslCollisionBody } from '../tslCollision';
import { StorageBufferAttribute } from 'three/webgpu';

// Test fixture builder — minimal valid BVH/tri data so the kernel factory has
// something to size its storage() calls against. We don't dispatch the kernels
// (jsdom has no WebGPU), only construct + assert shape.
function buildKernel(opts?: {
  numParticles?: number;
  numNodes?: number;
  numTris?: number;
  margin?: number;
  friction?: number;
  id?: string;
}) {
  setAtomicCalls.length = 0;
  const numParticles = opts?.numParticles ?? 16;
  const numNodes = opts?.numNodes ?? 4;
  const numTris = opts?.numTris ?? 2;

  const bvhNodesSBA = new StorageBufferAttribute(new Float32Array(numNodes * 8), 1);
  const triVertsSBA = new StorageBufferAttribute(new Float32Array(numTris * 9), 1);
  const triNormalsSBA = new StorageBufferAttribute(new Float32Array(numTris * 3), 1);

  // Minimal mock TSL node — supports `.element(i).x/y/z` and arbitrary chained
  // ops via the test's proxy mock. Solver passes its own buffer nodes here in
  // production; for construction we just need the chain shape.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mockNode: any = { element: () => mockNode, x: { sub: () => mockNode, add: () => mockNode, mul: () => mockNode } };

  return createTslCollisionBody(
    mockNode,
    mockNode,
    mockNode,
    bvhNodesSBA,
    triVertsSBA,
    triNormalsSBA,
    numParticles,
    numNodes,
    numTris,
    opts?.id ?? 'test-body',
    opts?.margin ?? 0.005,
    opts?.friction ?? 0.3,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('createTslCollisionBody', () => {
  it('exports the factory', () => {
    expect(createTslCollisionBody).toBeDefined();
  });

  it('returns body with both pass nodes and metadata', () => {
    const body = buildKernel();
    expect(body.id).toBe('test-body');
    expect(body.findBestNode).toBeDefined();
    expect(body.applyPushNode).toBeDefined();
    expect(body.margin).toBe(0.005);
    expect(body.friction).toBe(0.3);
  });

  it('preserves nodeCount and triCount for telemetry', () => {
    const body = buildKernel({ numNodes: 17, numTris: 9 });
    expect(body.nodeCount).toBe(17);
    expect(body.triCount).toBe(9);
  });

  it('honors custom margin and friction', () => {
    const body = buildKernel({ margin: 0.02, friction: 0.7 });
    expect(body.margin).toBe(0.02);
    expect(body.friction).toBe(0.7);
  });

  it('honors custom body id (multi-body composition)', () => {
    const body = buildKernel({ id: '__avatar__' });
    expect(body.id).toBe('__avatar__');
  });
});

// ─── Atomic-buffer regression guards ────────────────────────────────────────
// Per-body scratch (`bestDistBuf`, `bestTriIdxBuf`) MUST be declared atomic so
// WGSL emits `array<atomic<i32>>` with read_write access. Without this, the
// kernel falls back to the broken toVar/storage-read codegen and produces
// ~200 validation warnings (per the design doc on the prior attempt).

describe('atomic-buffer regression guards', () => {
  it('per-body bestDist scratch is declared atomic', () => {
    buildKernel();
    // bestDist is the first atomic SBA created in the factory (Int32Array).
    const atomicI32Calls = setAtomicCalls.filter(
      (c) => (c.sba as { array: ArrayLike<number> }).array instanceof Int32Array,
    );
    expect(atomicI32Calls.length).toBeGreaterThanOrEqual(2);
    // Both scratch buffers should have setAtomic(true) — see design doc rationale.
    expect(atomicI32Calls.every((c) => c.value === true)).toBe(true);
  });

  it('initializes bestDist scratch to INT32_MAX so first candidate wins atomicMin', () => {
    const numParticles = 8;
    setAtomicCalls.length = 0;
    buildKernel({ numParticles });
    // First atomic-tagged SBA == bestDist. Its array should be all 0x7FFFFFFF.
    const bestDistCall = setAtomicCalls.find(
      (c) => (c.sba as { array: ArrayLike<number> }).array instanceof Int32Array,
    );
    expect(bestDistCall).toBeDefined();
    const arr = (bestDistCall!.sba as { array: Int32Array }).array;
    expect(arr.length).toBe(numParticles);
    expect(arr[0]).toBe(0x7FFFFFFF);
    expect(arr[numParticles - 1]).toBe(0x7FFFFFFF);
  });

  it('initializes bestTriIdx scratch to -1 so "no collision found" is the natural sentinel', () => {
    const numParticles = 8;
    setAtomicCalls.length = 0;
    buildKernel({ numParticles });
    // The two atomic SBAs are bestDist (filled with INT32_MAX) and
    // bestTriIdx (filled with -1) — distinguish by checking the fill value.
    const allAtomicSBAs = setAtomicCalls
      .map((c) => (c.sba as { array: Int32Array }).array)
      .filter((a) => a instanceof Int32Array);
    const bestTriIdx = allAtomicSBAs.find((a) => a[0] === -1);
    expect(bestTriIdx).toBeDefined();
    expect(bestTriIdx!.length).toBe(numParticles);
  });

  it('per-body scratch SBAs are distinct across bodies (no aliasing)', () => {
    // Multi-body composition: each call to createTslCollisionBody must allocate
    // its own bestDistBuf + bestTriIdxBuf. If a future refactor hoists the
    // scratch SBAs to module scope as a perf "optimization", two bodies
    // dispatched in sequence would race on shared atomic state and silently
    // corrupt each other's collision results. This test is the tripwire.
    setAtomicCalls.length = 0;
    buildKernel({ id: 'avatar-1', numParticles: 8 });
    const a1Scratch = setAtomicCalls
      .map((c) => c.sba)
      .filter((sba) => (sba as { array: ArrayLike<number> }).array instanceof Int32Array);

    setAtomicCalls.length = 0;
    buildKernel({ id: 'avatar-2', numParticles: 8 });
    const a2Scratch = setAtomicCalls
      .map((c) => c.sba)
      .filter((sba) => (sba as { array: ArrayLike<number> }).array instanceof Int32Array);

    expect(a1Scratch.length).toBeGreaterThanOrEqual(2);
    expect(a2Scratch.length).toBeGreaterThanOrEqual(2);
    // Both bestDist (idx 0) and bestTriIdx (idx 1) must be distinct allocations.
    expect(a1Scratch[0]).not.toBe(a2Scratch[0]);
    expect(a1Scratch[1]).not.toBe(a2Scratch[1]);
  });
});

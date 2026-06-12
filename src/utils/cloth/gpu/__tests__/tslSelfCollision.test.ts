import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so MockSBA is available to both mocks.
// `setAtomicCalls` is exposed for #554 regression guard tests — every storage(...)
// call returns a node whose `.setAtomic` records {sba, value} into this array.
const { MockSBA, setAtomicCalls, atomicLoadCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  // `atomicLoadCalls` is exposed for #554 spec-compliance regression tests —
  // WGSL spec requires atomicLoad on every read of an array<atomic<T>>
  // buffer. Symmetric to `setAtomicCalls`.
  const atomicLoadCalls: Array<unknown> = [];
  const MockSBA = class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  };
  return { MockSBA, setAtomicCalls, atomicLoadCalls };
});

// Mock three/webgpu and three/tsl before importing.
// Note: three/webgpu and three/tsl resolve to the same bundle in Three.js,
// so both mocks must include StorageBufferAttribute to avoid Vitest
// deduplication issues.
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: MockSBA,
}));

vi.mock('three/tsl', () => {
  // Deep proxy that returns itself for any property access or function call.
  // This allows arbitrarily chained TSL operations (.mul().add().bitXor() etc.)
  // without needing explicit stubs for every method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() {
        // Return another proxy for any property access
        return createChainProxy();
      },
      apply() {
        // Return another proxy for any function call
        return createChainProxy();
      },
    };
    return new Proxy(function () {}, handler);
  };

  const proxy = createChainProxy();

  // Wrap callback invocation so a missing mock surface inside the body
  // doesn't abort the whole test — partial execution still triggers
  // atomicLoad / setAtomic side-effects we care about.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryInvoke = (cb: unknown, arg?: any) => {
    if (typeof cb === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (cb as (...a: any[]) => any)(arg ?? proxy); } catch { /* mock surface incomplete — partial coverage */ }
    }
  };

  return {
    StorageBufferAttribute: MockSBA,
    // Fn: invoke callback so atomicLoad / atomicStore / setAtomic side-effects
    // inside the kernel body fire and can be asserted on.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Fn: (cb?: (...args: any[]) => any) => () => { tryInvoke(cb); return proxy; },
    // storage: returns a per-call proxy that intercepts `.setAtomic` to capture
    // {sba, value} for #554 regression guards. All other property/call access
    // delegates to the chain proxy so existing tests still pass transparently.
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
        apply() {
          return createChainProxy();
        },
      });
      return node;
    },
    uniform: () => proxy,
    instanceIndex: proxy,
    uint: () => proxy,
    int: () => proxy,
    float: () => proxy,
    vec3: () => proxy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    If: (_cond: unknown, cb?: (...args: any[]) => any) => { tryInvoke(cb); return proxy; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Loop: (_count: unknown, cb?: (...args: any[]) => any) => { tryInvoke(cb, { i: proxy }); return proxy; },
    atomicAdd: () => proxy,
    atomicStore: () => proxy,
    atomicLoad: (dest: unknown) => {
      atomicLoadCalls.push(dest);
      return proxy;
    },
  };
});

import {
  createSelfCollisionBuffers,
  makeSelfCollisionComputeNodes,
} from '../tslSelfCollision';
import type { SelfCollisionComputeNodes } from '../tslSelfCollision';

describe('tslSelfCollision', () => {
  it('exports createSelfCollisionBuffers', () => {
    expect(createSelfCollisionBuffers).toBeDefined();
  });

  it('creates buffer set with correct sizes', () => {
    const numParticles = 100;
    const adjacencyOffsets = new Uint32Array(numParticles + 1);
    const adjacencyNeighbors = new Uint32Array(200);
    const tableSize = 211; // prime

    const buffers = createSelfCollisionBuffers(
      numParticles,
      tableSize,
      adjacencyOffsets,
      adjacencyNeighbors,
    );

    expect(buffers).toBeDefined();
    expect(buffers.deltaSBA).toBeDefined();
    expect(buffers.corrCountSBA).toBeDefined();
    expect(buffers.cellCountSBA).toBeDefined();
    expect(buffers.cellStartSBA).toBeDefined();
    expect(buffers.cellEntriesSBA).toBeDefined();
    expect(buffers.adjOffsetsSBA).toBeDefined();
    expect(buffers.adjNeighborsSBA).toBeDefined();
    expect(buffers.tableSize).toBe(tableSize);
    expect(buffers.numParticles).toBe(numParticles);
  });

  it('delta buffer is Int32Array with N*3 elements', () => {
    const buffers = createSelfCollisionBuffers(50, 101, new Uint32Array(51), new Uint32Array(100));
    expect(buffers.deltaSBA.array).toBeInstanceOf(Int32Array);
    expect(buffers.deltaSBA.array.length).toBe(150); // 50 * 3
  });

  it('corrCount buffer is Uint32Array with N elements', () => {
    const buffers = createSelfCollisionBuffers(50, 101, new Uint32Array(51), new Uint32Array(100));
    expect(buffers.corrCountSBA.array).toBeInstanceOf(Uint32Array);
    expect(buffers.corrCountSBA.array.length).toBe(50);
  });

  it('copies adjacency neighbor DATA into the SBA (not a zero-filled array)', () => {
    const buffers = createSelfCollisionBuffers(4, 8, new Uint32Array([0, 1, 2, 3, 3]), new Uint32Array([3, 7, 11]));
    expect(Array.from(buffers.adjNeighborsSBA.array as Uint32Array)).toEqual([3, 7, 11]);
  });
});

describe('makeSelfCollisionComputeNodes', () => {
  it('exports makeSelfCollisionComputeNodes', () => {
    expect(makeSelfCollisionComputeNodes).toBeDefined();
  });

  it('returns an object with all 5 compute node keys', () => {
    const numParticles = 20;
    const tableSize = 41;
    const buffers = createSelfCollisionBuffers(
      numParticles,
      tableSize,
      new Uint32Array(numParticles + 1),
      new Uint32Array(40),
    );

    // The mock TSL Fn returns the callback itself (Fn: (fn) => fn),
    // so the nodes will be functions. We only verify shape, not runtime.
    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const nodes: SelfCollisionComputeNodes = makeSelfCollisionComputeNodes(
      mockNode as any,
      mockNode as any,
      buffers,
      0.004,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(nodes).toBeDefined();
    expect(nodes.hashCountNode).toBeDefined();
    expect(nodes.prefixSumNode).toBeDefined();
    expect(nodes.scatterNode).toBeDefined();
    expect(nodes.resolveNode).toBeDefined();
    expect(nodes.applyNode).toBeDefined();
  });
});

// ─── #554 regression guards ──────────────────────────────────────────────────
// Future refactors / Three.js upgrades could silently drop `.setAtomic(true)`,
// regressing to WGSL `array<i32>` + Dawn warnings + silent CPU fallback. These
// tests guard against that for each of the three atomic buffers in the
// self-collision kernel pipeline.

describe('#554 atomic buffer regression guards', () => {
  function buildNodes() {
    setAtomicCalls.length = 0;
    const numParticles = 20;
    const tableSize = 41;
    const buffers = createSelfCollisionBuffers(
      numParticles,
      tableSize,
      new Uint32Array(numParticles + 1),
      new Uint32Array(40),
    );
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };
    makeSelfCollisionComputeNodes(mockNode as any, mockNode as any, buffers, 0.004);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return buffers;
  }

  it('declares array<atomic<i32>> on cellCountBuf via setAtomic(true)', () => {
    const buffers = buildNodes();
    const call = setAtomicCalls.find((c) => c.sba === buffers.cellCountSBA);
    expect(call).toBeDefined();
    expect(call?.value).toBe(true);
  });

  it('declares array<atomic<i32>> on deltaBuf via setAtomic(true)', () => {
    const buffers = buildNodes();
    const call = setAtomicCalls.find((c) => c.sba === buffers.deltaSBA);
    expect(call).toBeDefined();
    expect(call?.value).toBe(true);
  });

  it('declares array<atomic<i32>> on corrCountBuf via setAtomic(true)', () => {
    const buffers = buildNodes();
    const call = setAtomicCalls.find((c) => c.sba === buffers.corrCountSBA);
    expect(call).toBeDefined();
    expect(call?.value).toBe(true);
  });

  it('uses atomicLoad on read passes (#554 WGSL spec compliance)', () => {
    // Symmetric to the setAtomic guards above. The scatter / resolve / apply
    // passes read cellCountBuf, corrCountBuf, and deltaBuf via atomicLoad —
    // required because all three are array<atomic<i32>> (post-setAtomic).
    // Plain `.element(i)` is a WGSL validation error.
    atomicLoadCalls.length = 0;
    buildNodes();
    expect(atomicLoadCalls.length).toBeGreaterThan(0);
  });
});

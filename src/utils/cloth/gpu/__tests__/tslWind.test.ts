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

  const mockUniform = (val: number) => ({ value: val });

  // Wrap callback invocation — partial coverage on missing mock surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryInvoke = (cb: unknown, arg?: any) => {
    if (typeof cb === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (cb as (...a: any[]) => any)(arg ?? proxy); } catch { /* mock surface incomplete */ }
    }
  };

  return {
    StorageBufferAttribute: MockSBA,
    // Fn: invoke callback so atomicLoad / setAtomic side-effects fire and are
    // assertable.
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
    uniform: mockUniform,
    compute: (_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    }),
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
  createWindBuffers,
  makeWindComputeNode,
} from '../tslWind';
import type { WindBufferSet, WindComputeNodes } from '../tslWind';

describe('createWindBuffers', () => {
  it('is exported as a function', () => {
    expect(createWindBuffers).toBeDefined();
    expect(typeof createWindBuffers).toBe('function');
  });

  it('creates Int32Array with N*3 elements', () => {
    const N = 100;
    const buffers: WindBufferSet = createWindBuffers(N);

    expect(buffers.windAccumSBA).toBeDefined();
    expect(buffers.windAccumSBA.array).toBeInstanceOf(Int32Array);
    expect(buffers.windAccumSBA.array.length).toBe(N * 3);
  });

  it('stores numParticles', () => {
    const N = 42;
    const buffers: WindBufferSet = createWindBuffers(N);
    expect(buffers.numParticles).toBe(N);
  });

  it('creates SBA with itemSize 1', () => {
    const buffers = createWindBuffers(50);
    expect(buffers.windAccumSBA.itemSize).toBe(1);
  });
});

describe('makeWindComputeNode', () => {
  // Shared setup
  function createTestNodes() {
    const numParticles = 20;
    const numTriangles = 10;
    const windForce: [number, number, number] = [1.0, 0, 0];
    const dragCoefficient = 1.0;
    const buffers = createWindBuffers(numParticles);

    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };

    const mockSdtUniform = { value: 1 / 60 / 15 };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const nodes: WindComputeNodes = makeWindComputeNode(
      mockNode as any,  // posBufNode
      mockNode as any,  // velBufNode
      mockNode as any,  // invMassBufNode
      mockSdtUniform as any,  // sdtUniform
      mockNode as any,  // triIdsBufNode
      buffers,
      numTriangles,
      windForce,
      dragCoefficient,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { nodes, numParticles, numTriangles };
  }

  it('is exported as a function', () => {
    expect(makeWindComputeNode).toBeDefined();
    expect(typeof makeWindComputeNode).toBe('function');
  });

  it('returns an object with accumNode and applyNode', () => {
    const { nodes } = createTestNodes();
    expect(nodes).toBeDefined();
    expect(nodes.accumNode).toBeDefined();
    expect(nodes.applyNode).toBeDefined();
  });

  it('accumNode has dispatchCount matching numTriangles', () => {
    const { nodes, numTriangles } = createTestNodes();
    expect(nodes.accumNode).toHaveProperty('dispatchCount', numTriangles);
  });

  it('applyNode has dispatchCount matching numParticles', () => {
    const { nodes, numParticles } = createTestNodes();
    expect(nodes.applyNode).toHaveProperty('dispatchCount', numParticles);
  });

  it('exposes windX uniform with initial value', () => {
    const { nodes } = createTestNodes();
    expect(nodes.windX).toBeDefined();
    expect(nodes.windX.value).toBe(1.0);
  });

  it('exposes windY uniform with initial value', () => {
    const { nodes } = createTestNodes();
    expect(nodes.windY).toBeDefined();
    expect(nodes.windY.value).toBe(0);
  });

  it('exposes windZ uniform with initial value', () => {
    const { nodes } = createTestNodes();
    expect(nodes.windZ).toBeDefined();
    expect(nodes.windZ.value).toBe(0);
  });

  it('exposes dragCoeff uniform with initial value', () => {
    const { nodes } = createTestNodes();
    expect(nodes.dragCoeff).toBeDefined();
    expect(nodes.dragCoeff.value).toBe(1.0);
  });
});

// ─── #554 regression guard ──────────────────────────────────────────────────
// Future refactors / Three.js upgrades could silently drop `.setAtomic(true)`,
// regressing to WGSL `array<i32>` + Dawn warnings + silent CPU fallback. This
// test guards against that by asserting setAtomic is invoked with `true` on
// windAccumSBA in makeWindComputeNode.

describe('#554 atomic buffer regression guard', () => {
  it('declares array<atomic<i32>> on windAccumBuf via setAtomic(true)', () => {
    setAtomicCalls.length = 0;
    const numParticles = 20;
    const buffers = createWindBuffers(numParticles);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };
    const mockSdt = { value: 1 / 60 / 15 };
    makeWindComputeNode(
      mockNode as any,
      mockNode as any,
      mockNode as any,
      mockSdt as any,
      mockNode as any,
      buffers,
      10,
      [1, 0, 0],
      1.0,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const call = setAtomicCalls.find((c) => c.sba === buffers.windAccumSBA);
    expect(call).toBeDefined();
    expect(call?.value).toBe(true);
  });

  it('uses atomicLoad on read passes (#554 WGSL spec compliance)', () => {
    // Symmetric to the setAtomic guard above. The applyNode pass reads
    // windAccumBuf via atomicLoad — required because the buffer is
    // array<atomic<i32>> (post-setAtomic). Plain `.element(i)` is a WGSL
    // validation error.
    atomicLoadCalls.length = 0;
    const numParticles = 20;
    const buffers = createWindBuffers(numParticles);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };
    const mockSdt = { value: 1 / 60 / 15 };
    makeWindComputeNode(
      mockNode as any,
      mockNode as any,
      mockNode as any,
      mockSdt as any,
      mockNode as any,
      buffers,
      10,
      [1, 0, 0],
      1.0,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect(atomicLoadCalls.length).toBeGreaterThan(0);
  });
});

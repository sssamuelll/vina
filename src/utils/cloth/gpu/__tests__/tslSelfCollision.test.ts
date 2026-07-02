import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so MockSBA is available to both mocks.
// `setAtomicCalls` is exposed for #554 regression guard tests — every storage(...)
// call returns a node whose `.setAtomic` records {sba, value} into this array.
// `computeCalls` records every compute(fn, count, workgroupSize) wrap so tests
// can pin dispatch counts and workgroup size per pass (#897 F3).
const { MockSBA, setAtomicCalls, atomicLoadCalls, computeCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  // `atomicLoadCalls` is exposed for #554 spec-compliance regression tests —
  // WGSL spec requires atomicLoad on every read of an array<atomic<T>>
  // buffer. Symmetric to `setAtomicCalls`.
  const atomicLoadCalls: Array<unknown> = [];
  const computeCalls: Array<{ fn: unknown; count: unknown; workgroupSize: unknown }> = [];
  const MockSBA = class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  };
  return { MockSBA, setAtomicCalls, atomicLoadCalls, computeCalls };
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
    // compute: records {fn, count, workgroupSize} so the 4-pass bucket
    // pipeline tests can pin dispatch counts [tableSize, N, N, N] and the
    // [64] workgroup convention (#897 F3). Returns the recorded node itself
    // so identity checks against computeCalls entries work.
    compute: (fn: unknown, count: unknown, workgroupSize: unknown) => {
      const node = { isComputeNode: true, fn, count, workgroupSize };
      computeCalls.push(node);
      return node;
    },
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
    atomicMin: () => proxy,
    atomicStore: () => proxy,
    atomicLoad: (dest: unknown) => {
      atomicLoadCalls.push(dest);
      return proxy;
    },
  };
});

import {
  CELL_CAPACITY,
  createSelfCollisionBuffers,
  makeSelfCollisionComputeNodes,
} from '../tslSelfCollision';
import type { SelfCollisionComputeNodes } from '../tslSelfCollision';

/** Shape recorded by the compute() mock — see `computeCalls` above. */
interface MockComputeNode {
  isComputeNode: boolean;
  count: number;
  workgroupSize: number[];
}

const asMockCompute = (node: unknown): MockComputeNode => node as MockComputeNode;

describe('tslSelfCollision buffers (bucket layout, #897 F3)', () => {
  it('exports CELL_CAPACITY = 4 (P4-2 perf: keep-4-smallest, fps 27.9->31.3 con drape verde)', () => {
    expect(CELL_CAPACITY).toBe(4);
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
    expect(buffers.cellEntriesSBA).toBeDefined();
    expect(buffers.adjOffsetsSBA).toBeDefined();
    expect(buffers.adjNeighborsSBA).toBeDefined();
    expect(buffers.tableSize).toBe(tableSize);
    expect(buffers.numParticles).toBe(numParticles);
  });

  it('cellEntries is a fixed-capacity bucket array: tableSize * CELL_CAPACITY', () => {
    const tableSize = 211;
    const buffers = createSelfCollisionBuffers(100, tableSize, new Uint32Array(101), new Uint32Array(200));
    expect(buffers.cellEntriesSBA.array).toBeInstanceOf(Uint32Array);
    expect(buffers.cellEntriesSBA.array.length).toBe(tableSize * CELL_CAPACITY);
  });

  it('does NOT allocate a cellStart buffer — the bucket design has no prefix-sum pass', () => {
    const buffers = createSelfCollisionBuffers(100, 211, new Uint32Array(101), new Uint32Array(200));
    expect('cellStartSBA' in buffers).toBe(false);
  });

  it('does NOT allocate a cellCount buffer — P4-2 keep-smallest admission needs no counter', () => {
    const buffers = createSelfCollisionBuffers(50, 101, new Uint32Array(51), new Uint32Array(100));
    expect('cellCountSBA' in buffers).toBe(false);
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

describe('makeSelfCollisionComputeNodes (4-pass bucket pipeline, #897 F3)', () => {
  const NUM_PARTICLES = 20;
  const TABLE_SIZE = 41;

  function buildNodes(): SelfCollisionComputeNodes {
    computeCalls.length = 0;
    const buffers = createSelfCollisionBuffers(
      NUM_PARTICLES,
      TABLE_SIZE,
      new Uint32Array(NUM_PARTICLES + 1),
      new Uint32Array(40),
    );
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };
    const nodes = makeSelfCollisionComputeNodes(mockNode as any, mockNode as any, buffers, 0.004);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return nodes;
  }

  it('exports makeSelfCollisionComputeNodes', () => {
    expect(makeSelfCollisionComputeNodes).toBeDefined();
  });

  it('returns exactly the 4 bucket-pipeline nodes — no hashCount, no prefixSum', () => {
    const nodes = buildNodes();
    expect(Object.keys(nodes).sort()).toEqual([
      'applyNode',
      'cellClearNode',
      'resolveNode',
      'scatterNode',
    ]);
  });

  it('wraps all 4 passes in compute() with [64] workgroups inside the module', () => {
    const nodes = buildNodes();
    // Exactly 4 compute() wraps — one per pass, no extra/raw Fn nodes.
    expect(computeCalls.length).toBe(4);
    for (const key of ['cellClearNode', 'scatterNode', 'resolveNode', 'applyNode'] as const) {
      const node = asMockCompute(nodes[key]);
      expect(node.isComputeNode).toBe(true);
      // Plain .includes (strict ===) instead of toContain — the recorded
      // nodes carry the TSL chain proxy as `fn`, and chai's formatter chokes
      // converting the proxy to a primitive when introspecting members.
      expect(computeCalls.includes(nodes[key] as never)).toBe(true);
      expect(node.workgroupSize).toEqual([64]);
    }
  });

  it('dispatch counts are [tableSize*K, N, N, N] for cellClear/scatter/resolve/apply', () => {
    const nodes = buildNodes();
    // cellClear sentinel-fills every entries slot (P4-2) → tableSize*CELL_CAPACITY.
    expect(asMockCompute(nodes.cellClearNode).count).toBe(TABLE_SIZE * CELL_CAPACITY);
    expect(asMockCompute(nodes.scatterNode).count).toBe(NUM_PARTICLES);
    expect(asMockCompute(nodes.resolveNode).count).toBe(NUM_PARTICLES);
    expect(asMockCompute(nodes.applyNode).count).toBe(NUM_PARTICLES);
  });
});

// ─── #554 regression guards ──────────────────────────────────────────────────
// Future refactors / Three.js upgrades could silently drop `.setAtomic(true)`,
// regressing to WGSL `array<i32>` + Dawn warnings + silent CPU fallback. These
// tests guard against that for each of the three atomic buffers in the
// self-collision kernel pipeline (cellEntries: cellClear store + scatter
// atomicMin + resolve load; delta/corrCount: resolve add + apply load/store).

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

  it('declares array<atomic<u32>> on cellEntriesBuf via setAtomic(true) (P4-2)', () => {
    const buffers = buildNodes();
    const call = setAtomicCalls.find((c) => c.sba === buffers.cellEntriesSBA);
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
    // Symmetric to the setAtomic guards above. The resolve / apply passes read
    // cellEntriesBuf, corrCountBuf, and deltaBuf via atomicLoad — required
    // because they are array<atomic<*>> (post-setAtomic). Plain
    // `.element(i)` is a WGSL validation error.
    atomicLoadCalls.length = 0;
    buildNodes();
    expect(atomicLoadCalls.length).toBeGreaterThan(0);
  });
});

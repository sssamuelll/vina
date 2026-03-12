import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so MockSBA is available to both mocks.
const { MockSBA } = vi.hoisted(() => {
  const MockSBA = class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  };
  return { MockSBA };
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
  const createChainProxy = (): any => {
    const handler: ProxyHandler<Function> = {
      get(_target, _prop) {
        // Return another proxy for any property access
        return createChainProxy();
      },
      apply(_target, _thisArg, _args) {
        // Return another proxy for any function call
        return createChainProxy();
      },
    };
    return new Proxy(function () {}, handler);
  };

  const proxy = createChainProxy();
  return {
    StorageBufferAttribute: MockSBA,
    // Fn: returns a function that, when called (the () invocation), returns a proxy
    Fn: () => () => proxy,
    storage: () => proxy,
    uniform: () => proxy,
    instanceIndex: proxy,
    uint: () => proxy,
    int: () => proxy,
    float: () => proxy,
    vec3: () => proxy,
    If: () => proxy,
    Loop: () => proxy,
    atomicAdd: () => proxy,
    atomicLoad: () => proxy,
    atomicStore: () => proxy,
  };
});

import {
  createSelfCollisionBuffers,
  makeSelfCollisionComputeNodes,
  type SelfCollisionBufferSet,
  type SelfCollisionComputeNodes,
} from '../tslSelfCollision';

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

    const nodes: SelfCollisionComputeNodes = makeSelfCollisionComputeNodes(
      mockNode as any,
      mockNode as any,
      buffers,
      0.004,
    );

    expect(nodes).toBeDefined();
    expect(nodes.hashCountNode).toBeDefined();
    expect(nodes.prefixSumNode).toBeDefined();
    expect(nodes.scatterNode).toBeDefined();
    expect(nodes.resolveNode).toBeDefined();
    expect(nodes.applyNode).toBeDefined();
  });
});

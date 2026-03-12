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

  return {
    StorageBufferAttribute: MockSBA,
    // Fn: returns a function that, when called (the () invocation), returns a proxy
    Fn: () => () => proxy,
    storage: () => proxy,
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
    If: () => proxy,
    Loop: () => proxy,
    atomicAdd: () => proxy,
    atomicStore: () => proxy,
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

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const nodes: WindComputeNodes = makeWindComputeNode(
      mockNode as any,
      mockNode as any,
      mockNode as any,
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

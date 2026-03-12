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
  const mockNode = { toAttribute: () => mockNode, element: () => mockNode };
  return {
    StorageBufferAttribute: MockSBA,
    Fn: (fn: Function) => fn,
    storage: () => mockNode,
    uniform: () => mockNode,
    instanceIndex: { toVar: () => mockNode },
    uint: () => mockNode,
    int: () => mockNode,
    float: () => mockNode,
    If: () => ({ Else: () => ({}) }),
    Loop: () => ({}),
    atomicAdd: () => mockNode,
    atomicLoad: () => mockNode,
    atomicStore: () => mockNode,
  };
});

import {
  createSelfCollisionBuffers,
  type SelfCollisionBufferSet,
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

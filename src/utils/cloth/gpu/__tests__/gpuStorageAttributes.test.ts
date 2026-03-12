import { describe, it, expect, vi } from 'vitest';

const { MockSBA } = vi.hoisted(() => ({
  MockSBA: class MockSBA {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    array: any; count: number; itemSize: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(array: any, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
}));

// three/webgpu and three/tsl resolve to the same bundle; mock to avoid browser-only globals.
vi.mock('three/webgpu', () => ({ StorageBufferAttribute: MockSBA }));
vi.mock('three/tsl', () => ({ StorageBufferAttribute: MockSBA }));

import { createPositionStorageAttribute, createNormalStorageAttribute } from '../gpuStorageAttributes';

describe('gpuStorageAttributes', () => {
  it('returns null when buffer is null', () => {
    expect(createPositionStorageAttribute(null, 100)).toBeNull();
    expect(createNormalStorageAttribute(null, 100)).toBeNull();
  });

  it('returns null when particle count is 0', () => {
    expect(createPositionStorageAttribute(null, 0)).toBeNull();
    expect(createNormalStorageAttribute(null, 0)).toBeNull();
  });
});

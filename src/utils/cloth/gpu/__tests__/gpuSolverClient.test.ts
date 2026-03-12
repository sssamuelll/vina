import { describe, it, expect, vi } from 'vitest';

// three/webgpu and three/tsl resolve to the same bundle (three.webgpu.js).
// Must mock both with all exports to avoid Vitest deduplication issues.
const { sharedMock } = vi.hoisted(() => {
  const sharedMock = () => {
    const noop = () => ({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(function () {}, {
      get: () => proxy,
      apply: () => proxy,
    });
    return {
      StorageBufferAttribute: class MockSBA {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        array: any; count: number; itemSize: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(array: any, itemSize: number) {
          this.array = array;
          this.count = array.length / itemSize;
          this.itemSize = itemSize;
        }
      },
      storage: () => proxy,
      Fn: () => () => proxy,
      If: () => proxy,
      Loop: noop,
      compute: (_fn: unknown, count: number) => ({ __tslCompute: true, dispatchCount: count }),
      uniform: () => proxy,
      float: () => proxy,
      uint: () => proxy,
      int: () => proxy,
      vec3: () => proxy,
      instanceIndex: proxy,
      atomicStore: noop,
      atomicAdd: () => proxy,
    };
  };
  return { sharedMock };
});

vi.mock('three/webgpu', sharedMock);
vi.mock('three/tsl', sharedMock);

import { GpuSolverClient } from '../gpuSolverClient';

describe('GpuSolverClient', () => {
  it('exports GpuSolverClient class', () => {
    expect(GpuSolverClient).toBeDefined();
    expect(typeof GpuSolverClient).toBe('function');
  });

  it('has initMultiPieceTsl method', () => {
    expect(typeof GpuSolverClient.prototype.initMultiPieceTsl).toBe('function');
  });

  it('has getTslSolver accessor', () => {
    expect(typeof GpuSolverClient.prototype.getTslSolver).toBe('function');
  });

  it('has setTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.setTslCollisionBody).toBe('function');
  });

  it('has removeTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.removeTslCollisionBody).toBe('function');
  });

  it('has updateCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.updateCollisionBody).toBe('function');
  });
});

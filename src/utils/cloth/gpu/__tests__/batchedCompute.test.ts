import { describe, it, expect, vi } from 'vitest';
import { beginBatchedCompute } from '../batchedCompute';

function makeMockRenderer() {
  const submitFn = vi.fn();
  const finishFn = vi.fn(() => 'finished-buffer');
  const endFn = vi.fn();
  const beginComputePassFn = vi.fn(() => ({ end: endFn }));
  const createCommandEncoderFn = vi.fn(() => ({
    beginComputePass: beginComputePassFn,
    finish: finishFn,
  }));

  const dataMap = new Map<object, Record<string, unknown>>();

  const backend = {
    device: {
      createCommandEncoder: createCommandEncoderFn,
      queue: { submit: submitFn },
    },
    get(key: object) {
      if (!dataMap.has(key)) dataMap.set(key, {});
      return dataMap.get(key)!;
    },
    beginCompute: vi.fn(),
    finishCompute: vi.fn(),
  };

  return {
    backend,
    mocks: { submitFn, finishFn, endFn, beginComputePassFn, createCommandEncoderFn },
  };
}

describe('beginBatchedCompute', () => {
  it('creates exactly one command encoder for the batch', () => {
    const { backend, mocks } = makeMockRenderer();
    const renderer = { backend };

    const endBatch = beginBatchedCompute(renderer);

    // Simulate 3 compute calls
    const group1 = { id: 1 };
    const group2 = { id: 2 };
    const group3 = { id: 3 };

    backend.beginCompute(group1);
    backend.finishCompute(group1);
    backend.beginCompute(group2);
    backend.finishCompute(group2);
    backend.beginCompute(group3);
    backend.finishCompute(group3);

    // Only 1 encoder created (by beginBatchedCompute), not 3
    expect(mocks.createCommandEncoderFn).toHaveBeenCalledTimes(1);
    // 3 compute passes created (one per beginCompute)
    expect(mocks.beginComputePassFn).toHaveBeenCalledTimes(3);
    // 3 passes ended
    expect(mocks.endFn).toHaveBeenCalledTimes(3);
    // No submit yet
    expect(mocks.submitFn).not.toHaveBeenCalled();

    endBatch();

    // Now submitted once
    expect(mocks.submitFn).toHaveBeenCalledTimes(1);
    expect(mocks.submitFn).toHaveBeenCalledWith(['finished-buffer']);
  });

  it('restores original methods after endBatch', () => {
    const { backend } = makeMockRenderer();
    const renderer = { backend };

    const origBegin = backend.beginCompute;
    const origFinish = backend.finishCompute;

    const endBatch = beginBatchedCompute(renderer);

    // Methods are overridden
    expect(backend.beginCompute).not.toBe(origBegin);
    expect(backend.finishCompute).not.toBe(origFinish);

    endBatch();

    // Methods are restored
    expect(backend.beginCompute).toBe(origBegin);
    expect(backend.finishCompute).toBe(origFinish);
  });

  it('sets cmdEncoderGPU and passEncoderGPU on group data', () => {
    const { backend } = makeMockRenderer();
    const renderer = { backend };

    beginBatchedCompute(renderer);

    const group = { id: 42 };
    backend.beginCompute(group);

    const groupData = backend.get(group);
    expect(groupData.cmdEncoderGPU).toBeDefined();
    expect(groupData.passEncoderGPU).toBeDefined();
  });
});

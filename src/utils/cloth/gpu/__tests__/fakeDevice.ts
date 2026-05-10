/**
 * Fake WebGPU device + buffer + renderer for `GpuSolverClient` unit tests.
 *
 * Covers only the surface the client actually calls — extending these with
 * new methods is fine, but every addition should match a real call site so
 * tests fail loudly if the contract drifts.
 *
 * Sketch ratified in #762.
 */
import { vi } from 'vitest';

export class FakeGPUBuffer {
  destroy = vi.fn();
  mapAsync = vi.fn().mockResolvedValue(undefined);
  getMappedRange = vi.fn().mockReturnValue(new ArrayBuffer(64));
  unmap = vi.fn();
}

/**
 * Minimal `GPUDevice` stand-in. Each method is a `vi.fn()` so individual tests
 * can override (e.g. `device.pushErrorScope = vi.fn(() => { throw ... })`)
 * without rebuilding the rest of the surface.
 *
 * `addEventListener` is required by `attachUncapturedErrorListener`, called
 * from the `GpuSolverClient` constructor. `createShaderModule` returns a
 * module with `getCompilationInfo` because `instrumentShaderCapture`
 * (DEV-gated) calls it on every module created during init.
 */
export class FakeGPUDevice {
  createBuffer = vi.fn(() => new FakeGPUBuffer());
  createBindGroup = vi.fn(() => ({}));
  createBindGroupLayout = vi.fn(() => ({}));
  createComputePipeline = vi.fn(() => ({ getBindGroupLayout: () => ({}) }));
  createPipelineLayout = vi.fn(() => ({}));
  createCommandEncoder = vi.fn(() => ({
    beginComputePass: vi.fn(() => ({
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    })),
    finish: vi.fn(),
  }));
  createShaderModule = vi.fn(() => ({
    getCompilationInfo: vi.fn().mockResolvedValue({ messages: [] }),
  }));
  queue = { submit: vi.fn(), writeBuffer: vi.fn() };
  pushErrorScope = vi.fn();
  popErrorScope = vi.fn().mockResolvedValue(null);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

/**
 * Minimal `WebGPURenderer` stand-in. `_attributes.delete` is the canonical
 * SBA-disposal route per `disposeStorageBufferAttribute` in `tslBuffers.ts`;
 * `getArrayBufferAsync` lets tests drive `readbackPositionsToGeometry` so
 * the renderer ref is captured for subsequent dispose-chain assertions.
 */
export class FakeRenderer {
  _attributes = { delete: vi.fn() };
  getArrayBufferAsync = vi.fn(() => Promise.resolve(new ArrayBuffer(64)));
}

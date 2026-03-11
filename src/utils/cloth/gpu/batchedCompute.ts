/**
 * Batched GPU compute — reduces ~N separate queue.submit() calls to 1.
 *
 * Monkey-patches the Three.js WebGPU backend's beginCompute/finishCompute
 * to share a single GPUCommandEncoder across all renderer.compute() calls.
 * Each dispatch still gets its own compute pass, so WebGPU's implicit
 * inter-pass synchronization (memory barriers) is preserved.
 *
 * Usage:
 *   const endBatch = beginBatchedCompute(renderer);
 *   renderer.compute(nodeA);
 *   renderer.compute(nodeB);
 *   // ...
 *   endBatch(); // single queue.submit()
 *
 * @module batchedCompute
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function beginBatchedCompute(renderer: any): () => void {
  const backend = renderer.backend;
  const device = backend.device;

  const sharedEncoder = device.createCommandEncoder({ label: 'clothSim_batched' });

  const origBegin = backend.beginCompute;
  const origFinish = backend.finishCompute;

  backend.beginCompute = function (computeGroup: { id: number | string }) {
    const groupGPU = this.get(computeGroup);
    groupGPU.cmdEncoderGPU = sharedEncoder;
    groupGPU.passEncoderGPU = sharedEncoder.beginComputePass({
      label: 'computeGroup_' + computeGroup.id,
    });
  };

  backend.finishCompute = function (computeGroup: { id: number | string }) {
    this.get(computeGroup).passEncoderGPU.end();
  };

  return function endBatch() {
    backend.beginCompute = origBegin;
    backend.finishCompute = origFinish;
    device.queue.submit([sharedEncoder.finish()]);
  };
}

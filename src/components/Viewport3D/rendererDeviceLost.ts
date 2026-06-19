/**
 * Module-level registry of renderer WebGPU devices that have been lost (#901).
 *
 * The cloth-sim React tree resets per-mount state on every Stop→Start
 * (`useClothSim = simulationState !== 'idle'` unmounts GarmentSimulation), but
 * the `<Canvas>`/WebGPURenderer is the outer wrapper and is NOT unmounted, so
 * its WebGPU device stays dead after a loss (a lost device cannot be revived
 * in-place). A per-mount ref therefore cannot remember the loss across a
 * restart.
 *
 * This registry outlives those remounts and is keyed by the GPUDevice object
 * itself (stable for the renderer's life via a WeakSet — entries are reclaimed
 * when the device is GC'd along with its renderer). GarmentSimulation marks the
 * renderer device here when its `device.lost` resolves, and checks it on mount
 * so a restart over an already-dead device downgrades to WASM/CPU immediately
 * instead of re-entering the GPU tier and re-freezing during init.
 */

const lostRendererDevices = new WeakSet<GPUDevice>();

/** Record that this renderer device was lost (terminal — never un-marked). */
export function markRendererDeviceLost(device: GPUDevice): void {
  lostRendererDevices.add(device);
}

/** Whether this renderer device was previously marked lost. */
export function isRendererDeviceLost(device: GPUDevice): boolean {
  return lostRendererDevices.has(device);
}

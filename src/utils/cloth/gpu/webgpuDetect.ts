/**
 * WebGPU capability detection and device initialization.
 *
 * Detects WebGPU support, requests adapter/device, and reports capabilities.
 * Used to decide between WebGPU solver, Wasm fallback, or CPU fallback.
 *
 * @module webgpuDetect
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SolverBackend = 'webgpu' | 'cpu';

export interface GpuCapabilities {
  backend: SolverBackend;
  maxStorageBufferSize: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxStorageBuffersPerShaderStage: number;
  timestampQuery: boolean;
  /** Estimated max cloth particles this GPU can handle */
  estimatedMaxParticles: number;
}

export interface GpuContext {
  device: GPUDevice;
  capabilities: GpuCapabilities;
}

// ─── Detection ──────────────────────────────────────────────────────────────

/**
 * Check if WebGPU is available in this browser.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Whether the WebGPU **rendering** backend is active.
 *
 * Returns `true` when the browser supports WebGPU AND the user has not
 * explicitly opted out via `localStorage.setItem('webclo-use-webgpu', 'false')`.
 * Used to disable features incompatible with WebGPU (e.g. shadow mapping with
 * legacy MeshDepthMaterial).
 */
export const isWebGPURendererActive: boolean = isWebGPUAvailable() && (() => {
  try { return localStorage.getItem('webclo-use-webgpu') !== 'false'; }
  catch { return true; }
})();

/**
 * Request WebGPU adapter and device. Returns null if unavailable.
 */
export async function initWebGPU(): Promise<GpuContext | null> {
  if (!isWebGPUAvailable()) {
    console.warn('[WebGPU] Not available in this browser');
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      console.warn('[WebGPU] No adapter found');
      return null;
    }

    const hasTimestamp = adapter.features.has('timestamp-query');
    const requiredFeatures: GPUFeatureName[] = [];
    if (hasTimestamp) {
      requiredFeatures.push('timestamp-query');
    }

    const device = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
      },
    });

    device.lost.then((info) => {
      console.error('[WebGPU] Device lost:', info.message);
    });

    // Estimate max particles: each particle needs ~80 bytes across all buffers
    // (pos×3 + prevPos×3 + vel×3 + invMass×1) × 4 bytes = 40 bytes minimum
    // Plus constraints, normals, etc. ≈ 80 bytes per particle
    const bytesPerParticle = 80;
    const estimatedMaxParticles = Math.floor(
      device.limits.maxStorageBufferBindingSize / bytesPerParticle
    );

    const capabilities: GpuCapabilities = {
      backend: 'webgpu',
      maxStorageBufferSize: device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      maxStorageBuffersPerShaderStage: device.limits.maxStorageBuffersPerShaderStage,
      timestampQuery: hasTimestamp,
      estimatedMaxParticles,
    };

    console.log('[WebGPU] Initialized:', {
      maxStorage: `${(capabilities.maxStorageBufferSize / 1024 / 1024).toFixed(0)}MB`,
      maxWorkgroup: capabilities.maxComputeWorkgroupSizeX,
      maxParticles: `~${(estimatedMaxParticles / 1000).toFixed(0)}K`,
      timestampQuery: hasTimestamp,
    });

    return { device, capabilities };
  } catch (err) {
    console.error('[WebGPU] Init failed:', err);
    return null;
  }
}

/**
 * Get CPU fallback capabilities.
 */
export function getCpuFallback(): GpuCapabilities {
  return {
    backend: 'cpu',
    maxStorageBufferSize: 0,
    maxComputeWorkgroupSizeX: 0,
    maxComputeInvocationsPerWorkgroup: 0,
    maxStorageBuffersPerShaderStage: 0,
    timestampQuery: false,
    estimatedMaxParticles: 10000, // CPU practical limit
  };
}

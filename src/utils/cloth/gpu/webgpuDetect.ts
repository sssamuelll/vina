/**
 * WebGPU capability detection and device initialization.
 *
 * Detects WebGPU support, requests adapter/device, and reports capabilities.
 * Used to decide between WebGPU solver, Wasm fallback, or CPU fallback.
 *
 * @module webgpuDetect
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from '../../safeStorage';

// ─── Storage keys ───────────────────────────────────────────────────────────

/**
 * localStorage key for the WebGPU feature flag.
 *
 * Project convention is to prefix all keys with `vina-` (see
 * `vina-workflow`, `vina-layout`, `vina-saved-poses`, etc.).
 * The legacy `webclo-use-webgpu` key was the lone outlier; BUG-11 (#614)
 * migrates it to this canonical prefix.
 */
export const WEBGPU_FEATURE_FLAG_KEY = 'vina-use-webgpu';

const LEGACY_WEBGPU_FEATURE_FLAG_KEY = 'webclo-use-webgpu';

/**
 * One-time migration of the WebGPU feature flag from the legacy
 * `webclo-use-webgpu` key to the canonical `vina-use-webgpu`.
 *
 * Idempotent: safe to call any number of times. After the first call,
 * the legacy key is gone and subsequent calls are no-ops.
 *
 * If the canonical key is already set (e.g. because the user opened a
 * newer build first and then went back to an older build that wrote the
 * legacy key), the canonical value wins and the legacy key is just
 * removed without clobbering the canonical.
 *
 * BUG-11 (#614).
 */
export function migrateLegacyWebGpuFlag(): void {
  const legacy = safeGetItem(LEGACY_WEBGPU_FEATURE_FLAG_KEY);
  if (legacy === null) return;
  if (safeGetItem(WEBGPU_FEATURE_FLAG_KEY) === null) {
    safeSetItem(WEBGPU_FEATURE_FLAG_KEY, legacy);
  }
  safeRemoveItem(LEGACY_WEBGPU_FEATURE_FLAG_KEY);
}

// Run migration once at module load. Must happen before the IIFE below
// reads the canonical key.
migrateLegacyWebGpuFlag();

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

/** El `navigator.gpu` al que se le preguntó por un adaptador, y su respuesta. */
let preguntado: { gpu: GPU; hay: Promise<boolean> } | null = null;

/**
 * Si `navigator.gpu` da un adaptador, como el que pide la cascada al pulsar
 * «Simular». `navigator.gpu` puede existir sin darlo (GPU vetada por el
 * navegador, o un Chromium sin GPU como el de los e2e), y entonces la cascada
 * cae a WASM. Se pregunta una vez por sesión: la respuesta se guarda con el
 * `navigator.gpu` que la dio, que es siempre el mismo objeto. Nunca rechaza:
 * sin `navigator.gpu`, o si la pregunta falla, es false.
 */
export function hayAdaptadorWebGPU(): Promise<boolean> {
  const gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
  if (!gpu) return Promise.resolve(false);
  if (preguntado?.gpu !== gpu) {
    const hay = (async () => {
      try {
        return Boolean(await gpu.requestAdapter());
      } catch {
        return false;
      }
    })();
    preguntado = { gpu, hay };
  }
  return preguntado.hay;
}

/**
 * Whether the WebGPU **rendering** backend is active.
 *
 * Returns `true` when the browser supports WebGPU AND the user has not
 * explicitly opted out via `localStorage.setItem('vina-use-webgpu', 'false')`.
 * Used to disable features incompatible with WebGPU (e.g. shadow mapping with
 * legacy MeshDepthMaterial).
 */
export const isWebGPURendererActive: boolean = isWebGPUAvailable() && (() => {
  return safeGetItem(WEBGPU_FEATURE_FLAG_KEY) !== 'false';
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

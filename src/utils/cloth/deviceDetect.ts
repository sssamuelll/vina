/**
 * Device detection for simulation quality defaults.
 *
 * Detects mobile, GPU tier, and memory constraints to select
 * appropriate simulation quality automatically.
 *
 * @module deviceDetect
 */

import type { QualityLevel } from './gpu/qualityPresets';

export interface DeviceProfile {
  isMobile: boolean;
  hasWebGPU: boolean;
  estimatedMemoryGB: number;
  hardwareConcurrency: number;
  recommendedQuality: QualityLevel;
  maxParticles: number;
}

/**
 * Detect device capabilities and recommend simulation settings.
 */
export function detectDevice(): DeviceProfile {
  const isMobile = typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const hasWebGPU = typeof navigator !== 'undefined' &&
    'gpu' in navigator;

  const hardwareConcurrency = typeof navigator !== 'undefined'
    ? navigator.hardwareConcurrency ?? 4
    : 4;

  // Estimate device memory (Chrome-only API)
  const estimatedMemoryGB = typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator
    ? (navigator as { deviceMemory?: number }).deviceMemory ?? 4
    : 4;

  let recommendedQuality: QualityLevel;
  let maxParticles: number;

  if (isMobile) {
    recommendedQuality = 'preview';
    maxParticles = 5000;
  } else if (estimatedMemoryGB <= 4 || hardwareConcurrency <= 4) {
    recommendedQuality = 'preview';
    maxParticles = 20000;
  } else if (hasWebGPU && estimatedMemoryGB >= 8) {
    recommendedQuality = 'production';
    maxParticles = 200000;
  } else {
    recommendedQuality = 'standard';
    maxParticles = 50000;
  }

  return {
    isMobile,
    hasWebGPU,
    estimatedMemoryGB,
    hardwareConcurrency,
    recommendedQuality,
    maxParticles,
  };
}

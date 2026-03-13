/**
 * Simulation modes and adaptive quality system for GPU cloth simulation.
 *
 * Two simulation modes: normal (interactive) and complete (full quality).
 * Auto-detect measures first N frames and selects the best sustainable mode.
 *
 * @module qualityPresets
 */

import type { GpuSolverConfig } from './gpuSolver';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SimulationMode = 'normal' | 'complete';

export interface QualityPreset {
  label: string;
  /** Particle distance in mm (lower = denser mesh) */
  particleDistance: number;
  /** XPBD substeps per frame */
  substeps: number;
  /** Enable self-collision detection */
  selfCollision: boolean;
  /** Body collision mesh resolution (triangle count target) */
  collisionResolution: number;
  /** Enable bending constraints */
  bendingEnabled: boolean;
  /** Target FPS */
  targetFPS: number;
}

export const SIMULATION_MODES: Record<SimulationMode, QualityPreset> = {
  normal: {
    label: 'Normal',
    particleDistance: 5,
    substeps: 5,
    selfCollision: false,
    collisionResolution: 32,
    bendingEnabled: true,
    targetFPS: 60,
  },
  complete: {
    label: 'Complete',
    particleDistance: 3,
    substeps: 20,
    selfCollision: true,
    collisionResolution: 128,
    bendingEnabled: true,
    targetFPS: 30,
  },
};

/** @deprecated Use SimulationMode */
export type QualityLevel = SimulationMode;
/** @deprecated Use SIMULATION_MODES */
export const QUALITY_PRESETS: Record<SimulationMode, QualityPreset> = SIMULATION_MODES;

// ─── Solver config from preset ──────────────────────────────────────────────

/**
 * Convert a quality preset to GpuSolverConfig overrides.
 */
export function presetToSolverConfig(preset: QualityPreset): Partial<GpuSolverConfig> {
  return {
    substeps: preset.substeps,
    selfCollision: preset.selfCollision,
    // bendCompliance: 0 means no bending if disabled isn't a separate flag,
    // but we use a high compliance to effectively disable
    bendCompliance: preset.bendingEnabled ? 0.01 : 1000,
  };
}

// ─── Benchmark ──────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  level: SimulationMode;
  particles: number;
  avgFrameTimeMs: number;
  fps: number;
  minFps: number;
  maxFps: number;
  gpuMemoryEstimateMB: number;
  timeToFirstDrapeMs: number;
  passTimings?: Record<string, number>; // per-pass GPU timings if available
}

/**
 * Frame time tracker for benchmarking and auto-quality.
 * Collects frame times over a window and computes statistics.
 */
export class FrameTimeTracker {
  private frameTimes: number[] = [];
  private readonly windowSize: number;
  private firstFrameTime: number = 0;
  private drapeDetectedTime: number = 0;

  constructor(windowSize: number = 60) {
    this.windowSize = windowSize;
  }

  /**
   * Record a frame time.
   * @param frameTimeMs Time for this frame in milliseconds
   */
  record(frameTimeMs: number): void {
    if (this.frameTimes.length === 0) {
      this.firstFrameTime = performance.now();
    }
    this.frameTimes.push(frameTimeMs);
    if (this.frameTimes.length > this.windowSize * 2) {
      // Keep only recent window
      this.frameTimes = this.frameTimes.slice(-this.windowSize);
    }
  }

  /** Mark when drape is visually stable (velocity below threshold). */
  markDrapeComplete(): void {
    if (this.drapeDetectedTime === 0) {
      this.drapeDetectedTime = performance.now();
    }
  }

  /** Get stats over the last `windowSize` frames. */
  getStats(): { avgMs: number; fps: number; minFps: number; maxFps: number; frameCount: number } {
    const recent = this.frameTimes.slice(-this.windowSize);
    if (recent.length === 0) {
      return { avgMs: 0, fps: 0, minFps: 0, maxFps: 0, frameCount: 0 };
    }

    const sum = recent.reduce((a, b) => a + b, 0);
    const avgMs = sum / recent.length;
    const fps = avgMs > 0 ? 1000 / avgMs : 0;
    const maxFrameTime = Math.max(...recent);
    const minFrameTime = Math.min(...recent);

    return {
      avgMs,
      fps,
      minFps: minFrameTime > 0 ? 1000 / maxFrameTime : 0,
      maxFps: minFrameTime > 0 ? 1000 / minFrameTime : 0,
      frameCount: this.frameTimes.length,
    };
  }

  /** Time to first drape in ms (0 if not yet detected). */
  get timeToFirstDrapeMs(): number {
    if (this.drapeDetectedTime === 0 || this.firstFrameTime === 0) return 0;
    return this.drapeDetectedTime - this.firstFrameTime;
  }

  /** Has enough frames been collected for a quality decision? */
  get isReady(): boolean {
    return this.frameTimes.length >= 10;
  }

  reset(): void {
    this.frameTimes = [];
    this.firstFrameTime = 0;
    this.drapeDetectedTime = 0;
  }
}

// ─── Auto-detect ────────────────────────────────────────────────────────────

/**
 * Select the best simulation mode that sustains the target FPS.
 * Measures actual performance and downgrades if needed.
 *
 * @param currentFps Current measured FPS
 * @param currentLevel Current simulation mode
 * @returns Recommended simulation mode
 */
export function autoSelectQuality(currentFps: number, currentLevel: SimulationMode): SimulationMode {
  const target = SIMULATION_MODES[currentLevel].targetFPS;

  // If running complete mode and well below target, downgrade to normal
  if (currentLevel === 'complete' && currentFps < target * 0.7) return 'normal';

  // If running normal mode and well above target, upgrade to complete
  if (currentLevel === 'normal' && currentFps > target * 1.5) return 'complete';

  return currentLevel;
}

/**
 * Estimate GPU memory usage for a given particle count and quality level.
 */
export function estimateGPUMemoryMB(numParticles: number, preset: QualityPreset): number {
  // Per-particle buffers: pos(3f) + prevPos(3f) + vel(3f) + invMass(1f) + normals(3f) = 13 floats = 52 bytes
  const particleBytes = numParticles * 52;

  // Constraints: ~3× edges per particle, each edge = 2 ids + 1 float = 12 bytes
  const stretchBytes = numParticles * 3 * 12;

  // Bend constraints: ~edges/2, each = 4 ids + 1 float = 20 bytes
  const bendBytes = preset.bendingEnabled ? numParticles * 1.5 * 20 : 0;

  // Self-collision hash table: 2N × 4 bytes (cellCount + cellStart + entries)
  const scBytes = preset.selfCollision ? numParticles * 2 * 12 : 0;

  // Collision mesh: estimate based on resolution target
  const collisionBytes = preset.collisionResolution * 9 * 4; // triangles × 9 floats × 4 bytes

  // Adjacency: ~6 neighbors per particle average = offsets(N×4) + neighbors(6N×4)
  const adjBytes = preset.selfCollision ? numParticles * 28 : 0;

  const total = particleBytes + stretchBytes + bendBytes + scBytes + collisionBytes + adjBytes;
  return total / (1024 * 1024);
}

/**
 * Build a full benchmark result.
 */
export function buildBenchmarkResult(
  level: SimulationMode,
  particles: number,
  tracker: FrameTimeTracker,
): BenchmarkResult {
  const stats = tracker.getStats();
  const preset = SIMULATION_MODES[level];
  return {
    level,
    particles,
    avgFrameTimeMs: stats.avgMs,
    fps: stats.fps,
    minFps: stats.minFps,
    maxFps: stats.maxFps,
    gpuMemoryEstimateMB: estimateGPUMemoryMB(particles, preset),
    timeToFirstDrapeMs: tracker.timeToFirstDrapeMs,
  };
}

/**
 * Log benchmark results to console in a readable table format.
 */
export function logBenchmark(result: BenchmarkResult): void {
  console.log(`[Benchmark] Quality: ${result.level.toUpperCase()}`);
  console.log(`  Particles:     ${result.particles.toLocaleString()}`);
  console.log(`  Avg frame:     ${result.avgFrameTimeMs.toFixed(2)} ms`);
  console.log(`  FPS:           ${result.fps.toFixed(1)} (min ${result.minFps.toFixed(1)}, max ${result.maxFps.toFixed(1)})`);
  console.log(`  GPU memory:    ~${result.gpuMemoryEstimateMB.toFixed(1)} MB`);
  console.log(`  First drape:   ${result.timeToFirstDrapeMs > 0 ? result.timeToFirstDrapeMs.toFixed(0) + ' ms' : 'N/A'}`);
}

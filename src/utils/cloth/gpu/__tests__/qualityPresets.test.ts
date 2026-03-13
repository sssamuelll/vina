import { describe, it, expect } from 'vitest';
import {
  SIMULATION_MODES,
  presetToSolverConfig,
  FrameTimeTracker,
  autoSelectQuality,
  estimateGPUMemoryMB,
  buildBenchmarkResult,
} from '../qualityPresets';

describe('SIMULATION_MODES', () => {
  it('has two modes', () => {
    expect(Object.keys(SIMULATION_MODES)).toEqual(['normal', 'complete']);
  });

  it('normal is faster (fewer substeps, no self-collision)', () => {
    const n = SIMULATION_MODES.normal;
    expect(n.substeps).toBeLessThan(SIMULATION_MODES.complete.substeps);
    expect(n.selfCollision).toBe(false);
    expect(n.bendingEnabled).toBe(true);
  });

  it('complete has highest quality', () => {
    const c = SIMULATION_MODES.complete;
    expect(c.substeps).toBeGreaterThanOrEqual(20);
    expect(c.selfCollision).toBe(true);
    expect(c.collisionResolution).toBe(128);
  });

  it('particle distance decreases from normal to complete', () => {
    expect(SIMULATION_MODES.normal.particleDistance).toBeGreaterThan(SIMULATION_MODES.complete.particleDistance);
  });
});

describe('presetToSolverConfig', () => {
  it('maps normal to moderate substeps', () => {
    const cfg = presetToSolverConfig(SIMULATION_MODES.normal);
    expect(cfg.substeps).toBe(5);
    expect(cfg.selfCollision).toBe(false);
  });

  it('enables bending for normal', () => {
    const cfg = presetToSolverConfig(SIMULATION_MODES.normal);
    expect(cfg.bendCompliance).toBeLessThan(1);
  });

  it('enables bending for complete', () => {
    const cfg = presetToSolverConfig(SIMULATION_MODES.complete);
    expect(cfg.bendCompliance).toBeLessThan(1);
  });
});

describe('FrameTimeTracker', () => {
  it('records frame times and computes stats', () => {
    const tracker = new FrameTimeTracker(10);
    for (let i = 0; i < 10; i++) {
      tracker.record(16.67);
    }
    const stats = tracker.getStats();
    expect(stats.avgMs).toBeCloseTo(16.67, 1);
    expect(stats.fps).toBeCloseTo(60, 0);
    expect(stats.frameCount).toBe(10);
  });

  it('isReady after 10 frames', () => {
    const tracker = new FrameTimeTracker(30);
    expect(tracker.isReady).toBe(false);
    for (let i = 0; i < 10; i++) tracker.record(16);
    expect(tracker.isReady).toBe(true);
  });

  it('returns zero stats when empty', () => {
    const tracker = new FrameTimeTracker();
    const stats = tracker.getStats();
    expect(stats.avgMs).toBe(0);
    expect(stats.fps).toBe(0);
  });

  it('reset clears state', () => {
    const tracker = new FrameTimeTracker();
    tracker.record(16);
    tracker.reset();
    expect(tracker.isReady).toBe(false);
    expect(tracker.getStats().frameCount).toBe(0);
  });
});

describe('autoSelectQuality', () => {
  it('downgrades complete when FPS is too low', () => {
    expect(autoSelectQuality(15, 'complete')).toBe('normal');
  });

  it('upgrades normal when FPS is well above target', () => {
    expect(autoSelectQuality(100, 'normal')).toBe('complete');
  });

  it('stays at current level when FPS is acceptable', () => {
    expect(autoSelectQuality(55, 'normal')).toBe('normal');
  });

  it('cannot downgrade below normal', () => {
    expect(autoSelectQuality(10, 'normal')).toBe('normal');
  });

  it('cannot upgrade above complete', () => {
    expect(autoSelectQuality(200, 'complete')).toBe('complete');
  });
});

describe('estimateGPUMemoryMB', () => {
  it('returns positive number', () => {
    const mb = estimateGPUMemoryMB(10000, SIMULATION_MODES.normal);
    expect(mb).toBeGreaterThan(0);
  });

  it('normal uses less memory than complete', () => {
    const norm = estimateGPUMemoryMB(10000, SIMULATION_MODES.normal);
    const comp = estimateGPUMemoryMB(10000, SIMULATION_MODES.complete);
    expect(norm).toBeLessThan(comp);
  });

  it('more particles = more memory', () => {
    const small = estimateGPUMemoryMB(1000, SIMULATION_MODES.normal);
    const large = estimateGPUMemoryMB(100000, SIMULATION_MODES.normal);
    expect(large).toBeGreaterThan(small);
  });
});

describe('buildBenchmarkResult', () => {
  it('builds result from tracker', () => {
    const tracker = new FrameTimeTracker(10);
    for (let i = 0; i < 10; i++) tracker.record(16.67);
    const result = buildBenchmarkResult('normal', 5000, tracker);
    expect(result.level).toBe('normal');
    expect(result.particles).toBe(5000);
    expect(result.fps).toBeCloseTo(60, 0);
    expect(result.gpuMemoryEstimateMB).toBeGreaterThan(0);
  });
});

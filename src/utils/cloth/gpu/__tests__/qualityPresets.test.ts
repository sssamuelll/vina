import { describe, it, expect } from 'vitest';
import {
  QUALITY_PRESETS,
  presetToSolverConfig,
  FrameTimeTracker,
  autoSelectQuality,
  estimateGPUMemoryMB,
  buildBenchmarkResult,
} from '../qualityPresets';

describe('QUALITY_PRESETS', () => {
  it('has three levels', () => {
    expect(Object.keys(QUALITY_PRESETS)).toEqual(['preview', 'standard', 'production']);
  });

  it('preview is fastest (fewest substeps, no self-collision)', () => {
    const p = QUALITY_PRESETS.preview;
    expect(p.substeps).toBeLessThan(QUALITY_PRESETS.standard.substeps);
    expect(p.selfCollision).toBe(false);
    expect(p.bendingEnabled).toBe(false);
  });

  it('production has highest quality', () => {
    const p = QUALITY_PRESETS.production;
    expect(p.substeps).toBeGreaterThanOrEqual(30);
    expect(p.selfCollision).toBe(true);
    expect(p.sdfResolution).toBe(128);
  });

  it('particle distance decreases with quality', () => {
    expect(QUALITY_PRESETS.preview.particleDistance).toBeGreaterThan(QUALITY_PRESETS.standard.particleDistance);
    expect(QUALITY_PRESETS.standard.particleDistance).toBeGreaterThan(QUALITY_PRESETS.production.particleDistance);
  });
});

describe('presetToSolverConfig', () => {
  it('maps preview to low substeps, no self-collision', () => {
    const cfg = presetToSolverConfig(QUALITY_PRESETS.preview);
    expect(cfg.substeps).toBe(5);
    expect(cfg.selfCollision).toBe(false);
  });

  it('disables bending via high compliance for preview', () => {
    const cfg = presetToSolverConfig(QUALITY_PRESETS.preview);
    expect(cfg.bendCompliance).toBeGreaterThan(100);
  });

  it('enables bending for standard', () => {
    const cfg = presetToSolverConfig(QUALITY_PRESETS.standard);
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
  it('downgrades when FPS is too low', () => {
    expect(autoSelectQuality(30, 'standard')).toBe('preview');
  });

  it('upgrades when FPS is well above target', () => {
    expect(autoSelectQuality(100, 'standard')).toBe('production');
  });

  it('stays at current level when FPS is acceptable', () => {
    expect(autoSelectQuality(55, 'standard')).toBe('standard');
  });

  it('cannot downgrade below preview', () => {
    expect(autoSelectQuality(10, 'preview')).toBe('preview');
  });

  it('cannot upgrade above production', () => {
    expect(autoSelectQuality(200, 'production')).toBe('production');
  });
});

describe('estimateGPUMemoryMB', () => {
  it('returns positive number', () => {
    const mb = estimateGPUMemoryMB(10000, QUALITY_PRESETS.standard);
    expect(mb).toBeGreaterThan(0);
  });

  it('preview uses less memory than production', () => {
    const prev = estimateGPUMemoryMB(10000, QUALITY_PRESETS.preview);
    const prod = estimateGPUMemoryMB(10000, QUALITY_PRESETS.production);
    expect(prev).toBeLessThan(prod);
  });

  it('more particles = more memory', () => {
    const small = estimateGPUMemoryMB(1000, QUALITY_PRESETS.standard);
    const large = estimateGPUMemoryMB(100000, QUALITY_PRESETS.standard);
    expect(large).toBeGreaterThan(small);
  });
});

describe('buildBenchmarkResult', () => {
  it('builds result from tracker', () => {
    const tracker = new FrameTimeTracker(10);
    for (let i = 0; i < 10; i++) tracker.record(16.67);
    const result = buildBenchmarkResult('standard', 5000, tracker);
    expect(result.level).toBe('standard');
    expect(result.particles).toBe(5000);
    expect(result.fps).toBeCloseTo(60, 0);
    expect(result.gpuMemoryEstimateMB).toBeGreaterThan(0);
  });
});

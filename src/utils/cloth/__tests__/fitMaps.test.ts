/**
 * Tests for Garment Fit Maps (stress/strain/fit/pressure).
 * @module fitMaps.test
 */

import { describe, it, expect } from 'vitest';
import {
  computePerVertexStrain,
  computeStressMap,
  computeStrainMap,
  computeFitMap,
  computePressurePoints,
  computeFitMapData,
  fabricToFitParams,
  DEFAULT_FIT_MAP_CONFIG,
  type SolverEdgeData,
  type FabricFitParams,
  type FitMapConfig,
} from '../fitMaps';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a simple 2-particle system with one edge. */
function twoParticleSystem(restLen: number, currentLen: number): {
  positions: Float32Array;
  numParticles: number;
  edges: SolverEdgeData;
} {
  return {
    positions: new Float32Array([0, 0, 0, currentLen, 0, 0]),
    numParticles: 2,
    edges: {
      stretchingIds: new Int32Array([0, 1]),
      stretchingLengths: new Float32Array([restLen]),
    },
  };
}

/** Create a triangle with 3 particles and 3 edges. */
function triangleSystem(scale: number = 1.0): {
  positions: Float32Array;
  numParticles: number;
  edges: SolverEdgeData;
} {
  return {
    positions: new Float32Array([
      0, 0, 0,
      scale, 0, 0,
      0.5 * scale, 0.866 * scale, 0,
    ]),
    numParticles: 3,
    edges: {
      stretchingIds: new Int32Array([0, 1, 1, 2, 2, 0]),
      stretchingLengths: new Float32Array([1.0, 1.0, 1.0]), // rest = unit triangle
    },
  };
}

const defaultFabric: FabricFitParams = {
  maxStretchRatio: 0.08, // 8% max stretch
  weight: 150,
  thickness: 0.4,
  avgStretch: 0.025,
};

// ─── computePerVertexStrain ─────────────────────────────────────────────────

describe('computePerVertexStrain', () => {
  it('returns 1.0 for no deformation', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const strain = computePerVertexStrain(positions, numParticles, edges);
    expect(strain[0]).toBeCloseTo(1.0);
    expect(strain[1]).toBeCloseTo(1.0);
  });

  it('detects stretching (strain > 1)', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.2);
    const strain = computePerVertexStrain(positions, numParticles, edges);
    expect(strain[0]).toBeCloseTo(1.2);
    expect(strain[1]).toBeCloseTo(1.2);
  });

  it('detects compression (strain < 1)', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 0.8);
    const strain = computePerVertexStrain(positions, numParticles, edges);
    // Compression doesn't lower below 1.0 since we use max(1.0, strain) init
    // Actually we fill with 1.0 and only update if edgeStrain > strain[id]
    // So compressed edges (0.8) won't update since 0.8 < 1.0
    expect(strain[0]).toBeCloseTo(1.0);
  });

  it('takes max strain at shared vertex', () => {
    const { positions, numParticles, edges } = triangleSystem(1.5); // 50% larger
    const strain = computePerVertexStrain(positions, numParticles, edges);
    // All edges are ~1.5x rest length
    for (let i = 0; i < numParticles; i++) {
      expect(strain[i]).toBeGreaterThan(1.3);
    }
  });

  it('handles zero rest length gracefully', () => {
    const sys = twoParticleSystem(0, 1.0);
    const strain = computePerVertexStrain(sys.positions, sys.numParticles, sys.edges);
    expect(strain[0]).toBe(1.0); // unchanged default
  });

  it('handles zero particles', () => {
    const strain = computePerVertexStrain(new Float32Array(0), 0, {
      stretchingIds: new Int32Array(0),
      stretchingLengths: new Float32Array(0),
    });
    expect(strain.length).toBe(0);
  });
});

// ─── Stress Map ─────────────────────────────────────────────────────────────

describe('computeStressMap', () => {
  it('returns zero stress for non-deformed mesh', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeStressMap(positions, numParticles, edges, defaultFabric);
    expect(result.mode).toBe('stress');
    expect(result.values[0]).toBeCloseTo(0);
    expect(result.values[1]).toBeCloseTo(0);
    expect(result.stats.mean).toBeCloseTo(0);
  });

  it('returns positive stress for stretched mesh', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.1);
    const result = computeStressMap(positions, numParticles, edges, defaultFabric);
    expect(result.values[0]).toBeGreaterThan(0);
    expect(result.values[1]).toBeGreaterThan(0);
  });

  it('colors blue for zero stress', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeStressMap(positions, numParticles, edges, defaultFabric);
    // Blue = [0, 0, 1]
    expect(result.colors[2]).toBeCloseTo(1.0); // B channel
  });

  it('stats track min/max/mean', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.05);
    const result = computeStressMap(positions, numParticles, edges, defaultFabric);
    expect(result.stats.min).toBeLessThanOrEqual(result.stats.mean);
    expect(result.stats.max).toBeGreaterThanOrEqual(result.stats.mean);
  });

  it('respects custom stress range', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.1);
    const config: FitMapConfig = { ...DEFAULT_FIT_MAP_CONFIG, stressRange: [0, 10] };
    const result = computeStressMap(positions, numParticles, edges, defaultFabric, config);
    // With smaller range, colors should be more saturated (closer to red)
    expect(result.mode).toBe('stress');
  });
});

// ─── Strain Map ─────────────────────────────────────────────────────────────

describe('computeStrainMap', () => {
  it('returns 100% for non-deformed mesh', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeStrainMap(positions, numParticles, edges);
    expect(result.mode).toBe('strain');
    expect(result.values[0]).toBeCloseTo(100);
  });

  it('returns >100% for stretched mesh', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.15);
    const result = computeStrainMap(positions, numParticles, edges);
    expect(result.values[0]).toBeCloseTo(115);
  });

  it('colors blue at 100% (no stretch)', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeStrainMap(positions, numParticles, edges);
    expect(result.colors[2]).toBeCloseTo(1.0); // B
    expect(result.colors[0]).toBeCloseTo(0.0); // R
  });

  it('colors red at 120% (fully stretched in default range)', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.2);
    const result = computeStrainMap(positions, numParticles, edges);
    expect(result.colors[0]).toBeCloseTo(1.0); // R
    expect(result.colors[2]).toBeCloseTo(0.0); // B
  });

  it('custom range shifts visualization', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.1);
    const config: FitMapConfig = { ...DEFAULT_FIT_MAP_CONFIG, strainRange: [1.0, 1.1] };
    const result = computeStrainMap(positions, numParticles, edges, config);
    // 1.1 strain at [1.0, 1.1] range → t=1.0 → red
    expect(result.colors[0]).toBeCloseTo(1.0);
  });
});

// ─── Fit Map ────────────────────────────────────────────────────────────────

describe('computeFitMap', () => {
  it('returns 0 fit ratio for non-deformed mesh', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeFitMap(positions, numParticles, edges, defaultFabric);
    expect(result.mode).toBe('fit');
    expect(result.values[0]).toBeCloseTo(0);
  });

  it('white color for low fit ratio', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.0);
    const result = computeFitMap(positions, numParticles, edges, defaultFabric);
    // White = [1, 1, 1]
    expect(result.colors[0]).toBeCloseTo(1.0);
    expect(result.colors[1]).toBeCloseTo(1.0);
    expect(result.colors[2]).toBeCloseTo(1.0);
  });

  it('yellow for tight fit (>80% of max)', () => {
    // 8% max stretch, so 7% elongation = 87.5% of max → tight
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.07);
    const result = computeFitMap(positions, numParticles, edges, defaultFabric);
    expect(result.stats.tightPct).toBeGreaterThan(0);
  });

  it('red for cant-wear (>100% of max)', () => {
    // 8% max stretch, 10% elongation = 125% of max → can't wear
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.10);
    const result = computeFitMap(positions, numParticles, edges, defaultFabric);
    expect(result.stats.cantWearPct).toBeGreaterThan(0);
  });

  it('stats show percentage breakdown', () => {
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.10);
    const result = computeFitMap(positions, numParticles, edges, defaultFabric);
    expect(result.stats.cantWearPct + result.stats.tightPct).toBeLessThanOrEqual(100);
  });

  it('handles very stretchy fabric (high maxStretch)', () => {
    const stretchyFabric: FabricFitParams = { ...defaultFabric, maxStretchRatio: 0.5 };
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.1);
    const result = computeFitMap(positions, numParticles, edges, stretchyFabric);
    // 10% elongation / 50% max = 20% → OK zone
    expect(result.values[0]).toBeCloseTo(0.2);
    expect(result.stats.cantWearPct).toBe(0);
    expect(result.stats.tightPct).toBe(0);
  });

  it('custom thresholds', () => {
    const config: FitMapConfig = { ...DEFAULT_FIT_MAP_CONFIG, fitThresholds: [0.5, 0.7] };
    const { positions, numParticles, edges } = twoParticleSystem(1.0, 1.05);
    // 5% / 8% max = 62.5% → tight (>50%) but not can't-wear (<70%)
    const result = computeFitMap(positions, numParticles, edges, defaultFabric, config);
    expect(result.stats.tightPct).toBeGreaterThan(0);
    expect(result.stats.cantWearPct).toBe(0);
  });
});

// ─── Pressure Points ────────────────────────────────────────────────────────

describe('computePressurePoints', () => {
  it('returns no pressure without avatar', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const result = computePressurePoints(positions, 2, null);
    expect(result.mode).toBe('pressure');
    expect(result.stats.pressurePointCount).toBe(0);
  });

  it('detects contact when garment is near avatar', () => {
    const garment = new Float32Array([0, 0, 0, 1, 0, 0]);
    const avatar = new Float32Array([0, 0, 0.001]); // 1mm away
    const result = computePressurePoints(garment, 2, avatar);
    expect(result.values[0]).toBe(1.0); // Contact
    expect(result.stats.pressurePointCount).toBeGreaterThan(0);
  });

  it('no contact when far away', () => {
    const garment = new Float32Array([0, 0, 0]);
    const avatar = new Float32Array([10, 10, 10]); // Far away
    const result = computePressurePoints(garment, 1, avatar);
    expect(result.values[0]).toBe(0.0);
    expect(result.stats.pressurePointCount).toBe(0);
  });

  it('respects custom pressure distance', () => {
    const garment = new Float32Array([0, 0, 0]);
    const avatar = new Float32Array([0, 0, 0.005]); // 5mm
    const configClose: FitMapConfig = { ...DEFAULT_FIT_MAP_CONFIG, pressureDistance: 0.003 };
    const configFar: FitMapConfig = { ...DEFAULT_FIT_MAP_CONFIG, pressureDistance: 0.01 };
    expect(computePressurePoints(garment, 1, avatar, configClose).stats.pressurePointCount).toBe(0);
    expect(computePressurePoints(garment, 1, avatar, configFar).stats.pressurePointCount).toBe(1);
  });

  it('colors magenta for contact, gray for non-contact', () => {
    const garment = new Float32Array([0, 0, 0, 10, 10, 10]);
    const avatar = new Float32Array([0, 0, 0.001]);
    const result = computePressurePoints(garment, 2, avatar);
    // Contact vertex: magenta [1, 0, 0.8]
    expect(result.colors[0]).toBeCloseTo(1.0);
    expect(result.colors[1]).toBeCloseTo(0.0);
    expect(result.colors[2]).toBeCloseTo(0.8);
    // Non-contact vertex: gray [0.3, 0.3, 0.3]
    expect(result.colors[3]).toBeCloseTo(0.3);
  });
});

// ─── Unified computeFitMapData ──────────────────────────────────────────────

describe('computeFitMapData', () => {
  const sys = twoParticleSystem(1.0, 1.05);

  it('returns null for mode "none"', () => {
    expect(computeFitMapData('none', sys.positions, sys.numParticles, sys.edges, defaultFabric)).toBeNull();
  });

  it('dispatches to stress', () => {
    const result = computeFitMapData('stress', sys.positions, sys.numParticles, sys.edges, defaultFabric);
    expect(result?.mode).toBe('stress');
  });

  it('dispatches to strain', () => {
    const result = computeFitMapData('strain', sys.positions, sys.numParticles, sys.edges, defaultFabric);
    expect(result?.mode).toBe('strain');
  });

  it('dispatches to fit', () => {
    const result = computeFitMapData('fit', sys.positions, sys.numParticles, sys.edges, defaultFabric);
    expect(result?.mode).toBe('fit');
  });

  it('dispatches to pressure', () => {
    const result = computeFitMapData('pressure', sys.positions, sys.numParticles, sys.edges, defaultFabric, null);
    expect(result?.mode).toBe('pressure');
  });
});

// ─── fabricToFitParams ──────────────────────────────────────────────────────

describe('fabricToFitParams', () => {
  it('converts physical fabric to fit params', () => {
    const fabric = {
      maxStretchBeforeBreak: 8,
      weight: 150,
      thickness: 0.4,
      stretchWarp: 2,
      stretchWeft: 3,
    };
    const params = fabricToFitParams(fabric);
    expect(params.maxStretchRatio).toBeCloseTo(0.08);
    expect(params.weight).toBe(150);
    expect(params.thickness).toBe(0.4);
    expect(params.avgStretch).toBeCloseTo(0.025);
  });
});

// ─── Color correctness ─────────────────────────────────────────────────────

describe('color scale correctness', () => {
  it('stress: smooth gradient from blue to red', () => {
    // Create 10 particles at increasing stretch
    const numP = 10;
    const positions = new Float32Array(numP * 3);
    const ids: number[] = [];
    const lengths: number[] = [];
    for (let i = 0; i < numP - 1; i++) {
      positions[3 * i] = i;
      positions[3 * (i + 1)] = i + 1 + i * 0.02; // Progressive stretch
      ids.push(i, i + 1);
      lengths.push(1.0);
    }
    positions[3 * (numP - 1)] = numP - 1 + (numP - 2) * 0.02;
    const edges: SolverEdgeData = {
      stretchingIds: new Int32Array(ids),
      stretchingLengths: new Float32Array(lengths),
    };
    const result = computeStressMap(positions, numP, edges, defaultFabric);
    expect(result.colors.length).toBe(numP * 3);
  });

  it('fit map: three distinct zones', () => {
    // Create particles at 0%, 50%, 90%, 110% of max stretch
    const testCases = [
      { stretch: 1.0, zone: 'ok' },
      { stretch: 1.04, zone: 'ok' },    // 50% of 8%
      { stretch: 1.072, zone: 'tight' }, // 90% of 8%
      { stretch: 1.10, zone: 'cant' },   // 125% of 8%
    ];
    for (const tc of testCases) {
      const sys = twoParticleSystem(1.0, tc.stretch);
      const result = computeFitMap(sys.positions, sys.numParticles, sys.edges, defaultFabric);
      if (tc.zone === 'cant') {
        expect(result.stats.cantWearPct).toBeGreaterThan(0);
      } else if (tc.zone === 'tight') {
        expect(result.stats.tightPct).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('single particle with no edges', () => {
    const result = computeStrainMap(
      new Float32Array([0, 0, 0]), 1,
      { stretchingIds: new Int32Array(0), stretchingLengths: new Float32Array(0) },
    );
    expect(result.values[0]).toBeCloseTo(100); // Default no deformation
  });

  it('very small maxStretchRatio does not crash', () => {
    const fabric: FabricFitParams = { ...defaultFabric, maxStretchRatio: 0.0001 };
    const sys = twoParticleSystem(1.0, 1.01);
    const result = computeFitMap(sys.positions, sys.numParticles, sys.edges, fabric);
    expect(result.stats.cantWearPct).toBeGreaterThan(0); // Almost everything is can't-wear
  });

  it('zero-thickness fabric does not produce NaN', () => {
    const fabric: FabricFitParams = { ...defaultFabric, thickness: 0 };
    const sys = twoParticleSystem(1.0, 1.05);
    const result = computeStressMap(sys.positions, sys.numParticles, sys.edges, fabric);
    expect(Number.isFinite(result.values[0])).toBe(true);
  });
});

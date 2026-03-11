import { describe, it, expect, vi } from 'vitest';

// Mock three/tsl (TSL functions)
vi.mock('three/tsl', () => {
  const mockUniform = (val: number) => ({ value: val, mul: vi.fn(), div: vi.fn() });

  return {
    storage: vi.fn(() => ({
      element: vi.fn(() => ({
        assign: vi.fn(),
        addAssign: vi.fn(),
        sub: vi.fn().mockReturnThis(),
        mul: vi.fn().mockReturnThis(),
        div: vi.fn().mockReturnThis(),
        add: vi.fn().mockReturnThis(),
        negate: vi.fn().mockReturnThis(),
        sqrt: vi.fn().mockReturnThis(),
        greaterThan: vi.fn().mockReturnValue(true),
        lessThan: vi.fn().mockReturnValue(false),
        equal: vi.fn().mockReturnValue(true),
        greaterThanEqual: vi.fn().mockReturnValue(true),
      })),
    })),
    Fn: vi.fn(() => {
      // Return a callable that returns a mock TSL node
      return () => ({ __tslFn: true });
    }),
    If: vi.fn(() => ({ Else: vi.fn() })),
    compute: vi.fn((_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    })),
    uniform: vi.fn((val: number) => mockUniform(val)),
    float: vi.fn((val: number) => ({
      value: val,
      mul: vi.fn().mockReturnThis(),
    })),
    uint: vi.fn((val: number) => ({
      value: val,
      mul: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
    })),
    instanceIndex: { __tslInstanceIndex: true },
  };
});

// Mock three/webgpu (StorageBufferAttribute)
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: class MockSBA {
    array: Float32Array | Uint32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
}));

import { createTslSolver } from '../tslSolver';
import type { TslSolverConfig } from '../tslSolver';
import type { TslBufferSet } from '../tslBuffers';
import { StorageBufferAttribute } from 'three/webgpu';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockBufferSet(options?: {
  numBend?: number;
  numSeam?: number;
  numStretchColors?: number;
}): TslBufferSet {
  const numParticles = 4;
  const numBend = options?.numBend ?? 1;
  const numSeam = options?.numSeam ?? 0;
  const numColors = options?.numStretchColors ?? 2;

  const positionSBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
  const prevPosSBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
  const velocitySBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
  const invMassSBA = new StorageBufferAttribute(new Float32Array(numParticles), 1);

  // Stretch color groups
  const stretchColors = [];
  for (let c = 0; c < numColors; c++) {
    const count = c === 0 ? 3 : 2; // 3 constraints in color 0, 2 in color 1
    stretchColors.push({
      idsSBA: new StorageBufferAttribute(new Uint32Array(count * 2), 2),
      restLengthsSBA: new StorageBufferAttribute(new Float32Array(count), 1),
      count,
    });
  }

  // Bend
  let bendIdsSBA: StorageBufferAttribute | null = null;
  let bendRestSBA: StorageBufferAttribute | null = null;
  if (numBend > 0) {
    bendIdsSBA = new StorageBufferAttribute(new Uint32Array(numBend * 4), 4);
    bendRestSBA = new StorageBufferAttribute(new Float32Array(numBend), 1);
  }

  // Seam
  let seamIdsSBA: StorageBufferAttribute | null = null;
  let seamTargetDistSBA: StorageBufferAttribute | null = null;
  if (numSeam > 0) {
    seamIdsSBA = new StorageBufferAttribute(new Uint32Array(numSeam * 2), 2);
    seamTargetDistSBA = new StorageBufferAttribute(new Float32Array(numSeam), 1);
  }

  return {
    positionSBA,
    prevPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendIdsSBA,
    bendRestSBA,
    numBendConstraints: numBend,
    seamIdsSBA,
    seamTargetDistSBA,
    numSeamConstraints: numSeam,
    triangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
    numParticles,
    numTriangles: 2,
  };
}

const defaultConfig: TslSolverConfig = {
  substeps: 15,
  gravity: [0, -9.81, 0],
  damping: 0.99,
  stretchCompliance: 0.0,
  bendCompliance: 1.0,
  seamStiffness: 0.0001,
  groundY: -10.0,
  dt: 1 / 60,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createTslSolver', () => {
  it('returns solver with preSolve compute node', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.preSolve).toBeDefined();
    expect(solver.preSolve).toHaveProperty('__tslCompute', true);
  });

  it('returns solver with postSolve compute node', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.postSolve).toBeDefined();
    expect(solver.postSolve).toHaveProperty('__tslCompute', true);
  });

  it('returns per-color stretch compute nodes matching buffer colors count', () => {
    const buffers = makeMockBufferSet({ numStretchColors: 3 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.stretchColors).toHaveLength(3);
    for (const node of solver.stretchColors) {
      expect(node).toHaveProperty('__tslCompute', true);
    }
  });

  it('returns bend compute node when constraints exist', () => {
    const buffers = makeMockBufferSet({ numBend: 2 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.bend).not.toBeNull();
    expect(solver.bend).toHaveProperty('__tslCompute', true);
  });

  it('returns null bend when no constraints', () => {
    const buffers = makeMockBufferSet({ numBend: 0 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.bend).toBeNull();
  });

  it('returns seam compute node when constraints exist', () => {
    const buffers = makeMockBufferSet({ numSeam: 3 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seam).not.toBeNull();
    expect(solver.seam).toHaveProperty('__tslCompute', true);
  });

  it('returns null seam when no constraints', () => {
    const buffers = makeMockBufferSet({ numSeam: 0 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seam).toBeNull();
  });

  it('exposes positionSBA from buffers', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.positionSBA).toBe(buffers.positionSBA);
  });

  it('exposes numParticles from buffers', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.numParticles).toBe(4);
  });

  it('exposes numTriangles from buffers', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.numTriangles).toBe(2);
  });

  it('exposes triangles from buffers', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.triangles).toBe(buffers.triangles);
  });

  it('exposes updateConfig function', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(typeof solver.updateConfig).toBe('function');
  });

  it('preSolve dispatch count matches numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.preSolve).toHaveProperty('dispatchCount', 4);
  });

  it('postSolve dispatch count matches numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.postSolve).toHaveProperty('dispatchCount', 4);
  });

  it('stretch dispatch count matches per-color constraint count', () => {
    const buffers = makeMockBufferSet({ numStretchColors: 2 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.stretchColors[0]).toHaveProperty('dispatchCount', 3);
    expect(solver.stretchColors[1]).toHaveProperty('dispatchCount', 2);
  });

  it('bend dispatch count matches bend constraint count', () => {
    const buffers = makeMockBufferSet({ numBend: 5 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.bend).toHaveProperty('dispatchCount', 5);
  });

  it('seam dispatch count matches seam constraint count', () => {
    const buffers = makeMockBufferSet({ numSeam: 7 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seam).toHaveProperty('dispatchCount', 7);
  });
});

describe('updateConfig', () => {
  it('updates gravity uniforms', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    // Should not throw
    solver.updateConfig({ gravity: [0, -5.0, 0] });
  });

  it('updates damping uniform', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    solver.updateConfig({ damping: 0.95 });
  });

  it('updates sdt when substeps changes', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    solver.updateConfig({ substeps: 30 });
  });

  it('updates sdt when dt changes', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    solver.updateConfig({ dt: 1 / 120 });
  });

  it('updates compliance uniforms', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    solver.updateConfig({
      stretchCompliance: 0.001,
      bendCompliance: 0.5,
      seamStiffness: 0.01,
    });
  });

  it('updates groundY uniform', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    solver.updateConfig({ groundY: -5.0 });
  });

  it('handles partial config updates', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    // Only update one field at a time — should not throw
    solver.updateConfig({ damping: 0.8 });
    solver.updateConfig({ gravity: [0, -20, 0] });
    solver.updateConfig({ groundY: 0 });
  });
});

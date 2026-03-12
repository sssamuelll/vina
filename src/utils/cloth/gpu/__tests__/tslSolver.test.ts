import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so shared mocks are available to both.
const { MockSBA, tslExports } = vi.hoisted(() => {
  const MockSBA = class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  };

  const mockUniform = (val: number) => ({ value: val, mul: () => mockUniform(0), div: () => mockUniform(0) });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockElement = (): any => ({
    assign: () => {},
    addAssign: () => {},
    sub: () => mockElement(),
    mul: () => mockElement(),
    div: () => mockElement(),
    add: () => mockElement(),
    negate: () => mockElement(),
    sqrt: () => mockElement(),
    dot: () => mockElement(),
    toVar: () => mockElement(),
    x: { mul: () => mockElement(), sub: () => mockElement() },
    y: { mul: () => mockElement(), sub: () => mockElement(), assign: () => {}, lessThan: () => false },
    z: { mul: () => mockElement(), sub: () => mockElement() },
    greaterThan: () => true,
    lessThan: () => false,
    equal: () => true,
    greaterThanEqual: () => true,
  });

  const tslExports = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    storage: (..._: any[]) => ({
      element: () => mockElement(),
      toAttribute: () => ({ __tslAttribute: true }),
    }),
    Fn: () => () => ({ __tslFn: true }),
    If: () => ({ Else: () => {} }),
    compute: (_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    }),
    uniform: (val: number) => mockUniform(val),
    float: (val: number) => ({
      value: val,
      mul: () => mockElement(),
      sub: () => mockElement(),
    }),
    uint: (val: number) => ({
      value: val,
      mul: () => mockElement(),
      add: () => mockElement(),
    }),
    int: (val: number) => ({
      value: val,
      toVar: () => ({ value: val }),
    }),
    vec3: () => ({ __tslVec3: true }),
    instanceIndex: { __tslInstanceIndex: true },
    Loop: () => {},
    atomicStore: () => {},
    atomicAdd: () => mockElement(),
  };

  return { MockSBA, tslExports };
});

// Note: three/webgpu and three/tsl resolve to the same bundle (three.webgpu.js),
// so both mocks must include ALL exports to avoid Vitest deduplication issues.
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: MockSBA,
  ...tslExports,
}));

vi.mock('three/tsl', () => ({
  StorageBufferAttribute: MockSBA,
  ...tslExports,
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
      complianceSBA: new StorageBufferAttribute(new Float32Array(count), 1),
      count,
    });
  }

  // Bend
  let bendIdsSBA: StorageBufferAttribute | null = null;
  let bendRestSBA: StorageBufferAttribute | null = null;
  let bendComplianceSBA: StorageBufferAttribute | null = null;
  if (numBend > 0) {
    bendIdsSBA = new StorageBufferAttribute(new Uint32Array(numBend * 4), 4);
    bendRestSBA = new StorageBufferAttribute(new Float32Array(numBend), 1);
    bendComplianceSBA = new StorageBufferAttribute(new Float32Array(numBend), 1);
  }

  // Seam
  let seamIdsSBA: StorageBufferAttribute | null = null;
  let seamTargetDistSBA: StorageBufferAttribute | null = null;
  if (numSeam > 0) {
    seamIdsSBA = new StorageBufferAttribute(new Uint32Array(numSeam * 2), 2);
    seamTargetDistSBA = new StorageBufferAttribute(new Float32Array(numSeam), 1);
  }

  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);

  return {
    positionSBA,
    prevPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendIdsSBA,
    bendRestSBA,
    bendComplianceSBA,
    numBendConstraints: numBend,
    seamIdsSBA,
    seamTargetDistSBA,
    numSeamConstraints: numSeam,
    triangles,
    normalSBA: new StorageBufferAttribute(new Float32Array(numParticles * 3), 3),
    normalAccumSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    triangleIdsSBA: new StorageBufferAttribute(new Uint32Array(triangles), 1),
    numParticles,
    numTriangles: 2,
    scBuffers: null,
    windBuffers: null,
  };
}

const defaultConfig: TslSolverConfig = {
  substeps: 15,
  gravity: [0, -9.81, 0],
  damping: 0.99,
  internalDamping: 0.3,
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

  it('returns groundClamp compute node', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.groundClamp).toBeDefined();
    expect(solver.groundClamp).toHaveProperty('__tslCompute', true);
  });

  it('groundClamp dispatch count matches numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.groundClamp).toHaveProperty('dispatchCount', 4);
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

  it('returns normalZero compute node with dispatch count matching numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.normalZero).toBeDefined();
    expect(solver.normalZero).toHaveProperty('__tslCompute', true);
    expect(solver.normalZero).toHaveProperty('dispatchCount', 4);
  });

  it('returns normalAccum compute node with dispatch count matching numTriangles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.normalAccum).toBeDefined();
    expect(solver.normalAccum).toHaveProperty('__tslCompute', true);
    expect(solver.normalAccum).toHaveProperty('dispatchCount', 2);
  });

  it('returns normalNormalize compute node with dispatch count matching numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.normalNormalize).toBeDefined();
    expect(solver.normalNormalize).toHaveProperty('__tslCompute', true);
    expect(solver.normalNormalize).toHaveProperty('dispatchCount', 4);
  });

  it('exposes normalBufNode for material.normalNode', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.normalBufNode).toBeDefined();
    expect(solver.normalBufNode).toHaveProperty('toAttribute');
  });

  it('exposes normalSBA from buffers', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.normalSBA).toBe(buffers.normalSBA);
  });

  it('returns null windNodes when no wind configured', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(solver.windNodes).toBeNull();
  });

  it('returns windNodes when windForce is provided', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, {
      ...defaultConfig,
      windForce: [5, 0, 0],
      dragCoefficient: 1.0,
    });
    expect(solver.windNodes).toBeDefined();
    expect(solver.windNodes).not.toBeNull();
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
      internalDamping: 0.5,
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

  // ─── Collision body management ──────────────────────────────────────
  it('starts with empty collisionBodies', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(solver.collisionBodies).toEqual([]);
  });

  it('setCollisionBody adds a body', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const body = { id: 'test', collisionNode: {} as unknown as import('three/src/nodes/gpgpu/ComputeNode.js').default, margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 };
    solver.setCollisionBody(body);
    expect(solver.collisionBodies).toHaveLength(1);
    expect(solver.collisionBodies[0].id).toBe('test');
  });

  it('setCollisionBody replaces existing body with same id', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const body1 = { id: 'test', collisionNode: {} as unknown as import('three/src/nodes/gpgpu/ComputeNode.js').default, margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 };
    const body2 = { id: 'test', collisionNode: {} as unknown as import('three/src/nodes/gpgpu/ComputeNode.js').default, margin: 0.01, friction: 0.5, nodeCount: 20, triCount: 10 };
    solver.setCollisionBody(body1);
    solver.setCollisionBody(body2);
    expect(solver.collisionBodies).toHaveLength(1);
    expect(solver.collisionBodies[0].margin).toBe(0.01);
  });

  it('removeCollisionBody removes by id', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const body = { id: 'test', collisionNode: {} as unknown as import('three/src/nodes/gpgpu/ComputeNode.js').default, margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 };
    solver.setCollisionBody(body);
    solver.removeCollisionBody('test');
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('removeCollisionBody is no-op for unknown id', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    solver.removeCollisionBody('nonexistent');
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('exposes prevPosBufNode and invMassBufNode', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(solver.prevPosBufNode).toBeDefined();
    expect(solver.invMassBufNode).toBeDefined();
  });
});

import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so shared mocks are available to both.
// `setAtomicCalls` is exposed for #554 regression guard tests — every storage(...)
// call returns a node whose `.setAtomic` records {sba, value} into this array.
const { MockSBA, tslExports, setAtomicCalls, atomicLoadCalls, uniformNodes, storageCalls } = vi.hoisted(() => {
  const setAtomicCalls: Array<{ sba: unknown; value: unknown }> = [];
  // `storageCalls` records the SBA passed to every top-level `storage(...)`
  // call — the observable for "SBA X was wrapped as a storage node inside
  // createTslSolver" (used by the #897 F2.3 preCollisionPos wiring pin).
  const storageCalls: Array<unknown> = [];
  // `atomicLoadCalls` is exposed for #554 spec-compliance regression tests —
  // every atomicLoad(buf.element(i)) call in the production code increments
  // this counter. WGSL spec mandates atomicLoad for read passes against
  // array<atomic<T>> buffers; a future refactor that drops it would silently
  // fail Dawn validation. Symmetric to `setAtomicCalls`.
  const atomicLoadCalls: Array<unknown> = [];
  // `uniformNodes` records every node created via the top-level `uniform()`
  // export (NOT the derived mockUniform(0) chain results). The SolverUniforms
  // object is internal to createTslSolver, so constructor capture is the only
  // observable for "config field X was wired into a uniform with value V" —
  // used by the #897 F1.4 seam-decay pins.
  const uniformNodes: Array<{ value: number }> = [];

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
    subAssign: () => {},
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
    // equal returns a node (not a bare boolean) so `.and()` chains — the
    // #897 F2.3 postSolve NaN guard composes `speed2.equal(speed2).and(...)`.
    equal: () => mockElement(),
    and: () => mockElement(),
    greaterThanEqual: () => true,
  });

  // Wrap callback invocation so a missing mock surface inside the body
  // doesn't abort the whole test — partial execution still triggers any
  // atomicLoad calls that fired before the throw, which is what the #554
  // spec-compliance test asserts on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tryInvoke = (cb: unknown, arg?: any) => {
    if (typeof cb === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (cb as (...a: any[]) => any)(arg); } catch { /* mock surface incomplete — partial coverage */ }
    }
  };

  const tslExports = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage: (...args: any[]) => {
      storageCalls.push(args[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = {
        element: () => mockElement(),
        toAttribute: () => ({ __tslAttribute: true }),
        // setAtomic must be chainable per StorageBufferNode.js:273 (returns `this`).
        // Records each invocation for #554 regression guards.
        setAtomic: function (this: unknown, value: boolean) {
          setAtomicCalls.push({ sba: args[0], value });
          return node;
        },
      };
      return node;
    },
    // Fn / If / Loop invoke their callbacks so atomicLoad calls inside kernel
    // bodies fire and are assertable for #554 spec compliance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Fn: (cb?: (...args: any[]) => any) => () => { tryInvoke(cb); return { __tslFn: true }; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    If: (_cond: unknown, cb?: (...args: any[]) => any) => { tryInvoke(cb); return { Else: (elseCb?: (...args: any[]) => any) => { tryInvoke(elseCb); } }; },
    compute: (_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    }),
    uniform: (val: number) => {
      const u = mockUniform(val);
      uniformNodes.push(u);
      return u;
    },
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Loop: (_count: unknown, cb?: (...args: any[]) => any) => { tryInvoke(cb, { i: 0 }); },
    atomicStore: () => {},
    atomicAdd: () => mockElement(),
    // atomicLoad: required for read-side of atomic<i32> buffers (#554 fix).
    // Records each invocation for the #554 spec-compliance regression test.
    atomicLoad: (dest: unknown) => {
      atomicLoadCalls.push(dest);
      return mockElement();
    },
  };

  return { MockSBA, tslExports, setAtomicCalls, atomicLoadCalls, uniformNodes, storageCalls };
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
  /** Per-color seam constraint counts — overrides numSeam's single group */
  seamColorCounts?: number[];
  numStretchColors?: number;
}): TslBufferSet {
  const numParticles = 4;
  const numBend = options?.numBend ?? 1;
  const numSeam = options?.numSeam ?? 0;
  const numColors = options?.numStretchColors ?? 2;

  const positionSBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
  const prevPosSBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
  const preCollisionPosSBA = new StorageBufferAttribute(new Float32Array(numParticles * 3), 3);
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

  // Bend (per-color — P4-1 + P1 dihedral). Model the whole bend set as a
  // single color group of `numBend` stride-4 quads for dispatch-count asserts.
  const bendColors = numBend > 0
    ? [{
        idsSBA: new StorageBufferAttribute(new Uint32Array(numBend * 4), 4),
        restAnglesSBA: new StorageBufferAttribute(new Float32Array(numBend), 1),
        complianceSBA: new StorageBufferAttribute(new Float32Array(numBend), 1),
        count: numBend,
      }]
    : [];

  // Seam (per-color groups — #897 F1.3)
  const seamColorCounts = options?.seamColorCounts ?? (numSeam > 0 ? [numSeam] : []);
  const seamColors = seamColorCounts.map((count) => ({
    idsSBA: new StorageBufferAttribute(new Uint32Array(count * 2), 2),
    targetDistSBA: new StorageBufferAttribute(new Float32Array(count), 1),
    complianceSBA: new StorageBufferAttribute(new Float32Array(count), 1),
    count,
  }));

  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);

  return {
    positionSBA,
    prevPosSBA,
    preCollisionPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendColors,
    numBendConstraints: numBend,
    seamColors,
    numSeamConstraints: seamColorCounts.reduce((a, b) => a + b, 0),
    triangles,
    normalSBA: new StorageBufferAttribute(new Float32Array(numParticles * 3), 3),
    normalAccumSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    triangleIdsSBA: new StorageBufferAttribute(new Uint32Array(triangles), 1),
    grabMaskSBA: new StorageBufferAttribute(new Float32Array(numParticles), 1),
    grabOffsetSBA: new StorageBufferAttribute(new Float32Array(numParticles * 3), 3),
    tetherTargetSBA: new StorageBufferAttribute(new Float32Array(numParticles * 3), 3),
    tetherMaxDistSBA: new StorageBufferAttribute(new Float32Array(numParticles).fill(0.06), 1),
    facePokeCsrSBA: new StorageBufferAttribute(new Uint32Array(numParticles + 1 + 6 + 6), 1),
    facePokeContactSBA: new StorageBufferAttribute(new Uint32Array(2), 1),
    numParticles,
    numTriangles: 2,
    scBuffers: null,
    weldBuffers: null,
    windBuffers: null,
  };
}

const defaultConfig: TslSolverConfig = {
  substeps: 15,
  gravity: [0, -9.81, 0],
  damping: 0.99,
  internalDamping: 0.3,
  seamShrinkFactor: 0.97,
  seamSewedThreshold: 1e-6,
  groundY: -10.0,
  dt: 1 / 60,
};

// `TslCollisionBody` carries two ComputeNodes (findBest + applyPush) per the
// atomic-emulation pattern in tslCollision.ts. Tests don't dispatch them —
// only verify register/replace/remove book-keeping — so dummy ComputeNode
// placeholders work.
type ComputeNode = import('three/src/nodes/gpgpu/ComputeNode.js').default;
function makeMockBody(opts: {
  id: string;
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
  dispose?: (renderer?: unknown) => void;
}) {
  return {
    id: opts.id,
    findBestNode: {} as unknown as ComputeNode,
    applyPushNode: {} as unknown as ComputeNode,
    margin: opts.margin,
    friction: opts.friction,
    nodeCount: opts.nodeCount,
    triCount: opts.triCount,
    dispose: opts.dispose ?? (() => {}),
  };
}

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

  it('strain-limit is FUSED into the stretch kernel — no separate pass (consejo 2026-07-02)', () => {
    const buffers = makeMockBufferSet({ numStretchColors: 3 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    // El cap one-sided (#gummy STEP 4) vive DENTRO de makeDistanceConstraintFn
    // (mismos ids/colores → misma race-safety, ~150 dispatches menos/frame).
    // El contrato: stretch sigue 1 nodo por color, y la interface ya no expone
    // un pase de strain-limit aparte.
    expect(solver.stretchColors).toHaveLength(3);
    expect('strainLimitColors' in solver).toBe(false);
  });

  it('returns per-color bend compute nodes when constraints exist', () => {
    const buffers = makeMockBufferSet({ numBend: 2 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.bendColors).toHaveLength(1);
    expect(solver.bendColors[0]).toHaveProperty('__tslCompute', true);
  });

  it('returns empty bendColors when no constraints', () => {
    const buffers = makeMockBufferSet({ numBend: 0 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.bendColors).toEqual([]);
  });

  it('returns per-color seam compute nodes when constraints exist', () => {
    const buffers = makeMockBufferSet({ numSeam: 3 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seamColors).toHaveLength(1);
    expect(solver.seamColors[0]).toHaveProperty('__tslCompute', true);
  });

  it('returns empty seamColors when no constraints', () => {
    const buffers = makeMockBufferSet({ numSeam: 0 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seamColors).toEqual([]);
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

    expect(solver.bendColors[0]).toHaveProperty('dispatchCount', 5);
  });

  it('seam dispatch count matches seam constraint count (single group)', () => {
    const buffers = makeMockBufferSet({ numSeam: 7 });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seamColors).toHaveLength(1);
    expect(solver.seamColors[0]).toHaveProperty('dispatchCount', 7);
  });

  it('seam dispatch count matches per-color constraint count', () => {
    const buffers = makeMockBufferSet({ seamColorCounts: [4, 3] });
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.seamColors).toHaveLength(2);
    expect(solver.seamColors[0]).toHaveProperty('dispatchCount', 4);
    expect(solver.seamColors[1]).toHaveProperty('dispatchCount', 3);
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

  it('always creates windNodes even without explicit windForce config', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(solver.windNodes).toBeDefined();
    expect(solver.windNodes).not.toBeNull();
  });

  it('creates windNodes with explicit windForce config', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, {
      ...defaultConfig,
      windForce: [5, 0, 0],
      dragCoefficient: 1.0,
    });
    expect(solver.windNodes).toBeDefined();
    expect(solver.windNodes).not.toBeNull();
  });

  it('returns a body-tether compute node (#frente2)', () => {
    const buffers = makeMockBufferSet({ numStretchColors: 3 });
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(solver.tether).not.toBeNull();
    expect(solver.tether).toHaveProperty('__tslCompute', true);
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
    const body = makeMockBody({ id: 'test', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 });
    solver.setCollisionBody(body);
    expect(solver.collisionBodies).toHaveLength(1);
    expect(solver.collisionBodies[0].id).toBe('test');
  });

  it('setCollisionBody replaces existing body with same id', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const body1 = makeMockBody({ id: 'test', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 });
    const body2 = makeMockBody({ id: 'test', margin: 0.01, friction: 0.5, nodeCount: 20, triCount: 10 });
    solver.setCollisionBody(body1);
    solver.setCollisionBody(body2);
    expect(solver.collisionBodies).toHaveLength(1);
    expect(solver.collisionBodies[0].margin).toBe(0.01);
  });

  it('setCollisionBody disposes the previous body when replacing same id, propagating renderer', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    const body1 = makeMockBody({ id: 'test', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5, dispose: dispose1 });
    const body2 = makeMockBody({ id: 'test', margin: 0.01, friction: 0.5, nodeCount: 20, triCount: 10, dispose: dispose2 });
    const renderer = { __test: 'renderer' };
    solver.setCollisionBody(body1, renderer);
    expect(dispose1).not.toHaveBeenCalled();
    solver.setCollisionBody(body2, renderer);
    expect(dispose1).toHaveBeenCalledOnce();
    expect(dispose1).toHaveBeenCalledWith(renderer);
    expect(dispose2).not.toHaveBeenCalled();
  });

  it('setCollisionBody does not dispose anything when body id is new', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const dispose1 = vi.fn();
    const body1 = makeMockBody({ id: 'a', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5, dispose: dispose1 });
    solver.setCollisionBody(body1);
    expect(dispose1).not.toHaveBeenCalled();
  });

  it('removeCollisionBody removes by id', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const body = makeMockBody({ id: 'test', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5 });
    solver.setCollisionBody(body);
    solver.removeCollisionBody('test');
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('removeCollisionBody disposes the body before splice, propagating renderer', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const dispose = vi.fn();
    const body = makeMockBody({ id: 'test', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5, dispose });
    const renderer = { __test: 'renderer' };
    solver.setCollisionBody(body);
    solver.removeCollisionBody('test', renderer);
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(renderer);
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('removeCollisionBody is no-op (no dispose) for unknown id even with renderer', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const dispose = vi.fn();
    const body = makeMockBody({ id: 'a', margin: 0.005, friction: 0.3, nodeCount: 10, triCount: 5, dispose });
    solver.setCollisionBody(body);
    solver.removeCollisionBody('nonexistent', { __test: 'renderer' });
    expect(dispose).not.toHaveBeenCalled();
    expect(solver.collisionBodies).toHaveLength(1);
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

  it('dispose clears registered collision bodies', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    solver.setCollisionBody(makeMockBody({ id: 'a', margin: 0.005, friction: 0.3, nodeCount: 1, triCount: 1 }));
    solver.setCollisionBody(makeMockBody({ id: 'b', margin: 0.005, friction: 0.3, nodeCount: 1, triCount: 1 }));
    expect(solver.collisionBodies).toHaveLength(2);
    solver.dispose();
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('dispose calls body.dispose(renderer) on every registered body before clear', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    solver.setCollisionBody(makeMockBody({ id: 'a', margin: 0.005, friction: 0.3, nodeCount: 1, triCount: 1, dispose: disposeA }));
    solver.setCollisionBody(makeMockBody({ id: 'b', margin: 0.005, friction: 0.3, nodeCount: 1, triCount: 1, dispose: disposeB }));
    const renderer = { __test: 'renderer' };
    solver.dispose(renderer);
    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeA).toHaveBeenCalledWith(renderer);
    expect(disposeB).toHaveBeenCalledOnce();
    expect(disposeB).toHaveBeenCalledWith(renderer);
    expect(solver.collisionBodies).toHaveLength(0);
  });

  it('dispose is idempotent and never throws on a fresh solver', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });
    expect(() => {
      solver.dispose();
      solver.dispose();
    }).not.toThrow();
  });
});

// ─── #554 regression guards ──────────────────────────────────────────────────
// Future refactors / Three.js upgrades could silently drop `.setAtomic(true)`,
// regressing to WGSL `array<i32>` + Dawn warnings + silent CPU fallback. These
// tests guard against that by asserting setAtomic is invoked with `true` on
// the specific atomic buffer per kernel.

describe('#554 atomic buffer regression guards', () => {
  it('declares array<atomic<i32>> on normalAccumBuf via setAtomic(true)', () => {
    setAtomicCalls.length = 0;
    const buffers = makeMockBufferSet();
    createTslSolver(buffers, { ...defaultConfig });

    const call = setAtomicCalls.find((c) => c.sba === buffers.normalAccumSBA);
    expect(call).toBeDefined();
    expect(call?.value).toBe(true);
  });

  it('uses atomicLoad on read passes (#554 WGSL spec compliance)', () => {
    // Symmetric to the setAtomic guard above. Once a buffer is declared
    // array<atomic<T>> via setAtomic(true), WGSL spec requires atomicLoad for
    // ALL reads — a plain `.element(i)` read is a validation error. The
    // normalNormalize pass in tslSolver reads normalAccumBuf via atomicLoad.
    atomicLoadCalls.length = 0;
    const buffers = makeMockBufferSet();
    createTslSolver(buffers, { ...defaultConfig });

    expect(atomicLoadCalls.length).toBeGreaterThan(0);
  });
});

// ─── #897 F1.4 — seam target decay uniforms ──────────────────────────────────
//
// The seam kernel decays each constraint's target per substep (×shrinkFactor,
// snap to 0 below sewedThreshold) before XPBD projection, mirroring Rust
// `solve_seams` (lib.rs:649-711). These pins anchor the uniform wiring.
//
// Limitation: the Fn() mock invokes kernel bodies but records nothing about
// which uniform nodes a given kernel closure captured, so "the seam kernel
// reads shrink/threshold" cannot be asserted at the kernel level here — the
// pin is at the createUniforms level (constructor capture via `uniformNodes`);
// the kernel wiring is a direct pass-through of uniforms.seamShrinkFactor /
// uniforms.seamSewedThreshold in tslSolver.ts.

describe('#897 F1.4 seam target decay uniforms', () => {
  it('creates a seamShrinkFactor uniform with the config value (0.97)', () => {
    uniformNodes.length = 0;
    const buffers = makeMockBufferSet({ numSeam: 2 });
    createTslSolver(buffers, { ...defaultConfig });

    // 0.97 appears nowhere else in the init path (damping 0.99, grav -9.81,
    // internalDamping 0.3, groundY -10, sdt 1/900, wind 0/1, brush 0/0.05,
    // grab 0/0.08/0.6/15) — it uniquely identifies the shrink uniform.
    expect(uniformNodes.some((u) => u.value === 0.97)).toBe(true);
  });

  it('creates the EFFECTIVE seam floor uniform: max(restLengthFloor, sewedThreshold) — A3', () => {
    uniformNodes.length = 0;
    const buffers = makeMockBufferSet({ numSeam: 2 });
    // 0.0037 es distintivo (0.002 colisionaría con el thickness del
    // self-collision) — pinnea que el floor de config llega como uniform.
    createTslSolver(buffers, { ...defaultConfig, seamRestLengthFloor: 0.0037 });
    expect(uniformNodes.some((u) => u.value === 0.0037)).toBe(true);
  });

  it('a floor of 0 degrades to the legacy near-zero snap (threshold lower-bounds it)', () => {
    uniformNodes.length = 0;
    const buffers = makeMockBufferSet({ numSeam: 2 });
    createTslSolver(buffers, { ...defaultConfig, seamRestLengthFloor: 0 });
    expect(uniformNodes.some((u) => u.value === 1e-6)).toBe(true);
  });

  it('seam decay params are init-only — updateConfig does not write them (mirrors WASM init-wired set_seam_shrink_params)', () => {
    uniformNodes.length = 0;
    const buffers = makeMockBufferSet({ numSeam: 2 });
    const solver = createTslSolver(buffers, { ...defaultConfig, seamRestLengthFloor: 0.0037 });

    const shrinkNode = uniformNodes.find((u) => u.value === 0.97);
    const floorNode = uniformNodes.find((u) => u.value === 0.0037);
    expect(shrinkNode).toBeDefined();
    expect(floorNode).toBeDefined();

    solver.updateConfig({ seamShrinkFactor: 0.5, seamSewedThreshold: 0.1 });

    expect(shrinkNode!.value).toBe(0.97);
    expect(floorNode!.value).toBe(0.0037);
  });

  it('TslSolverConfig no longer accepts seamStiffness (compile-level pin)', () => {
    // @ts-expect-error — seamStiffness was removed from TslSolverConfig in
    // #897 F1.4 (per-constraint compliance + in-kernel decay replaced it).
    const rejected: TslSolverConfig = { ...defaultConfig, seamStiffness: 0.01 };
    expect(rejected).toBeDefined();
  });
});

// ─── #897 F2.3 — pre-collision snapshot + inelastic postSolve ────────────────
//
// On WASM the collision push corrects position but is EXCLUDED from velocity
// derivation (wasmSolverWorker.ts:351-402): preCollisionBuf.set(posView) before
// the per-body collision loop, then vel = (preCol - prev) * invSdt, then the
// vn<0 inelastic zeroing. The TSL mirror is a snapshot kernel (pos →
// preCollisionPos, dispatched after grab / before collision bodies) plus a
// postSolve that derives velocity from preCollisionPos.
//
// Limitation (same as the F1.4 note above): the Fn() mock invokes kernel
// bodies but cannot attribute element() reads to a specific kernel, so
// "postSolve reads preCollisionPos" is not assertable at the kernel level.
// The pin here is (a) the snapshot ComputeNode surface and (b) the SBA being
// wrapped as a storage node inside createTslSolver; the kernel wiring is a
// direct pass-through of preColBuf into makePostSolveFn in tslSolver.ts.
// The substep dispatch order in GarmentSimulation.tsx has no unit harness —
// it is pinned by the F2.6 browser verification.

describe('#897 F2.3 snapshotPreCollision', () => {
  it('exposes snapshotPreCollision compute node with dispatchCount = numParticles', () => {
    const buffers = makeMockBufferSet();
    const solver = createTslSolver(buffers, { ...defaultConfig });

    expect(solver.snapshotPreCollision).toBeDefined();
    expect(solver.snapshotPreCollision).toHaveProperty('__tslCompute', true);
    expect(solver.snapshotPreCollision).toHaveProperty('dispatchCount', 4);
  });

  it('wraps preCollisionPosSBA as a storage node (postSolve/snapshot wiring pin)', () => {
    storageCalls.length = 0;
    const buffers = makeMockBufferSet();
    createTslSolver(buffers, { ...defaultConfig });

    expect(storageCalls).toContain(buffers.preCollisionPosSBA);
  });
});

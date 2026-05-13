import { describe, it, expect } from 'vitest';
import {
  TriangleSpatialHash,
  solveTriangleCollision,
  pointToTriangleDist,
} from '../triangleCollision';
import type { CollisionMeshData } from '../collisionMesh';

function makeFloorTriangle(): CollisionMeshData {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1]);
  return { vertices, normals, triCount: 1 };
}

function makeFloorPlane(): CollisionMeshData {
  const vertices = new Float32Array([
    -5, 0, -5,  5, 0, -5,  5, 0, 5,
    -5, 0, -5,  5, 0, 5,  -5, 0, 5,
  ]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0]);
  return { vertices, normals, triCount: 2 };
}

describe('pointToTriangleDist', () => {
  it('returns zero distance for point on triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0, 5);
  });

  it('returns perpendicular distance for point above triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0.5, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.5, 5);
    expect(result.side).toBeGreaterThan(0);
  });

  it('returns perpendicular distance for point below triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, -0.3, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.3, 5);
    expect(result.side).toBeLessThan(0);
  });

  it('returns edge distance for point outside triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(2, 0, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(1.0, 5);
  });
});

describe('TriangleSpatialHash — validation', () => {
  it('throws when vertices.length < triCount * 9', () => {
    const mesh: CollisionMeshData = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0]), // only 6 floats, need 9
      normals: new Float32Array([0, 0, 1]),
      triCount: 1,
    };
    expect(() => new TriangleSpatialHash(mesh, 0.5)).toThrow(/vertices/i);
  });

  it('throws when normals.length < triCount * 3', () => {
    const mesh: CollisionMeshData = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0]), // only 2 floats, need 3
      triCount: 1,
    };
    expect(() => new TriangleSpatialHash(mesh, 0.5)).toThrow(/normals/i);
  });

  it('throws when triCount is negative', () => {
    const mesh: CollisionMeshData = {
      vertices: new Float32Array(9),
      normals: new Float32Array(3),
      triCount: -1,
    };
    expect(() => new TriangleSpatialHash(mesh, 0.5)).toThrow(/triCount/i);
  });

  it('accepts valid mesh with exact minimum sizes', () => {
    const mesh = makeFloorTriangle();
    expect(() => new TriangleSpatialHash(mesh, 0.5)).not.toThrow();
  });
});

describe('TriangleSpatialHash', () => {
  it('returns triangle index for nearby query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(0.25, 0.25, 0);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(0);
  });

  it('returns empty for far-away query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(100, 100, 100);
    expect(result.length).toBe(0);
  });

  it('handles multiple triangles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 1.0);
    const result = hash.query(0, 0, 0);
    expect(result.length).toBe(2);
  });
});

describe('solveTriangleCollision', () => {
  it('pushes particle below floor plane up to collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
  });

  it('does not move particle above collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, 1.0, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(1.0, 5);
  });

  it('skips pinned particles (invMass === 0)', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([0.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(-0.01, 5);
  });

  it('handles multiple particles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([
      0, -0.02, 0,
      0,  1.00, 0,
      0,  0.003, 0,
    ]);
    const invMass = new Float32Array([1.0, 1.0, 1.0]);
    solveTriangleCollision(pos, invMass, 3, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[4]).toBeCloseTo(1.0, 5);
    expect(pos[7]).toBeCloseTo(margin, 3);
  });

  it('applies friction to tangential velocity when prevPos provided', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    // Particle below floor, sliding in X
    const pos = new Float32Array([1.0, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0.5, prevPos);
    // Y should be pushed to margin
    expect(pos[1]).toBeCloseTo(margin, 3);
    // X should be partially dampened: original slide was 1.0, friction 0.5 removes half
    expect(pos[0]).toBeCloseTo(0.5, 1);
  });

  it('zero friction preserves tangential velocity', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([1.0, -0.01, 0]);
    const prevPos = new Float32Array([0.0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin, 0, prevPos);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[0]).toBeCloseTo(1.0, 3); // no friction dampening
  });

  it('backward-compatible: no friction/prevPos params works as before', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
  });
});

// Position-based friction in solveTriangleCollision is gated by BOTH
// `friction > 0` AND a defined `prevPos`. BUG-2 (#605) hit this gate at the
// caller side: wasmSolverWorker invoked solveTriangleCollision without
// prevPos, so per-body friction was silently a no-op. The fix at
// wasmSolverWorker.ts:289 wired prevView through; the tests below lock in the
// kernel-side contract so the regression cannot recur unnoticed.
describe('solveTriangleCollision — friction kernel (regression for BUG-2 #605)', () => {
  // Shared sliding-particle setup: tangential displacement of 1.0 along +X
  // while penetrating the floor plane (y = 0, normal +Y) by 0.01.
  const SLIDE_X = 1.0;
  const PENETRATION_Y = -0.01;
  const MARGIN = 0.005;

  function makeContactSetup() {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const pos = new Float32Array([SLIDE_X, PENETRATION_Y, 0]);
    const prevPos = new Float32Array([0.0, PENETRATION_Y, 0]);
    const invMass = new Float32Array([1.0]);
    return { mesh, hash, pos, prevPos, invMass };
  }

  it('friction > 0 with prevPos undefined is silently a no-op (BUG-2 shape)', () => {
    // This is the exact failure mode the WASM worker hit before #605 fix:
    // body.friction was non-zero, but prevPos was never threaded through, so
    // the kernel's `if (friction > 0 && prevPos)` guard fell through. The
    // particle gets pushed out of penetration normally but tangent slide is
    // untouched.
    const { mesh, hash, pos, invMass } = makeContactSetup();
    solveTriangleCollision(pos, invMass, 1, mesh, hash, MARGIN, 0.5 /* friction */);

    expect(pos[1]).toBeCloseTo(MARGIN, 3); // normal push still applied
    expect(pos[0]).toBeCloseTo(SLIDE_X, 5); // tangent NOT attenuated
  });

  it('friction > 0 with prevPos provided attenuates tangent displacement (positive control)', () => {
    // Pair to the previous test: same inputs, only difference is prevPos.
    // The result must differ — that is precisely the BUG-2 fix contract.
    const { mesh, hash, pos, prevPos, invMass } = makeContactSetup();
    solveTriangleCollision(pos, invMass, 1, mesh, hash, MARGIN, 0.5, prevPos);

    expect(pos[1]).toBeCloseTo(MARGIN, 3);
    // friction = 0.5 removes 0.5 * tangent. tangent ≈ SLIDE_X (the y-component
    // of the post-push displacement projects onto the normal, leaving x ≈ 1.0
    // on the tangent plane). Final x ≈ SLIDE_X * (1 - friction).
    expect(pos[0]).toBeLessThan(SLIDE_X); // attenuated
    expect(pos[0]).toBeGreaterThan(0); // not over-clamped to zero or beyond
    expect(pos[0]).toBeCloseTo(SLIDE_X * 0.5, 2);
  });

  it('friction = 0 with prevPos provided leaves tangent unchanged (gate predicate)', () => {
    // Documents the `friction > 0` half of the gate: even when prevPos is
    // provided, friction = 0 must short-circuit the tangential damping.
    const { mesh, hash, pos, prevPos, invMass } = makeContactSetup();
    solveTriangleCollision(pos, invMass, 1, mesh, hash, MARGIN, 0 /* friction */, prevPos);

    expect(pos[1]).toBeCloseTo(MARGIN, 3);
    expect(pos[0]).toBeCloseTo(SLIDE_X, 5);
  });

  it('friction is a no-op when particle is outside margin (no contact)', () => {
    // The friction branch lives inside the contact-detected block, so a
    // non-penetrating particle must not see any tangential damping even when
    // friction > 0 and prevPos is provided. Locks in that the kernel does not
    // apply drag in free flight.
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const pos = new Float32Array([SLIDE_X, 1.0, 0]); // 1m above floor, far above margin
    const prevPos = new Float32Array([0.0, 1.0, 0]);
    const invMass = new Float32Array([1.0]);

    solveTriangleCollision(pos, invMass, 1, mesh, hash, MARGIN, 1.0 /* high friction */, prevPos);

    expect(pos[0]).toBeCloseTo(SLIDE_X, 5); // tangent untouched
    expect(pos[1]).toBeCloseTo(1.0, 5); // position untouched
  });

  it('5-pass loop with refreshed prevPos attenuates inter-iteration tangent drift', () => {
    // Mirrors the call site pattern at wasmSolverWorker.ts:659-678 (handler
    // for 'applyInitialTriangleCollision'): 5 outer passes with prev set from
    // a snapshot, refreshed via prev.set(positions) between iterations. In
    // the real worker, inter-pass drift originates from multi-body push
    // conflicts. Here we inject synthetic tangent each pass so a single body
    // is sufficient to observe friction's attenuation contract under the
    // refresh structure.
    function run5Pass(friction: number): Float32Array {
      const mesh = makeFloorPlane();
      const hash = new TriangleSpatialHash(mesh, 2.0);
      const pos = new Float32Array([0, PENETRATION_Y, 0]);
      const invMass = new Float32Array([1.0]);
      const prev = pos.slice();
      for (let i = 0; i < 5; i++) {
        pos[0] += 0.2;
        pos[1] = PENETRATION_Y;
        solveTriangleCollision(pos, invMass, 1, mesh, hash, MARGIN, friction, prev);
        prev.set(pos);
      }
      return pos;
    }

    const withFriction = run5Pass(0.5);
    const withoutFriction = run5Pass(0);

    expect(withFriction[1]).toBeCloseTo(MARGIN, 3);
    expect(withoutFriction[1]).toBeCloseTo(MARGIN, 3);
    expect(withFriction[0]).toBeLessThan(withoutFriction[0]);
    expect(withoutFriction[0]).toBeCloseTo(1.0, 5); // 5 * 0.2 with no damping
    expect(withFriction[0]).toBeCloseTo(0.5, 2);    // half-attenuated each pass
  });
});

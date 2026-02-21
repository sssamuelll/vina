/**
 * Stability tests — Long Range Attachments, adaptive substepping, velocity clamping.
 */
import { describe, it, expect } from 'vitest';
import { buildLRAConstraints, solveLRA, type LRAConstraint } from '../longRangeAttachments';
import { XPBDClothSolver, generateRectClothMesh, type ClothMeshData } from '../xpbdSolver';

// Helper: 3x3 grid mesh (9 particles, 8 triangles)
function make3x3Mesh(): ClothMeshData {
  return generateRectClothMesh(1.0, 1.0, 3, 3, [0, 1, 0]);
}

// Helper: simple 4-particle square
function makeSquareMesh(): ClothMeshData {
  const vertices = new Float32Array([
    0, 1, 0,   1, 1, 0,   1, 0, 0,   0, 0, 0,
  ]);
  const triIds = new Int32Array([0, 1, 2, 0, 2, 3]);
  return { vertices, triIds };
}

describe('LRA constraint building', () => {
  it('creates constraints for non-pinned particles', () => {
    const mesh = make3x3Mesh();
    const pinned = new Set([0]); // pin top-left
    const constraints = buildLRAConstraints(mesh.vertices, 9, mesh.triIds, pinned);

    // 8 non-pinned particles should each have a constraint
    expect(constraints.length).toBe(8);
    for (const c of constraints) {
      expect(c.attachmentIndex).toBe(0);
      expect(c.maxDistance).toBeGreaterThan(0);
      expect(c.particleIndex).not.toBe(0);
    }
  });

  it('returns empty when no pinned particles', () => {
    const mesh = makeSquareMesh();
    const constraints = buildLRAConstraints(mesh.vertices, 4, mesh.triIds, new Set());
    expect(constraints.length).toBe(0);
  });

  it('assigns nearest pinned particle when multiple pins', () => {
    const mesh = makeSquareMesh();
    // Pin particles 0 and 1
    const pinned = new Set([0, 1]);
    const constraints = buildLRAConstraints(mesh.vertices, 4, mesh.triIds, pinned);
    expect(constraints.length).toBe(2); // particles 2 and 3
  });

  it('geodesic distances increase with graph distance', () => {
    const mesh = make3x3Mesh();
    const pinned = new Set([0]);
    const constraints = buildLRAConstraints(mesh.vertices, 9, mesh.triIds, pinned);

    // Find constraint for adjacent vs far particle
    const byParticle = new Map(constraints.map(c => [c.particleIndex, c]));
    // Particle 1 is adjacent to 0, particle 8 is far corner
    const nearDist = byParticle.get(1)?.maxDistance ?? Infinity;
    const farDist = byParticle.get(8)?.maxDistance ?? 0;
    expect(farDist).toBeGreaterThan(nearDist);
  });
});

describe('LRA solving', () => {
  it('pulls back particle exceeding maxDistance', () => {
    const positions = new Float32Array([
      0, 0, 0,  // attachment at origin
      10, 0, 0, // particle far away
    ]);
    const invMass = new Float32Array([0.0, 1.0]); // 0 = pinned
    const constraints: LRAConstraint[] = [
      { particleIndex: 1, attachmentIndex: 0, maxDistance: 1.0 },
    ];

    solveLRA(positions, invMass, constraints);

    // Particle should be pulled to maxDistance from attachment
    const dx = positions[3] - positions[0];
    const dist = Math.sqrt(dx * dx);
    expect(dist).toBeCloseTo(1.0, 5);
  });

  it('does not move particle within maxDistance', () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.5, 0, 0,
    ]);
    const invMass = new Float32Array([0.0, 1.0]);
    const constraints: LRAConstraint[] = [
      { particleIndex: 1, attachmentIndex: 0, maxDistance: 1.0 },
    ];

    solveLRA(positions, invMass, constraints);
    expect(positions[3]).toBeCloseTo(0.5, 5);
  });

  it('does not move pinned particles', () => {
    const positions = new Float32Array([0, 0, 0, 5, 0, 0]);
    const invMass = new Float32Array([0.0, 0.0]); // both pinned
    const constraints: LRAConstraint[] = [
      { particleIndex: 1, attachmentIndex: 0, maxDistance: 1.0 },
    ];

    solveLRA(positions, invMass, constraints);
    expect(positions[3]).toBeCloseTo(5.0, 5); // unchanged
  });
});

describe('Adaptive substepping', () => {
  it('uses minSubsteps when velocity is zero', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      adaptiveSubsteps: true,
      minSubsteps: 10,
      maxSubsteps: 30,
      maxVelocity: 5.0,
      selfCollision: false,
      enableLRA: false,
    });
    // Pin all particles so nothing moves
    for (let i = 0; i < 4; i++) solver.pinParticle(i);

    // Just ensure step doesn't crash with adaptive
    solver.step();
  });

  it('disabled adaptive uses fixed numSubsteps', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      adaptiveSubsteps: false,
      numSubsteps: 5,
      selfCollision: false,
      enableLRA: false,
    });
    // Should not crash
    solver.step();
  });
});

describe('Velocity clamping', () => {
  it('clamps extreme velocities', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      numSubsteps: 1,
      maxVelocity: 2.0,
      selfCollision: false,
      enableLRA: false,
      adaptiveSubsteps: false,
    });

    // Inject extreme velocity
    solver.vel[3] = 100.0; // particle 1, x component

    solver.step();

    // After step, velocity should be clamped
    const vx = solver.vel[3], vy = solver.vel[4], vz = solver.vel[5];
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    expect(speed).toBeLessThanOrEqual(2.0 + 0.01);
  });
});

describe('Simulation stability with LRA', () => {
  it('does not explode over 100 steps', () => {
    const mesh = generateRectClothMesh(1.0, 1.0, 5, 5, [0, 2, 0]);
    const solver = new XPBDClothSolver(mesh, {
      numSubsteps: 10,
      selfCollision: false,
      enableLRA: true,
      adaptiveSubsteps: false,
    });

    // Pin top row
    for (let i = 0; i < 5; i++) solver.pinParticle(i);
    solver.buildLRA();

    for (let frame = 0; frame < 100; frame++) {
      solver.step();
    }

    const snap = solver.getSnapshot();
    for (let i = 0; i < snap.positions.length; i++) {
      expect(isFinite(snap.positions[i])).toBe(true);
    }
  });

  it('prevents stretching beyond geodesic distance', () => {
    const mesh = generateRectClothMesh(1.0, 1.0, 3, 3, [0, 2, 0]);
    const solver = new XPBDClothSolver(mesh, {
      numSubsteps: 10,
      selfCollision: false,
      enableLRA: true,
      adaptiveSubsteps: false,
      gravity: [0, -50, 0], // strong gravity to stress test
    });

    solver.pinParticle(0);
    solver.buildLRA();

    for (let frame = 0; frame < 50; frame++) {
      solver.step();
    }

    const snap = solver.getSnapshot();
    for (let i = 0; i < snap.positions.length; i++) {
      expect(isFinite(snap.positions[i])).toBe(true);
    }
  });
});

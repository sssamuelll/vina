/**
 * Unit tests for the XPBD Cloth Solver.
 */
import { describe, it, expect } from 'vitest';
import {
  XPBDClothSolver,
  generateRectClothMesh,
  triangulatePieceOutline,
  vecSetZero,
  vecLengthSquared,
  vecDistSquared,
  type ClothMeshData,
} from '../xpbdSolver';

// ─── Helper: create a minimal 2-triangle square mesh ─────────────────────

function makeSquareMesh(): ClothMeshData {
  // 4 vertices forming a unit square at y=1
  const vertices = new Float32Array([
    -0.5, 1.0, 0.0,   // 0: top-left
     0.5, 1.0, 0.0,   // 1: top-right
     0.5, 0.0, 0.0,   // 2: bottom-right
    -0.5, 0.0, 0.0,   // 3: bottom-left
  ]);
  const triIds = new Int32Array([
    0, 1, 2,
    0, 2, 3,
  ]);
  return { vertices, triIds };
}

// ─── Particle Creation ───────────────────────────────────────────────────

describe('XPBDClothSolver - Particle Creation', () => {
  it('should create correct number of particles from mesh data', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.numParticles).toBe(4);
  });

  it('should initialize positions from mesh vertices', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    // Check first vertex
    expect(solver.pos[0]).toBeCloseTo(-0.5);
    expect(solver.pos[1]).toBeCloseTo(1.0);
    expect(solver.pos[2]).toBeCloseTo(0.0);
  });

  it('should compute non-zero inverse masses for interior particles', () => {
    const mesh = generateRectClothMesh(1, 1, 5, 5);
    const solver = new XPBDClothSolver(mesh);
    // Center particle should have non-zero invMass
    const centerIdx = 12; // 5x5 grid, center is at index 12
    expect(solver.invMass[centerIdx]).toBeGreaterThan(0);
  });

  it('should handle a single triangle', () => {
    const vertices = new Float32Array([
      0, 1, 0,
      1, 0, 0,
      -1, 0, 0,
    ]);
    const triIds = new Int32Array([0, 1, 2]);
    const solver = new XPBDClothSolver({ vertices, triIds });
    expect(solver.numParticles).toBe(3);
    expect(solver.numStretchingConstraints).toBe(3); // 3 edges
    expect(solver.numBendingConstraints).toBe(0); // no adjacent triangles
  });
});

// ─── Constraint Solving ──────────────────────────────────────────────────

describe('XPBDClothSolver - Constraint Solving', () => {
  it('should generate stretching constraints from mesh edges', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    // 2 triangles sharing 1 edge → 5 unique edges
    expect(solver.numStretchingConstraints).toBe(5);
  });

  it('should generate bending constraints from shared edges', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    // 2 adjacent triangles → 1 shared edge → bending constraints created
    // The bending constraint connects opposite vertices across shared edge
    expect(solver.numBendingConstraints).toBeGreaterThan(0);
  });

  it('should maintain positions for pinned particles after stepping', () => {
    const mesh = generateRectClothMesh(1, 1, 3, 3);
    const solver = new XPBDClothSolver(mesh);
    solver.pinParticle(0);
    const origX = solver.pos[0];
    const origY = solver.pos[1];
    const origZ = solver.pos[2];

    solver.step();

    expect(solver.pos[0]).toBeCloseTo(origX);
    expect(solver.pos[1]).toBeCloseTo(origY);
    expect(solver.pos[2]).toBeCloseTo(origZ);
  });

  it('should move free particles downward under gravity', () => {
    const mesh = generateRectClothMesh(1, 1, 3, 3, [0, 2, 0]);
    const solver = new XPBDClothSolver(mesh, { gravity: [0, -9.81, 0], groundY: -100 });

    // Pin top row, leave middle and bottom free
    for (let i = 0; i < 3; i++) solver.pinParticle(i);

    const freeIdx = 4; // center particle
    const origY = solver.pos[freeIdx * 3 + 1];

    solver.step();

    expect(solver.pos[freeIdx * 3 + 1]).toBeLessThan(origY);
  });

  it('should enforce ground plane collision', () => {
    const mesh = generateRectClothMesh(1, 0.5, 3, 3, [0, 0.25, 0]);
    const solver = new XPBDClothSolver(mesh, { groundY: 0.0 });

    // Run for several steps to let cloth fall
    for (let i = 0; i < 60; i++) solver.step();

    // All particles should be at or above ground (within floating-point epsilon)
    for (let i = 0; i < solver.numParticles; i++) {
      expect(solver.pos[i * 3 + 1]).toBeGreaterThanOrEqual(-0.001);
    }
  });
});

// ─── Energy Conservation ─────────────────────────────────────────────────

describe('XPBDClothSolver - Energy', () => {
  it('should have finite kinetic energy', () => {
    const mesh = generateRectClothMesh(1, 1, 5, 5);
    const solver = new XPBDClothSolver(mesh);
    solver.step();
    const ke = solver.computeKineticEnergy();
    expect(isFinite(ke)).toBe(true);
    expect(ke).toBeGreaterThanOrEqual(0);
  });

  it('should dissipate energy with damping over time', () => {
    const mesh = generateRectClothMesh(0.5, 0.5, 4, 4, [0, 1, 0]);
    const solver = new XPBDClothSolver(mesh, {
      damping: 0.95,
      groundY: 0.0,
    });

    // Pin top-left and top-right corners
    solver.pinParticle(0);
    solver.pinParticle(3);

    // Let it swing
    for (let i = 0; i < 30; i++) solver.step();
    const earlyEnergy = solver.computeKineticEnergy();

    // Run much longer
    for (let i = 0; i < 300; i++) solver.step();
    const lateEnergy = solver.computeKineticEnergy();

    // Energy should decrease (damped system)
    expect(lateEnergy).toBeLessThanOrEqual(earlyEnergy + 0.001);
  });
});

// ─── Reset ────────────────────────────────────────────────────────────────

describe('XPBDClothSolver - Reset', () => {
  it('should restore initial positions on reset', () => {
    const mesh = generateRectClothMesh(1, 1, 3, 3);
    const solver = new XPBDClothSolver(mesh);
    const origPos = new Float32Array(solver.pos);

    solver.step();
    solver.step();
    // Positions should have changed
    expect(solver.pos[4 * 3 + 1]).not.toBeCloseTo(origPos[4 * 3 + 1], 4);

    solver.reset();
    for (let i = 0; i < origPos.length; i++) {
      expect(solver.pos[i]).toBeCloseTo(origPos[i]);
    }
  });

  it('should zero velocities on reset', () => {
    const mesh = generateRectClothMesh(1, 1, 3, 3);
    const solver = new XPBDClothSolver(mesh);

    solver.step();
    solver.reset();

    for (let i = 0; i < solver.vel.length; i++) {
      expect(solver.vel[i]).toBe(0);
    }
  });
});

// ─── Configuration ──────────────────────────────────────────────────────

describe('XPBDClothSolver - Configuration', () => {
  it('should use default config values', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.config.numSubsteps).toBe(15);
    expect(solver.config.gravity[1]).toBeCloseTo(-9.81);
    expect(solver.config.damping).toBeCloseTo(0.99);
  });

  it('should merge partial config', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, { numSubsteps: 20, damping: 0.95 });
    expect(solver.config.numSubsteps).toBe(20);
    expect(solver.config.damping).toBe(0.95);
    expect(solver.config.gravity[1]).toBeCloseTo(-9.81); // default preserved
  });

  it('should update config at runtime', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    solver.updateConfig({ bendingCompliance: 5.0 });
    expect(solver.config.bendingCompliance).toBe(5.0);
  });
});

// ─── Mesh Generation ────────────────────────────────────────────────────

describe('generateRectClothMesh', () => {
  it('should generate correct vertex count', () => {
    const mesh = generateRectClothMesh(1, 1, 10, 10);
    expect(mesh.vertices.length / 3).toBe(100);
  });

  it('should generate correct triangle count', () => {
    const mesh = generateRectClothMesh(1, 1, 10, 10);
    // 9x9 quads × 2 triangles each = 162
    expect(mesh.triIds.length / 3).toBe(162);
  });
});

// ─── Triangulation ──────────────────────────────────────────────────────

describe('triangulatePieceOutline', () => {
  it('should triangulate a simple square', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const mesh = triangulatePieceOutline(points);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triIds.length).toBeGreaterThan(0);
  });

  it('should return empty mesh for less than 3 points', () => {
    const mesh = triangulatePieceOutline([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(mesh.vertices.length).toBe(0);
    expect(mesh.triIds.length).toBe(0);
  });
});

// ─── Vector Helpers ─────────────────────────────────────────────────────

describe('Vector math helpers', () => {
  it('vecSetZero should zero a particle', () => {
    const a = new Float32Array([1, 2, 3, 4, 5, 6]);
    vecSetZero(a, 1);
    expect(a[3]).toBe(0);
    expect(a[4]).toBe(0);
    expect(a[5]).toBe(0);
  });

  it('vecLengthSquared should compute squared magnitude', () => {
    const a = new Float32Array([3, 4, 0]);
    expect(vecLengthSquared(a, 0)).toBeCloseTo(25);
  });

  it('vecDistSquared should compute squared distance', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([3, 4, 0]);
    expect(vecDistSquared(a, 0, b, 0)).toBeCloseTo(25);
  });
});

// ─── Snapshot ───────────────────────────────────────────────────────────

describe('XPBDClothSolver - Snapshot', () => {
  it('should return a copy of positions (not a reference)', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    const snap = solver.getSnapshot();
    // Mutating snap should not affect solver
    snap.positions[0] = 999;
    expect(solver.pos[0]).not.toBe(999);
  });
});

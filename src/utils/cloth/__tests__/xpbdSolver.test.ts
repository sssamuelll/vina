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

// ─── Anisotropic Stretch ────────────────────────────────────────────────

describe('XPBDClothSolver - Anisotropic Stretch', () => {
  it('should have anisotropic stretch config properties', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.001,
      stretchComplianceShear: 0.01,
    });
    expect(solver.config.stretchComplianceWarp).toBe(0.0);
    expect(solver.config.stretchComplianceWeft).toBe(0.001);
    expect(solver.config.stretchComplianceShear).toBe(0.01);
  });

  it('should use default anisotropic values', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.config.stretchComplianceWarp).toBe(0.0);
    expect(solver.config.stretchComplianceWeft).toBe(0.0);
    expect(solver.config.stretchComplianceShear).toBe(0.001);
  });

  it('shear direction should stretch more than warp/weft with same force', () => {
    // Create a mesh with UV coordinates for proper edge classification
    // Simple square: 4 vertices with UVs
    const positions = new Float32Array([
      0, 0, 0,   // v0: bottom-left
      1, 0, 0,   // v1: bottom-right
      1, 1, 0,   // v2: top-right
      0, 1, 0,   // v3: top-left
    ]);
    const triIds = new Int32Array([0, 1, 2, 0, 2, 3]); // Two triangles
    const uvs = new Float32Array([
      0, 0,  // v0 UV
      1, 0,  // v1 UV
      1, 1,  // v2 UV
      0, 1,  // v3 UV
    ]);

    const mesh: ClothMeshData = { vertices: positions, triIds, uvs };

    // Config: stiff in warp/weft, stretchy in shear
    const solver = new XPBDClothSolver(mesh, {
      stretchComplianceWarp: 0.0,    // Very stiff
      stretchComplianceWeft: 0.0,    // Very stiff
      stretchComplianceShear: 0.1,   // Much more compliant
      gravity: [0, -9.81, 0],
      damping: 0.99,
      numSubsteps: 15,
    });

    // Pin top-left corner
    solver.pinParticle(3);

    // Simulate several frames
    for (let i = 0; i < 30; i++) {
      solver.step();
    }

    // Get final positions
    const pos = solver.pos;

    // The diagonal edge (0-2 or 1-3) should have stretched more than
    // horizontal edge (0-1) or vertical edge (0-3 or 1-2)

    // Compute current edge lengths
    const horizontalLen = Math.sqrt(
      (pos[3] - pos[0]) ** 2 + (pos[4] - pos[1]) ** 2 + (pos[5] - pos[2]) ** 2
    ); // v0-v1 horizontal

    const verticalLen = Math.sqrt(
      (pos[9] - pos[0]) ** 2 + (pos[10] - pos[1]) ** 2 + (pos[11] - pos[2]) ** 2
    ); // v0-v3 vertical

    const diagonalLen = Math.sqrt(
      (pos[6] - pos[0]) ** 2 + (pos[7] - pos[1]) ** 2 + (pos[8] - pos[2]) ** 2
    ); // v0-v2 diagonal

    // Original lengths
    const origHorizontal = 1.0;
    const origVertical = 1.0;
    const origDiagonal = Math.sqrt(2);

    // Compute strain (stretch ratio)
    const strainHorizontal = (horizontalLen - origHorizontal) / origHorizontal;
    const strainVertical = (verticalLen - origVertical) / origVertical;
    const strainDiagonal = (diagonalLen - origDiagonal) / origDiagonal;

    // Diagonal (shear) should have more strain than warp/weft
    // since it has higher compliance
    expect(Math.abs(strainDiagonal)).toBeGreaterThan(Math.abs(strainHorizontal) * 0.5);
    expect(Math.abs(strainDiagonal)).toBeGreaterThan(Math.abs(strainVertical) * 0.5);
  });
});

// ─── Anisotropic Bending ─────────────────────────────────────────────────

describe('XPBDClothSolver - Anisotropic Bending', () => {
  it('should have anisotropic bending config properties', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      bendComplianceWarp: 0.5,
      bendComplianceWeft: 1.0,
    });
    expect(solver.config.bendComplianceWarp).toBe(0.5);
    expect(solver.config.bendComplianceWeft).toBe(1.0);
  });

  it('should use default anisotropic bending values', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    // P1 angular: default 1e4, calibrado contra el gate Cusick (banda [6e2,1e5])
    expect(solver.config.bendComplianceWarp).toBe(1e4);
    expect(solver.config.bendComplianceWeft).toBe(1e4);
  });
});

// ─── Air Drag ───────────────────────────────────────────────────────────

// ─── Internal Damping ────────────────────────────────────────────────────

describe('XPBDClothSolver - Internal Damping', () => {
  it('should have internalDamping in config with default value', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.config.internalDamping).toBe(0.3);
  });

  it('should accept custom internalDamping value', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, { internalDamping: 0.8 });
    expect(solver.config.internalDamping).toBe(0.8);
  });
});

// ─── Air Drag ───────────────────────────────────────────────────────────

describe('XPBDClothSolver - Air Drag', () => {
  it('should have dragCoefficient in default config', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh);
    expect(solver.config.dragCoefficient).toBe(1.0);
  });

  it('should accept custom dragCoefficient', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, { dragCoefficient: 0.5 });
    expect(solver.config.dragCoefficient).toBe(0.5);
  });

  it('should slow down fast-moving cloth with drag enabled', () => {
    const mesh = makeSquareMesh();
    const solverWithDrag = new XPBDClothSolver(mesh, {
      dragCoefficient: 2.0,
      damping: 1.0, // Disable regular damping to isolate drag effect
      gravity: [0, 0, 0], // Disable gravity
      selfCollision: false, // Disable self-collision
      maxVelocity: 100, // High limit to avoid clamping
      groundY: -100, // Move ground far away to avoid interference
    });

    const solverNoDrag = new XPBDClothSolver(mesh, {
      dragCoefficient: 0.0,
      damping: 1.0, // Disable regular damping
      gravity: [0, 0, 0], // Disable gravity
      selfCollision: false, // Disable self-collision
      maxVelocity: 100, // High limit to avoid clamping
      groundY: -100, // Move ground far away to avoid interference
    });

    // Give all particles velocity perpendicular to cloth surface (Z direction)
    // The cloth is in the XY plane, so the normal is in Z direction
    // Air drag is only effective when cloth moves perpendicular to its surface
    for (let i = 0; i < solverWithDrag.numParticles; i++) {
      solverWithDrag.vel[i * 3 + 2] = 5.0; // 5 m/s in +Z direction
      solverNoDrag.vel[i * 3 + 2] = 5.0;
    }

    solverWithDrag.step();
    solverNoDrag.step();

    const keWithDrag = solverWithDrag.computeKineticEnergy();
    const keNoDrag = solverNoDrag.computeKineticEnergy();

    // Drag should reduce kinetic energy more than no drag
    expect(keWithDrag).toBeLessThan(keNoDrag);
  });

  it('should not affect cloth when dragCoefficient is 0', () => {
    const mesh = makeSquareMesh();
    const solver = new XPBDClothSolver(mesh, {
      dragCoefficient: 0.0,
      damping: 1.0, // No regular damping
      internalDamping: 0.0, // No internal damping
      gravity: [0, 0, 0], // No gravity
      selfCollision: false, // Disable self-collision
      groundY: -100, // Move ground far away to avoid interference
    });

    // Give all particles downward velocity
    for (let i = 0; i < solver.numParticles; i++) {
      solver.vel[i * 3 + 1] = -5.0;
    }

    const initialKE = solver.computeKineticEnergy();
    solver.step();
    const finalKE = solver.computeKineticEnergy();

    // With zero drag coefficient, kinetic energy should be unchanged
    // (or very close - constraints may affect it slightly)
    expect(finalKE).toBeCloseTo(initialKE, 1);
  });

  it('cloth should settle faster with higher drag coefficient', () => {
    // Create separate mesh instances for each solver to avoid shared state
    // Use a cloth positioned in XY plane so perpendicular motion (Z) shows drag effect
    const meshLow = generateRectClothMesh(0.5, 0.5, 5, 5, [0, 0, 0]);
    const meshHigh = generateRectClothMesh(0.5, 0.5, 5, 5, [0, 0, 0]);

    // Low drag - disable regular damping to isolate air drag effect
    const solverLow = new XPBDClothSolver(meshLow, {
      dragCoefficient: 0.1,
      damping: 1.0,     // No velocity damping
      gravity: [0, 0, 0], // No gravity - we'll use initial velocity
      groundY: -100,    // Move ground far away
      selfCollision: false,
      maxVelocity: 100,
      maxStrain: 0,     // aísla el drag del hard strain cap (backport A7)
    });
    solverLow.pinParticle(0);
    solverLow.pinParticle(4);

    // High drag
    const solverHigh = new XPBDClothSolver(meshHigh, {
      dragCoefficient: 2.0,
      damping: 1.0,
      gravity: [0, 0, 0],
      groundY: -100,
      selfCollision: false,
      maxVelocity: 100,
      maxStrain: 0,     // aísla el drag del hard strain cap (backport A7)
    });
    solverHigh.pinParticle(0);
    solverHigh.pinParticle(4);

    // Give all non-pinned particles initial velocity perpendicular to cloth
    // The cloth is in XY plane, so Z velocity is perpendicular
    for (let i = 0; i < solverLow.numParticles; i++) {
      if (solverLow.invMass[i] > 0) {
        solverLow.vel[i * 3 + 2] = 5.0; // Z velocity
      }
      if (solverHigh.invMass[i] > 0) {
        solverHigh.vel[i * 3 + 2] = 5.0;
      }
    }

    // Simulate and measure kinetic energy decay
    for (let i = 0; i < 30; i++) {
      solverLow.step();
      solverHigh.step();
    }

    const keLow = solverLow.computeKineticEnergy();
    const keHigh = solverHigh.computeKineticEnergy();

    // Higher drag should result in lower kinetic energy (more settled)
    expect(keHigh).toBeLessThan(keLow);
  });
});

// ─── Triangle Collision ─────────────────────────────────────────────────

describe('Triangle collision (BVH)', () => {
  it('pushes particle inside body outward when collisionMesh is set', () => {
    // Collision body: a large flat floor at y=0 with normals pointing up
    const collisionMesh = {
      vertices: new Float32Array([
        -5, 0, -5,  5, 0, -5,  5, 0, 5,
        -5, 0, -5,  5, 0, 5,  -5, 0, 5,
      ]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0]),
      triCount: 2,
    };

    // Cloth mesh: a small triangle with one vertex below the collision floor.
    // We need at least one triangle so particles get non-zero invMass.
    const meshData: ClothMeshData = {
      vertices: new Float32Array([
        0, -0.001, 0,   // v0: slightly below the collision floor
        0.01, -0.001, 0, // v1: also below
        0, -0.001, 0.01, // v2: also below
      ]),
      triIds: new Int32Array([0, 1, 2]),
    };

    const solver = new XPBDClothSolver(meshData, {
      gravity: [0, 0, 0],       // no gravity — isolate collision effect
      groundY: -100,             // move ground far away
      selfCollision: false,
    });
    solver.setCollisionMesh(collisionMesh);
    solver.step();

    const positions = solver.getPositions();
    // All three vertices should have been pushed above y=0 by the collision solver
    expect(positions[1]).toBeGreaterThanOrEqual(0);
    expect(positions[4]).toBeGreaterThanOrEqual(0);
    expect(positions[7]).toBeGreaterThanOrEqual(0);
  });
});

describe('XPBDClothSolver — constraint validation', () => {
  it('throws when triangle IDs reference out-of-bounds particles', () => {
    // 2 vertices but triangle references particle ID 999
    const mesh: ClothMeshData = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0]),
      triIds: new Int32Array([0, 1, 999]), // 999 is out of bounds
    };
    expect(() => new XPBDClothSolver(mesh)).toThrow(/out of bounds/i);
  });

  it('accepts valid mesh without throwing', () => {
    const mesh = makeSquareMesh();
    expect(() => new XPBDClothSolver(mesh)).not.toThrow();
  });
});

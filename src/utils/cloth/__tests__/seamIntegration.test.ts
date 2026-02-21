/**
 * Integration tests for seam assembly in the XPBD solver.
 */

import { describe, it, expect } from 'vitest';
import { XPBDClothSolver, generateRectClothMesh } from '../xpbdSolver';
import {
  mergeMeshes,
  isFullySewn,
  DEFAULT_SEAM_CONFIG,
  type SeamConstraintSet,
  type MergedMesh,
} from '../seamAssembly';

/**
 * Helper: create two small rect meshes side by side and merge them.
 */
function createTwoPieceMergedMesh(): {
  merged: MergedMesh;
  solver: XPBDClothSolver;
} {
  // Piece A: 3x3 grid at x=-0.3
  const meshA = generateRectClothMesh(0.2, 0.2, 3, 3, [-0.15, 1.0, 0]);
  // Piece B: 3x3 grid at x=+0.3
  const meshB = generateRectClothMesh(0.2, 0.2, 3, 3, [0.15, 1.0, 0]);

  const merged = mergeMeshes([
    { pieceId: 'pieceA', vertices: meshA.vertices, triIds: meshA.triIds },
    { pieceId: 'pieceB', vertices: meshB.vertices, triIds: meshB.triIds },
  ]);

  const solver = new XPBDClothSolver(
    { vertices: merged.vertices, triIds: merged.triIds },
    { numSubsteps: 5, gravity: [0, 0, 0], dt: 1 / 60 }, // no gravity for controlled test
  );

  return { merged, solver };
}

/**
 * Helper: build a simple seam constraint set manually (connecting rightmost
 * column of piece A to leftmost column of piece B).
 */
function buildManualSeamConstraints(merged: MergedMesh): SeamConstraintSet {
  const offsetA = merged.pieces[0].vertexOffset;
  const offsetB = merged.pieces[1].vertexOffset;

  // Piece A: 3x3 grid, rightmost column = indices 2, 5, 8
  // Piece B: 3x3 grid, leftmost column = indices 0, 3, 6
  const pairsA = [2, 5, 8].map(i => i + offsetA);
  const pairsB = [0, 3, 6].map(i => i + offsetB);

  const count = 3;
  const ids = new Int32Array(count * 2);
  const restLengths = new Float32Array(count);
  const compliances = new Float32Array(count);
  const positions = merged.vertices;

  for (let i = 0; i < count; i++) {
    ids[2 * i] = pairsA[i];
    ids[2 * i + 1] = pairsB[i];

    const ai = pairsA[i] * 3;
    const bi = pairsB[i] * 3;
    const dx = positions[ai] - positions[bi];
    const dy = positions[ai + 1] - positions[bi + 1];
    const dz = positions[ai + 2] - positions[bi + 2];
    restLengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    compliances[i] = 0.0001;
  }

  return { ids, restLengths, compliances, count, config: DEFAULT_SEAM_CONFIG };
}

describe('Seam Integration with XPBDClothSolver', () => {
  it('should create a merged mesh solver without crashing', () => {
    const { solver, merged } = createTwoPieceMergedMesh();
    expect(solver.numParticles).toBe(18); // 9 + 9
    expect(merged.pieces).toHaveLength(2);
  });

  it('should step the merged solver with seam constraints without crashing', () => {
    const { solver, merged } = createTwoPieceMergedMesh();
    const seamSet = buildManualSeamConstraints(merged);
    solver.setSeamConstraints(seamSet);

    // Run 10 frames
    for (let i = 0; i < 10; i++) {
      solver.step();
    }

    const snap = solver.getSnapshot();
    expect(snap.positions.length).toBe(18 * 3);
    // Positions should have changed (solver ran)
    expect(snap.positions).not.toEqual(merged.vertices);
  });

  it('should reduce seam rest lengths over steps', () => {
    const { solver, merged } = createTwoPieceMergedMesh();
    const seamSet = buildManualSeamConstraints(merged);
    const initialRestLengths = new Float32Array(seamSet.restLengths);

    solver.setSeamConstraints(seamSet);

    // Step multiple frames
    for (let i = 0; i < 30; i++) {
      solver.step();
    }

    // Rest lengths should have shrunk
    for (let i = 0; i < seamSet.count; i++) {
      expect(seamSet.restLengths[i]).toBeLessThan(initialRestLengths[i]);
    }
  });

  it('should reach fully sewn state after enough steps', () => {
    const { solver, merged } = createTwoPieceMergedMesh();

    // Use a fast shrink factor for testing
    const config = { ...DEFAULT_SEAM_CONFIG, shrinkFactor: 0.9 };
    const seamSet = buildManualSeamConstraints(merged);
    seamSet.config = config;

    solver.setSeamConstraints(seamSet);

    expect(isFullySewn(seamSet)).toBe(false);

    // Run many steps with aggressive shrinking
    for (let i = 0; i < 200; i++) {
      solver.step();
    }

    expect(isFullySewn(seamSet)).toBe(true);
  });

  it('should work without seam constraints (backward compatible)', () => {
    const mesh = generateRectClothMesh(0.3, 0.3, 5, 5, [0, 1.2, 0]);
    const solver = new XPBDClothSolver(mesh, { numSubsteps: 3 });

    // Should step fine without seam constraints
    for (let i = 0; i < 5; i++) {
      solver.step();
    }

    const snap = solver.getSnapshot();
    expect(snap.numParticles).toBe(25);
  });

  it('should allow clearing seam constraints', () => {
    const { solver, merged } = createTwoPieceMergedMesh();
    const seamSet = buildManualSeamConstraints(merged);
    solver.setSeamConstraints(seamSet);
    solver.step();

    // Clear constraints
    solver.setSeamConstraints(null);
    // Should still step without error
    solver.step();
    const snap = solver.getSnapshot();
    expect(snap.positions.length).toBe(18 * 3);
  });
});

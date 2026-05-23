import { describe, it, expect } from 'vitest';
import { SpatialHashGrid, buildAdjacency, solveSelfCollision } from '../selfCollision';

describe('buildAdjacency', () => {
  it('returns correct adjacency sets for a single triangle', () => {
    const triIds = new Int32Array([0, 1, 2]);
    const adj = buildAdjacency(triIds, 3);
    expect(adj[0].has(1)).toBe(true);
    expect(adj[0].has(2)).toBe(true);
    expect(adj[1].has(0)).toBe(true);
    expect(adj[1].has(2)).toBe(true);
    expect(adj[2].has(0)).toBe(true);
    expect(adj[2].has(1)).toBe(true);
  });

  it('particles not sharing a triangle are not adjacent', () => {
    // Two separate triangles: (0,1,2) and (3,4,5)
    const triIds = new Int32Array([0, 1, 2, 3, 4, 5]);
    const adj = buildAdjacency(triIds, 6);
    expect(adj[0].has(3)).toBe(false);
    expect(adj[3].has(0)).toBe(false);
  });
});

describe('SpatialHashGrid', () => {
  it('build + query returns particles in the same cell', () => {
    const grid = new SpatialHashGrid(1.0);
    // Two particles at nearly the same position
    const positions = new Float32Array([0.1, 0.1, 0.1, 0.2, 0.2, 0.2]);
    grid.build(positions, 2);
    const result = grid.queryArray(0.1, 0.1, 0.1);
    expect(result).toContain(0);
    expect(result).toContain(1);
  });

  it('query returns all nearby particles in 3x3x3 neighborhood', () => {
    const grid = new SpatialHashGrid(1.0);
    // Particle at (0.5, 0.5, 0.5) and (1.5, 0.5, 0.5) — adjacent cells
    const positions = new Float32Array([0.5, 0.5, 0.5, 1.5, 0.5, 0.5]);
    grid.build(positions, 2);
    // Query from particle 0's position should find particle 1 (adjacent cell)
    const result = grid.queryArray(0.5, 0.5, 0.5);
    expect(result).toContain(0);
    expect(result).toContain(1);
  });
});

/**
 * Bit-exact parity fixture (#720). `hashCoords` is the single arithmetic
 * surface that has to match the Rust port byte-for-byte across language
 * boundaries — otherwise WASM and CPU tiers route particles to different
 * cells and silently diverge in self-collision detection.
 *
 * The Rust half of this fixture lives in
 * `crates/xpbd-wasm/src/lib.rs` (`hash_coords_bit_exact_with_ts_reference`).
 * The 8 cases below MUST match value-for-value; any change in one half
 * requires updating the other.
 *
 * Cases pinned: identity, unit basis (x/y/z), all-negative-1, typical
 * realistic cell, wrap-zone exercise (1_000_000 → JS i32 bitwise wrap kicks
 * in but stays under the `|coord| < 2^25` JS parity bound), and a
 * large-negative-coords case.
 */
describe('hashCoords bit-exact reference (parity with Rust)', () => {
  it('matches fixture values', () => {
    const grid = new SpatialHashGrid(0.01);
    grid.tableSize = 10007;
    // [xi, yi, zi, expected]. Keep in sync with Rust fixture
    // `hash_coords_bit_exact_with_ts_reference` in
    // `crates/xpbd-wasm/src/lib.rs`.
    const cases: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 0, 0, 0],
      [1, 0, 0, 2172],
      [0, 1, 0, 5339],
      [0, 0, 1, 4877],
      [-1, -1, -1, 1731],
      [100, 200, 300, 2436],
      [1000000, 0, 0, 2616],
      [-1000, -2000, -3000, 8204],
    ];
    for (const [xi, yi, zi, expected] of cases) {
      expect(grid.hashCoords(xi, yi, zi)).toBe(expected);
    }
  });
});

describe('solveSelfCollision', () => {
  // Helper: create two non-connected particles
  function makeTwoParticles(p0: [number, number, number], p1: [number, number, number]) {
    const positions = new Float32Array([...p0, ...p1]);
    const prevPositions = new Float32Array(positions);
    const invMass = new Float32Array([1.0, 1.0]);
    // Two separate triangles so particles 0 and 1 are NOT connected
    // We need at least 6 particles for two triangles, but we can use triIds with particles
    // that don't include 0 and 1 together. Simplest: empty triIds.
    const triIds = new Int32Array(0);
    return { positions, prevPositions, invMass, triIds };
  }

  it('pushes overlapping non-connected particles apart', () => {
    const thickness = 0.1;
    const { positions, prevPositions, invMass, triIds } = makeTwoParticles(
      [0, 0, 0], [0.05, 0, 0], // distance 0.05 < thickness 0.1
    );
    const grid = new SpatialHashGrid(thickness * 2);

    solveSelfCollision(positions, prevPositions, invMass, 2, triIds, thickness, grid);

    // They should be pushed apart to at least thickness distance
    const dx = positions[0] - positions[3];
    const dy = positions[1] - positions[4];
    const dz = positions[2] - positions[5];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeCloseTo(thickness, 5);
  });

  it('does NOT push connected particles apart', () => {
    const thickness = 0.1;
    const positions = new Float32Array([0, 0, 0, 0.05, 0, 0, 0, 0.5, 0]);
    const prevPositions = new Float32Array(positions);
    const invMass = new Float32Array([1.0, 1.0, 1.0]);
    // Triangle connecting particles 0 and 1
    const triIds = new Int32Array([0, 1, 2]);
    const grid = new SpatialHashGrid(thickness * 2);

    const posBefore = new Float32Array(positions);
    solveSelfCollision(positions, prevPositions, invMass, 3, triIds, thickness, grid);

    // Particles 0 and 1 should NOT have moved (they share a triangle)
    expect(positions[0]).toBe(posBefore[0]);
    expect(positions[3]).toBe(posBefore[3]);
  });

  it('does not affect particles far apart', () => {
    const thickness = 0.1;
    const { positions, prevPositions, invMass, triIds } = makeTwoParticles(
      [0, 0, 0], [10, 10, 10],
    );
    const grid = new SpatialHashGrid(thickness * 2);
    const posBefore = new Float32Array(positions);

    solveSelfCollision(positions, prevPositions, invMass, 2, triIds, thickness, grid);

    expect(positions[0]).toBe(posBefore[0]);
    expect(positions[3]).toBe(posBefore[3]);
  });

  it('pinned particle (invMass=0) does not move', () => {
    const thickness = 0.1;
    const positions = new Float32Array([0, 0, 0, 0.05, 0, 0]);
    const prevPositions = new Float32Array(positions);
    const invMass = new Float32Array([0.0, 1.0]); // particle 0 pinned
    const triIds = new Int32Array(0);
    const grid = new SpatialHashGrid(thickness * 2);

    solveSelfCollision(positions, prevPositions, invMass, 2, triIds, thickness, grid);

    // Pinned particle should not move
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(0);
    expect(positions[2]).toBe(0);

    // But particle 1 should have moved away
    expect(positions[3]).toBeGreaterThan(0.05);
  });
});

import { describe, it, expect } from 'vitest';
import { buildAdjacencyCSR } from '../adjacencyCSR';
import { buildAdjacency } from '../../selfCollision';

/**
 * Coverage for the `buildAdjacencyCSR` helper extracted from
 * `wasmSolverWorker.ts` (#719). The worker boot path is end-to-end
 * tested by the WASM smoke test (#748); this suite locks the CSR
 * construction shape so future refactors can't silently break it.
 *
 * CSR invariants checked:
 *   - offsets length = numParticles + 1
 *   - offsets monotonic non-decreasing
 *   - offsets[numParticles] === neighbors.length (terminator)
 *   - typed-array output (Uint32Array, not number[])
 *   - empty mesh → sentinel-only shape
 */
describe('buildAdjacencyCSR', () => {
  it('produces the canonical CSR shape for a 3-particle triangle', () => {
    // Single triangle (0, 1, 2) → every particle shares with the other two.
    const adjSets = buildAdjacency(new Int32Array([0, 1, 2]), 3);
    const { offsets, neighbors } = buildAdjacencyCSR(adjSets, 3);

    expect(offsets).toBeInstanceOf(Uint32Array);
    expect(neighbors).toBeInstanceOf(Uint32Array);
    expect(Array.from(offsets)).toEqual([0, 2, 4, 6]);
    // Order within each particle's slice follows Set iteration order
    // (insertion order in V8); assert per-slice membership rather than the
    // exact permutation to avoid brittleness to Set internals.
    expect(new Set(neighbors.slice(0, 2))).toEqual(new Set([1, 2]));
    expect(new Set(neighbors.slice(2, 4))).toEqual(new Set([0, 2]));
    expect(new Set(neighbors.slice(4, 6))).toEqual(new Set([0, 1]));
  });

  it('handles an empty mesh with the sentinel-only shape', () => {
    const { offsets, neighbors } = buildAdjacencyCSR([], 0);
    expect(offsets).toBeInstanceOf(Uint32Array);
    expect(neighbors).toBeInstanceOf(Uint32Array);
    expect(Array.from(offsets)).toEqual([0]);
    expect(neighbors.length).toBe(0);
  });

  it('preserves Set iteration values as Uint32 entries', () => {
    // Construct a deliberate `Set<number>[]` with values across the Int32
    // boundary the worker uses (Set<number> entries flow through the
    // Uint32Array constructor unchanged). Verify the bit-pattern survives.
    const adjSets: Set<number>[] = [new Set([5, 100]), new Set([0])];
    const { offsets, neighbors } = buildAdjacencyCSR(adjSets, 2);
    expect(Array.from(offsets)).toEqual([0, 2, 3]);
    expect(new Set(neighbors.slice(0, 2))).toEqual(new Set([5, 100]));
    expect(neighbors[2]).toBe(0);
  });

  it('matches the CSR sentinel terminator: offsets[numParticles] === neighbors.length', () => {
    // Two separate triangles share no vertices — 6 particles total.
    const adjSets = buildAdjacency(new Int32Array([0, 1, 2, 3, 4, 5]), 6);
    const { offsets, neighbors } = buildAdjacencyCSR(adjSets, 6);
    expect(offsets[6]).toBe(neighbors.length);
    // Each particle in this mesh has exactly 2 neighbours (the two other
    // vertices of its triangle), so total = 12.
    expect(neighbors.length).toBe(12);
    expect(offsets[6]).toBe(12);
  });

  it('allows particles with no neighbours (isolated vertices)', () => {
    // 4 particles, only one triangle (0, 1, 2) → particle 3 is isolated.
    const adjSets = buildAdjacency(new Int32Array([0, 1, 2]), 4);
    const { offsets, neighbors } = buildAdjacencyCSR(adjSets, 4);
    expect(Array.from(offsets)).toEqual([0, 2, 4, 6, 6]);
    // Particle 3's slice is empty (offsets[3] === offsets[4]).
    expect(offsets[3]).toBe(offsets[4]);
    // Total adjacency entries unchanged by the isolated vertex.
    expect(neighbors.length).toBe(6);
  });

  it('offsets are monotonic non-decreasing', () => {
    const adjSets = buildAdjacency(new Int32Array([0, 1, 2, 1, 2, 3]), 4);
    const { offsets } = buildAdjacencyCSR(adjSets, 4);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });
});

/**
 * Adjacency CSR (Compressed Sparse Row) construction helper.
 *
 * Flatten per-particle triangle-shared neighbour sets into the CSR pair the
 * Rust solver consumes via `set_adjacency` (`offsets[numParticles + 1]`
 * prefix-sum scan + `neighbors[total]` flat array). Extracted from
 * `wasmSolverWorker.ts` (#719) so the construction is unit-testable
 * independently of the worker boot path.
 *
 * Cross-ref: `solve_self_collision` in `crates/xpbd-wasm/src/lib.rs` for
 * the consumer side, and `CSRAdjacency` (#721) for the typed wrapper that
 * validates the same shape on the Rust side.
 *
 * @module adjacencyCSR
 */

/**
 * Build a CSR adjacency representation from per-particle neighbour sets.
 *
 * @param adjSets - `adjSets[i]` is the set of particles sharing a triangle
 *   with particle `i`. Length must be `numParticles`.
 * @param numParticles - Total particle count. `adjSets` MUST have this
 *   length; passing a shorter array is a caller bug surfaced via the
 *   per-particle loop (would crash with `cannot read of undefined`).
 *
 * @returns `{ offsets, neighbors }` Uint32Array pair:
 *   - `offsets` has length `numParticles + 1`. `offsets[i]..offsets[i+1]`
 *     gives the slice of `neighbors` belonging to particle `i`.
 *     `offsets[numParticles]` equals `neighbors.length` (CSR sentinel).
 *   - `neighbors` length equals `offsets[numParticles]` (total adjacency
 *     entries across all particles).
 *
 * For an empty mesh (`numParticles === 0`), returns the canonical
 * sentinel-only shape: `offsets = Uint32Array([0])`, `neighbors =
 * Uint32Array([])`.
 */
export function buildAdjacencyCSR(
  adjSets: Set<number>[],
  numParticles: number,
): { offsets: Uint32Array; neighbors: Uint32Array } {
  const offsets = new Uint32Array(numParticles + 1);
  let total = 0;
  for (let i = 0; i < numParticles; i++) {
    offsets[i] = total;
    total += adjSets[i].size;
  }
  offsets[numParticles] = total;

  const neighbors = new Uint32Array(total);
  let k = 0;
  for (let i = 0; i < numParticles; i++) {
    for (const j of adjSets[i]) {
      neighbors[k++] = j;
    }
  }

  return { offsets, neighbors };
}

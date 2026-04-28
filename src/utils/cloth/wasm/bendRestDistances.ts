/**
 * BUG-1 (#604) — WASM bend rest values.
 *
 * The Rust XPBD solver's `solve_bend` (crates/xpbd-wasm/src/lib.rs) treats the
 * bend rest values as **distances between the two opposite vertices** of the
 * bend quad (indices 2 and 3 of each 4-tuple in the constraint id array). The
 * shared GPU/TSL extractor (`extractBendConstraints` in gpuBuffers.ts) returns
 * dihedral **angles in radians** for the TSL solver's bending model.
 *
 * Passing the angles to the Rust solver caused incorrect bending behavior in
 * the WASM tier (values in radians, ~0.05 to π, treated as metres while real
 * c-d distances are typically 0.01–0.1 m). The CPU fallback (xpbdSolver.ts)
 * already computes the correct distances in its constructor.
 *
 * This helper computes the c-d distances from the constraint id array shared
 * by both extractors, so the WASM worker can feed the Rust solver the values
 * it expects without modifying the shared extractor (which TSL still needs to
 * return angles).
 */

/**
 * Compute bend constraint rest distances for the WASM/Rust solver.
 *
 * @param positions  Flat [x,y,z, x,y,z, ...] particle positions.
 * @param ids        Flat [a,b,c,d, a,b,c,d, ...] bend quad ids; indices 2 and 3
 *                   of each tuple are the opposite vertices whose c↔d distance
 *                   the Rust solver uses as the bend rest length.
 * @returns          Float32Array with one distance per bend constraint.
 */
export function computeBendRestDistances(
  positions: Float32Array,
  ids: Uint32Array,
): Float32Array {
  const numConstraints = ids.length / 4;
  const distances = new Float32Array(numConstraints);
  for (let i = 0; i < numConstraints; i++) {
    const c = ids[i * 4 + 2];
    const d = ids[i * 4 + 3];
    const dx = positions[d * 3]     - positions[c * 3];
    const dy = positions[d * 3 + 1] - positions[c * 3 + 1];
    const dz = positions[d * 3 + 2] - positions[c * 3 + 2];
    distances[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return distances;
}

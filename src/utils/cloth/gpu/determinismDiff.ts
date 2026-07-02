/**
 * P4-0 drape-determinism gate — pure comparison of two GPU drape snapshots.
 *
 * The @gpu-local replay dumps the settled position buffer (xyz-flat, metres)
 * once per `--repeat-each` run; this compares each run against run 0.
 *
 * PASS/FAIL is **bit-exact** (memcmp of the raw bytes): after the bend
 * graph-coloring fix (P4-1) no cross-workgroup float reduction survives, so a
 * race-free pipeline is byte-identical run-to-run on a fixed device+driver. A
 * differing bit pattern means a different code path ran → not reproducible.
 * L∞ / L2 in millimetres are reported as diagnostic MAGNITUDE only, never as
 * the pass threshold (a mm tolerance is a hole: sub-mm bend lost-updates at
 * 2.5s amplify to the documented 10s bistable collapse).
 *
 * See docs/plans/2026-07-01-drape-determinism-p4-design.md.
 */
export interface PositionDiff {
  /** true iff the two buffers are byte-identical (memcmp) — the gate verdict. */
  bitExact: boolean;
  /** max per-component absolute difference, in millimetres (diagnostic). */
  linfMm: number;
  /** RMS of per-particle Euclidean displacement, in millimetres (diagnostic). */
  l2Mm: number;
  /** number of particles compared (buffer length / 3). */
  count: number;
}

export function comparePositions(reference: Float32Array, other: Float32Array): PositionDiff {
  if (reference.length !== other.length) {
    throw new Error(
      `position buffer length mismatch: ${reference.length} vs ${other.length} — comparing runs with different particle counts`,
    );
  }
  if (reference.length % 3 !== 0) {
    throw new Error(
      `position buffer length ${reference.length} is not a multiple of 3 (expected xyz-flat)`,
    );
  }
  const count = reference.length / 3;

  // Bit-exact = byte-identical. Catches sign-bit / NaN-pattern / sub-ULP
  // differences a numeric tolerance would miss.
  const refBytes = new Uint8Array(reference.buffer, reference.byteOffset, reference.byteLength);
  const otherBytes = new Uint8Array(other.buffer, other.byteOffset, other.byteLength);
  let bitExact = true;
  for (let i = 0; i < refBytes.length; i++) {
    if (refBytes[i] !== otherBytes[i]) {
      bitExact = false;
      break;
    }
  }

  // Diagnostic magnitudes (metres → millimetres).
  let linf = 0; // max per-component absolute diff
  let sumSq = 0; // Σ per-particle squared Euclidean displacement
  for (let p = 0; p < count; p++) {
    const i = p * 3;
    const dx = reference[i] - other[i];
    const dy = reference[i + 1] - other[i + 1];
    const dz = reference[i + 2] - other[i + 2];
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const az = Math.abs(dz);
    if (ax > linf) linf = ax;
    if (ay > linf) linf = ay;
    if (az > linf) linf = az;
    sumSq += dx * dx + dy * dy + dz * dz;
  }

  return {
    bitExact,
    linfMm: linf * 1000,
    l2Mm: Math.sqrt(sumSq / count) * 1000,
    count,
  };
}

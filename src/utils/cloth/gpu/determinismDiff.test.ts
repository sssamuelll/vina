import { describe, it, expect } from 'vitest';
import { comparePositions } from './determinismDiff';

/**
 * P4-0 determinism gate — the pure comparison the offline diff script runs
 * over the per-run `pos-*.bin` snapshots dumped by the @gpu-local replay.
 * Bit-exact (memcmp) is the PASS/FAIL; L∞ / L2 in mm are diagnostic magnitude.
 * See docs/plans/2026-07-01-drape-determinism-p4-design.md § The GATE.
 */
describe('comparePositions', () => {
  it('reports bit-exact for identical position buffers', () => {
    const a = new Float32Array([0, 0, 0, 1, 0, 0]);
    const b = new Float32Array([0, 0, 0, 1, 0, 0]);
    const r = comparePositions(a, b);
    expect(r.bitExact).toBe(true);
    expect(r.linfMm).toBe(0);
    expect(r.l2Mm).toBe(0);
    expect(r.count).toBe(2);
  });

  it('reports non-bit-exact with mm magnitudes when one vertex differs', () => {
    const a = new Float32Array([0, 0, 0, 1, 0, 0]); // 2 particles, metres
    const b = new Float32Array([0, 0, 0, 1.002, 0, 0]); // p1 moved +2mm in x
    const r = comparePositions(a, b);
    expect(r.bitExact).toBe(false);
    // max per-component absolute diff = 0.002 m = 2 mm
    expect(r.linfMm).toBeCloseTo(2, 4);
    // RMS of per-particle Euclidean displacement: sqrt((0² + 0.002²)/2) m → mm
    expect(r.l2Mm).toBeCloseTo(Math.sqrt(0.002 ** 2 / 2) * 1000, 4);
    expect(r.count).toBe(2);
  });

  it('treats a pure sign-bit difference (+0 vs -0) as non-bit-exact but zero-magnitude', () => {
    // memcmp catches the different bit pattern (0x00000000 vs 0x80000000) even
    // though the values are numerically equal — a different code path ran, so
    // the run is NOT reproducible. This is why the gate is memcmp, not tolerance.
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([-0, 0, 0]);
    const r = comparePositions(a, b);
    expect(r.bitExact).toBe(false);
    expect(r.linfMm).toBe(0);
  });

  it('throws when the two buffers have different lengths', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([0, 0, 0, 1, 0, 0]);
    expect(() => comparePositions(a, b)).toThrow(/length/i);
  });

  it('throws when a buffer length is not a multiple of 3 (not xyz-flat)', () => {
    const a = new Float32Array([0, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, 1]);
    expect(() => comparePositions(a, b)).toThrow(/multiple of 3/i);
  });
});

import { describe, it, expect } from 'vitest';
import { computeBendRestDistances } from '../bendRestDistances';

describe('computeBendRestDistances (BUG-1 / #604)', () => {
  it('returns the c↔d distance for each bend constraint, not the dihedral angle', () => {
    // Two triangles sharing edge (a-b), opposite vertices c and d.
    //   a = (0, 0, 0)
    //   b = (1, 0, 0)
    //   c = (0.5, 1, 0)
    //   d = (0.5, -1, 0)
    // c↔d distance = 2.0 exactly (vertical separation in y).
    const positions = new Float32Array([
      0,    0, 0,   // 0 = a
      1,    0, 0,   // 1 = b
      0.5,  1, 0,   // 2 = c
      0.5, -1, 0,   // 3 = d
    ]);
    const ids = new Uint32Array([0, 1, 2, 3]); // [a, b, c, d]

    const result = computeBendRestDistances(positions, ids);

    expect(result.length).toBe(1);
    expect(result[0]).toBeCloseTo(2.0, 5);
  });

  it('handles multiple constraints', () => {
    // Two bend constraints with known c↔d distances of 2.0 and 5.0.
    const positions = new Float32Array([
      0, 0, 0,    // 0
      1, 0, 0,    // 1
      0.5,  1, 0, // 2 — first c
      0.5, -1, 0, // 3 — first d (dist to c = 2.0)
      0,    0, 0, // 4
      0,    3, 4, // 5 — second d (dist to c at index 4 = 5.0; uses 3-4-5 triangle)
    ]);
    // Reuse vertex 4 as 'c' for the second constraint: positions[4]=(0,0,0).
    // c=4, d=5 → distance = sqrt(0² + 3² + 4²) = 5.
    const ids = new Uint32Array([
      0, 1, 2, 3, // first quad: c=2, d=3, dist=2.0
      0, 1, 4, 5, // second quad: c=4, d=5, dist=5.0
    ]);

    const result = computeBendRestDistances(positions, ids);

    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(2.0, 5);
    expect(result[1]).toBeCloseTo(5.0, 5);
  });

  it('returns zero distance when c and d coincide (degenerate case)', () => {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0.5, 0, 0, // c
      0.5, 0, 0, // d coincident with c
    ]);
    const ids = new Uint32Array([0, 1, 2, 3]);

    const result = computeBendRestDistances(positions, ids);

    expect(result[0]).toBe(0);
  });

  it('returns empty array for zero constraints', () => {
    const result = computeBendRestDistances(new Float32Array([0, 0, 0]), new Uint32Array([]));
    expect(result.length).toBe(0);
  });
});

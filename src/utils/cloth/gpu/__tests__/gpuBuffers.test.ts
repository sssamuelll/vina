import { describe, it, expect } from 'vitest';
import { EdgeType, classifyEdgeType, extractStretchConstraints, extractBendConstraints, colorConstraints } from '../gpuBuffers';

describe('EdgeType classification', () => {
  describe('classifyEdgeType', () => {
    it('should classify horizontal edge as WEFT', () => {
      // Edge along U axis (horizontal)
      expect(classifyEdgeType([0, 0], [1, 0])).toBe(EdgeType.WEFT);
      expect(classifyEdgeType([0, 0], [1, 0.1])).toBe(EdgeType.WEFT); // slight angle
    });

    it('should classify vertical edge as WARP', () => {
      // Edge along V axis (vertical)
      expect(classifyEdgeType([0, 0], [0, 1])).toBe(EdgeType.WARP);
      expect(classifyEdgeType([0, 0], [0.1, 1])).toBe(EdgeType.WARP); // slight angle
    });

    it('should classify diagonal edge as SHEAR', () => {
      // 45 degree edge
      expect(classifyEdgeType([0, 0], [1, 1])).toBe(EdgeType.SHEAR);
      expect(classifyEdgeType([0, 0], [1, 0.8])).toBe(EdgeType.SHEAR); // ~38 degrees
    });
  });

  describe('extractStretchConstraints', () => {
    it('should return edgeTypes array', () => {
      // Simple triangle
      const positions = new Float32Array([0,0,0, 1,0,0, 0.5,1,0]);
      const triangles = new Uint32Array([0, 1, 2]);

      const result = extractStretchConstraints(positions, triangles);

      expect(result.edgeTypes).toBeInstanceOf(Uint8Array);
      expect(result.edgeTypes.length).toBe(result.restLengths.length);
    });

    it('should default to SHEAR when no UVs provided', () => {
      const positions = new Float32Array([0,0,0, 1,0,0, 0.5,1,0]);
      const triangles = new Uint32Array([0, 1, 2]);

      const result = extractStretchConstraints(positions, triangles);

      // All edges should be SHEAR (default)
      for (let i = 0; i < result.edgeTypes.length; i++) {
        expect(result.edgeTypes[i]).toBe(EdgeType.SHEAR);
      }
    });

    it('should classify edges based on UVs when provided', () => {
      // Square with UVs: horizontal, vertical, and diagonal edges
      const positions = new Float32Array([
        0,0,0,  1,0,0,  1,1,0,  0,1,0  // Square
      ]);
      const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
      const uvs = new Float32Array([
        0,0,  1,0,  1,1,  0,1  // Standard UV mapping
      ]);

      const result = extractStretchConstraints(positions, triangles, uvs);

      // Should have mix of WARP, WEFT, SHEAR edges
      const hasWarp = Array.from(result.edgeTypes).includes(EdgeType.WARP);
      const hasWeft = Array.from(result.edgeTypes).includes(EdgeType.WEFT);
      const hasShear = Array.from(result.edgeTypes).includes(EdgeType.SHEAR);

      expect(hasWarp || hasWeft || hasShear).toBe(true);
    });
  });

  describe('extractBendConstraints', () => {
    it('should return edgeTypes array', () => {
      // Two triangles sharing an edge
      const positions = new Float32Array([
        0,0,0,  1,0,0,  0.5,1,0,  0.5,-1,0
      ]);
      const triangles = new Uint32Array([0,1,2, 0,3,1]); // Shared edge 0-1

      const result = extractBendConstraints(positions, triangles);

      expect(result.edgeTypes).toBeInstanceOf(Uint8Array);
      expect(result.edgeTypes.length).toBe(result.restAngles.length);
    });

    it('should classify bend edge based on UVs', () => {
      const positions = new Float32Array([
        0,0,0,  1,0,0,  0.5,1,0,  0.5,-1,0
      ]);
      const triangles = new Uint32Array([0,1,2, 0,3,1]);
      const uvs = new Float32Array([
        0,0,  1,0,  0.5,1,  0.5,-1  // Horizontal edge 0-1
      ]);

      const result = extractBendConstraints(positions, triangles, uvs);

      // Edge 0-1 is horizontal in UV -> WEFT
      expect(result.edgeTypes[0]).toBe(EdgeType.WEFT);
    });

    it('should classify vertical edge as WARP', () => {
      const positions = new Float32Array([
        0,0,0,  0,1,0,  1,0.5,0,  -1,0.5,0
      ]);
      const triangles = new Uint32Array([0,1,2, 0,3,1]); // Shared edge 0-1
      const uvs = new Float32Array([
        0.5,0,  0.5,1,  1,0.5,  0,0.5  // Vertical edge 0-1
      ]);

      const result = extractBendConstraints(positions, triangles, uvs);

      // Edge 0-1 is vertical in UV -> WARP
      expect(result.edgeTypes[0]).toBe(EdgeType.WARP);
    });

    it('should default diagonal (SHEAR) edges to WEFT', () => {
      const positions = new Float32Array([
        0,0,0,  1,1,0,  1,0,0,  0,1,0
      ]);
      const triangles = new Uint32Array([0,1,2, 0,3,1]); // Shared edge 0-1
      const uvs = new Float32Array([
        0,0,  1,1,  1,0,  0,1  // Diagonal edge 0-1 (45 degrees)
      ]);

      const result = extractBendConstraints(positions, triangles, uvs);

      // Edge 0-1 is diagonal in UV -> SHEAR, but defaults to WEFT
      expect(result.edgeTypes[0]).toBe(EdgeType.WEFT);
    });

    it('should default to WEFT when no UVs provided', () => {
      const positions = new Float32Array([
        0,0,0,  1,0,0,  0.5,1,0,  0.5,-1,0
      ]);
      const triangles = new Uint32Array([0,1,2, 0,3,1]);

      const result = extractBendConstraints(positions, triangles);

      // Without UVs, edges are classified as SHEAR, which defaults to WEFT
      expect(result.edgeTypes[0]).toBe(EdgeType.WEFT);
    });
  });
});

// ─── colorConstraints (#897 F4.3d) ───────────────────────────────────────────
//
// Each color group becomes one compute dispatch per substep, so the number of
// colors directly multiplies per-frame CPU dispatch overhead. The coloring
// must stay PROPER (no two constraints in a group share a vertex — race
// freedom) AND near-minimal (≈ max constraints per vertex, the edge-coloring
// floor) regardless of the input order the constraints arrive in.
//
// Production constraint streams come from CDT meshing of DXF patterns — the
// edge-discovery order is irregular, not scanline. The fixture below mirrors
// that: a 20×20 particle grid with warp+weft+shear (both diagonals)
// constraints, deterministically shuffled (seeded LCG) to mimic CDT order.

/**
 * 20×20 particle grid, warp (vertical) + weft (horizontal) + shear (both
 * diagonals per quad) constraints, deterministically shuffled.
 * maxPerVertex = 8 (interior vertex: 2 warp + 2 weft + 4 shear).
 */
function makeShuffledGridConstraints(W = 20, H = 20, seed = 42) {
  const pairs: Array<[number, number]> = [];
  // weft (horizontal)
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) pairs.push([y * W + x, y * W + x + 1]);
  // warp (vertical)
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) pairs.push([y * W + x, (y + 1) * W + x]);
  // shear (both diagonals per quad)
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    pairs.push([y * W + x, (y + 1) * W + x + 1]);
    pairs.push([y * W + x + 1, (y + 1) * W + x]);
  }

  // Deterministic Fisher-Yates with LCG — mimics irregular CDT edge order.
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  const n = pairs.length;
  const ids = new Uint32Array(n * 2);
  const restLengths = new Float32Array(n);
  const compliance = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ids[i * 2] = pairs[i][0];
    ids[i * 2 + 1] = pairs[i][1];
    // Unique-ish payloads so reorder pairing breaks are detectable.
    restLengths[i] = 0.05 + i * 1e-6;
    compliance[i] = i * 1e-9;
  }
  return { ids, restLengths, compliance, n };
}

/** Max constraints incident to any single vertex (edge-coloring floor). */
function maxConstraintsPerVertex(ids: Uint32Array, n: number): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    counts.set(ids[i * 2], (counts.get(ids[i * 2]) ?? 0) + 1);
    counts.set(ids[i * 2 + 1], (counts.get(ids[i * 2 + 1]) ?? 0) + 1);
  }
  return Math.max(...counts.values());
}

describe('colorConstraints', () => {
  it('returns the empty shape for zero constraints', () => {
    const result = colorConstraints(new Uint32Array(0), new Float32Array(0), 0);
    expect(result.ids.length).toBe(0);
    expect(result.restLengths.length).toBe(0);
    expect(result.compliance).toBeUndefined();
    expect(result.colorRanges).toEqual([]);
  });

  it('splits two constraints sharing a vertex into 2 groups (proper coloring floor)', () => {
    // Unit-level mirror of gpuSolverClient behavior #11: any proper coloring
    // of two shared-vertex constraints needs exactly 2 colors.
    const result = colorConstraints(
      new Uint32Array([0, 2, 1, 2]),
      new Float32Array([0.15, 0.3]),
      2,
      new Float32Array([0.0001, 0.0002]),
    );
    expect(result.colorRanges).toHaveLength(2);
    expect(result.colorRanges[0].count).toBe(1);
    expect(result.colorRanges[1].count).toBe(1);
  });

  it('produces a proper coloring: no two constraints in a group share a vertex', () => {
    const { ids, restLengths, compliance, n } = makeShuffledGridConstraints();
    const result = colorConstraints(ids, restLengths, n, compliance);

    for (const { offset, count } of result.colorRanges) {
      const seen = new Set<number>();
      for (let j = offset; j < offset + count; j++) {
        const v0 = result.ids[j * 2];
        const v1 = result.ids[j * 2 + 1];
        expect(seen.has(v0)).toBe(false);
        expect(seen.has(v1)).toBe(false);
        seen.add(v0);
        seen.add(v1);
      }
    }
  });

  it('reorders ids/restLengths/compliance as paired tuples covering all constraints', () => {
    const { ids, restLengths, compliance, n } = makeShuffledGridConstraints();
    const result = colorConstraints(ids, restLengths, n, compliance);

    // colorRanges are contiguous, non-empty, and cover exactly n constraints.
    let expectedOffset = 0;
    for (const { offset, count } of result.colorRanges) {
      expect(offset).toBe(expectedOffset);
      expect(count).toBeGreaterThan(0);
      expectedOffset += count;
    }
    expect(expectedOffset).toBe(n);

    // Every input (v0, v1, rest, compliance) tuple survives the reorder intact.
    const tuple = (idArr: Uint32Array, restArr: Float32Array, compArr: Float32Array, i: number) =>
      `${idArr[i * 2]},${idArr[i * 2 + 1]},${restArr[i]},${compArr[i]}`;
    const inputTuples = new Set<string>();
    for (let i = 0; i < n; i++) inputTuples.add(tuple(ids, restLengths, compliance, i));
    expect(inputTuples.size).toBe(n); // payloads unique → multiset check via Set
    expect(result.compliance).toBeDefined();
    for (let i = 0; i < n; i++) {
      expect(inputTuples.has(tuple(result.ids, result.restLengths, result.compliance!, i))).toBe(true);
    }
  });

  it('colors within maxPerVertex+1 regardless of input order (#897 F4.3d)', () => {
    // Each color group = 1 dispatch × 15 substeps per frame. Input-order
    // greedy is order-sensitive: on this shuffled fixture it measured 11
    // colors (red run 2026-06-13); on María's production mesh, 57. A
    // degree-aware ordering keeps greedy at the edge-coloring floor
    // (maxPerVertex = 8 here).
    const { ids, restLengths, compliance, n } = makeShuffledGridConstraints();
    const maxPerVertex = maxConstraintsPerVertex(ids, n); // = 8 on the 20×20 grid
    expect(maxPerVertex).toBe(8);

    const result = colorConstraints(ids, restLengths, n, compliance);
    expect(result.colorRanges.length).toBeLessThanOrEqual(maxPerVertex + 1);
  });
});

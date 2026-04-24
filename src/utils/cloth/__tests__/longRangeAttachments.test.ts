/**
 * Tests for the LRA (Long Range Attachments) constraint builder.
 *
 * The module owner is `src/utils/cloth/longRangeAttachments.ts`. A separate
 * legacy implementation is kept in THIS test file — and only in this file —
 * as a reference oracle for the parity test. It must not be exported.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLRAConstraints,
  type LRAConstraint,
} from '../longRangeAttachments';

// ─── Reference oracle: O(V^2) array-PQ implementation (pre-refactor). ──────
//
// This is an inline copy of the algorithm that lived in
// longRangeAttachments.ts before the heap refactor. It is kept here as
// a frozen baseline: the parity test asserts the new algorithm matches
// its output on inputs without distance ties, and a separate test uses
// it to demonstrate the non-determinism that motivated the refactor.
function buildLRAConstraintsLegacy(
  restPositions: Float32Array,
  numParticles: number,
  triIds: Int32Array,
  pinnedParticles: Set<number>,
  slack: number = 1.1,
): LRAConstraint[] {
  if (pinnedParticles.size === 0) return [];

  const adj: Map<number, Set<number>> = new Map();
  for (let i = 0; i < numParticles; i++) adj.set(i, new Set());

  const numTris = triIds.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = triIds[3 * t];
    const i1 = triIds[3 * t + 1];
    const i2 = triIds[3 * t + 2];
    adj.get(i0)!.add(i1); adj.get(i0)!.add(i2);
    adj.get(i1)!.add(i0); adj.get(i1)!.add(i2);
    adj.get(i2)!.add(i0); adj.get(i2)!.add(i1);
  }

  function edgeLength(a: number, b: number): number {
    const ai = a * 3, bi = b * 3;
    const dx = restPositions[ai] - restPositions[bi];
    const dy = restPositions[ai + 1] - restPositions[bi + 1];
    const dz = restPositions[ai + 2] - restPositions[bi + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  const dist = new Float32Array(numParticles);
  dist.fill(Infinity);
  const attachedTo = new Int32Array(numParticles);
  attachedTo.fill(-1);

  const queue: Array<{ node: number; dist: number }> = [];
  const visited = new Uint8Array(numParticles);

  for (const p of pinnedParticles) {
    dist[p] = 0;
    attachedTo[p] = p;
    queue.push({ node: p, dist: 0 });
  }

  queue.sort((a, b) => b.dist - a.dist);

  while (queue.length > 0) {
    const { node: u, dist: d } = queue.pop()!;
    if (visited[u]) continue;
    if (d > dist[u]) continue;
    visited[u] = 1;

    for (const v of adj.get(u)!) {
      const newDist = dist[u] + edgeLength(u, v);
      if (newDist < dist[v]) {
        dist[v] = newDist;
        attachedTo[v] = attachedTo[u];
        queue.push({ node: v, dist: newDist });
        let i = queue.length - 1;
        while (i > 0 && queue[i].dist > queue[i - 1].dist) {
          [queue[i], queue[i - 1]] = [queue[i - 1], queue[i]];
          i--;
        }
      }
    }
  }

  const constraints: LRAConstraint[] = [];
  for (let i = 0; i < numParticles; i++) {
    if (pinnedParticles.has(i)) continue;
    if (attachedTo[i] < 0 || !isFinite(dist[i])) continue;
    constraints.push({
      particleIndex: i,
      attachmentIndex: attachedTo[i],
      maxDistance: dist[i] * slack,
    });
  }

  return constraints;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

// Triangle strip along x: nodes 0..n-1 at positions (0,0,0), (1,0,0), ...
// Triangles (0,1,2), (1,2,3), (2,3,4), ..., each sharing two vertices with
// its neighbour. Edges along the strip plus short diagonals. Useful because
// end-nodes are equidistant from the mid-node.
function stripMesh(n: number): { vertices: Float32Array; triIds: Int32Array } {
  const vertices = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    vertices[i * 3] = i;
  }
  const tris: number[] = [];
  for (let i = 0; i < n - 2; i++) tris.push(i, i + 1, i + 2);
  return { vertices, triIds: new Int32Array(tris) };
}

// Rectangular grid: resX × resY particles, spaced 1 unit apart on the XY plane.
function gridMesh(resX: number, resY: number): { vertices: Float32Array; triIds: Int32Array; n: number } {
  const n = resX * resY;
  const vertices = new Float32Array(n * 3);
  for (let y = 0; y < resY; y++) {
    for (let x = 0; x < resX; x++) {
      const idx = y * resX + x;
      vertices[idx * 3] = x;
      vertices[idx * 3 + 1] = y;
    }
  }
  const tris: number[] = [];
  for (let y = 0; y < resY - 1; y++) {
    for (let x = 0; x < resX - 1; x++) {
      const a = y * resX + x;
      const b = a + 1;
      const c = a + resX;
      const d = c + 1;
      tris.push(a, b, c);
      tris.push(b, d, c);
    }
  }
  return { vertices, triIds: new Int32Array(tris), n };
}

// Deterministic 32-bit PRNG (Mulberry32) so seeded random meshes can be
// reproduced across runs without pulling in a test-only dependency.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function sortConstraints(list: LRAConstraint[]): LRAConstraint[] {
  return [...list].sort((a, b) => a.particleIndex - b.particleIndex);
}

// ─── Basic behaviour ──────────────────────────────────────────────────────

describe('buildLRAConstraints — basic behaviour', () => {
  it('returns empty when no pinned particles are provided', () => {
    const { vertices, triIds } = gridMesh(3, 3);
    expect(buildLRAConstraints(vertices, 9, triIds, new Set())).toEqual([]);
  });

  it('covers every non-pinned particle when the mesh is connected', () => {
    const { vertices, triIds, n } = gridMesh(3, 3);
    const pinned = new Set([0]);
    const constraints = buildLRAConstraints(vertices, n, triIds, pinned);
    expect(constraints.length).toBe(n - 1);
    for (const c of constraints) {
      expect(c.attachmentIndex).toBe(0);
      expect(c.particleIndex).not.toBe(0);
      expect(c.maxDistance).toBeGreaterThan(0);
      expect(Number.isFinite(c.maxDistance)).toBe(true);
    }
  });

  it('skips particles that are not reachable from any pin', () => {
    // Two disconnected triangles (nodes 0,1,2 and nodes 3,4,5). Pin only in
    // the first component. Nodes 3,4,5 stay at dist=Infinity and must be
    // dropped from the output.
    const vertices = new Float32Array([
      0, 0, 0,  1, 0, 0,  0, 1, 0,
      10, 0, 0,  11, 0, 0,  10, 1, 0,
    ]);
    const triIds = new Int32Array([0, 1, 2, 3, 4, 5]);
    const pinned = new Set([0]);
    const constraints = buildLRAConstraints(vertices, 6, triIds, pinned);
    // Only nodes 1 and 2 reachable; 0 is the pin; 3,4,5 unreachable.
    expect(sortConstraints(constraints).map(c => c.particleIndex)).toEqual([1, 2]);
  });

  it('assigns the geodesically-closest pin when multiple pins compete', () => {
    // Strip of 7 nodes. Pin nodes 0 and 6. Node 1 is closer to 0; node 5 to
    // 6; node 3 is the mid-point and its attachedTo is covered by the
    // determinism test below.
    const { vertices, triIds } = stripMesh(7);
    const pinned = new Set([0, 6]);
    const constraints = buildLRAConstraints(vertices, 7, triIds, pinned);
    const byNode = new Map(constraints.map(c => [c.particleIndex, c]));
    expect(byNode.get(1)?.attachmentIndex).toBe(0);
    expect(byNode.get(5)?.attachmentIndex).toBe(6);
  });

  it('scales maxDistance by slack', () => {
    const { vertices, triIds, n } = gridMesh(3, 3);
    const pinned = new Set([0]);
    const c1 = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned, 1.0));
    const c2 = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned, 1.5));
    expect(c1.length).toBe(c2.length);
    for (let i = 0; i < c1.length; i++) {
      expect(c2[i].maxDistance).toBeCloseTo(c1[i].maxDistance * 1.5, 5);
    }
  });
});

// ─── Determinism (the regression this refactor is targeting) ──────────────

describe('buildLRAConstraints — determinism', () => {
  it('is deterministic regardless of pinned-set insertion order', () => {
    // 5-node strip. Nodes 0 and 4 are pins; the centre node 2 is equidistant
    // from both (d=2) along the graph via diagonals inside the strip.
    const { vertices, triIds } = stripMesh(5);

    const pinsAscending = new Set<number>();
    pinsAscending.add(0); pinsAscending.add(4);
    const pinsDescending = new Set<number>();
    pinsDescending.add(4); pinsDescending.add(0);

    const a = sortConstraints(buildLRAConstraints(vertices, 5, triIds, pinsAscending));
    const b = sortConstraints(buildLRAConstraints(vertices, 5, triIds, pinsDescending));
    expect(a).toEqual(b);
  });

  it('legacy implementation is NOT deterministic under the same inputs', () => {
    // Documents the bug being fixed: this assertion captures the motivation
    // for the refactor. If the legacy ever becomes deterministic (e.g. via
    // V8 changing its sort stability), this test will fail and this whole
    // determinism test block becomes redundant.
    const { vertices, triIds } = stripMesh(5);
    const pinsAscending = new Set<number>();
    pinsAscending.add(0); pinsAscending.add(4);
    const pinsDescending = new Set<number>();
    pinsDescending.add(4); pinsDescending.add(0);

    const a = sortConstraints(buildLRAConstraintsLegacy(vertices, 5, triIds, pinsAscending));
    const b = sortConstraints(buildLRAConstraintsLegacy(vertices, 5, triIds, pinsDescending));
    // Same distances, but the mid-node's attachment flips with insertion
    // order — proof that the previous implementation leaked ordering.
    const mid = 2;
    const aMid = a.find(c => c.particleIndex === mid);
    const bMid = b.find(c => c.particleIndex === mid);
    expect(aMid?.attachmentIndex).not.toBe(bMid?.attachmentIndex);
  });

  it('breaks distance ties by node index (ascending)', () => {
    const { vertices, triIds } = stripMesh(5);
    const pinned = new Set([0, 4]);
    const result = buildLRAConstraints(vertices, 5, triIds, pinned);
    const mid = result.find(c => c.particleIndex === 2);
    // 0 and 4 both produce dist=2 to node 2; tie-break selects the lower
    // node index.
    expect(mid?.attachmentIndex).toBe(0);
  });
});

// ─── Parity with the pre-refactor algorithm (no distance ties) ────────────

describe('buildLRAConstraints — parity with legacy on tie-free inputs', () => {
  it('matches the legacy output exactly for a 3×3 grid with one pin', () => {
    const { vertices, triIds, n } = gridMesh(3, 3);
    const pinned = new Set([0]);
    const next = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned));
    const legacy = sortConstraints(buildLRAConstraintsLegacy(vertices, n, triIds, pinned));
    expect(next).toEqual(legacy);
  });

  it('matches the legacy output exactly for 10 randomised tie-free meshes', () => {
    // Single-pin cases on meshes built from seeded perturbed grids never
    // produce exact distance ties in float64 arithmetic. Parity should be
    // bit-exact for every seed.
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = mulberry32(seed);
      const { vertices, triIds, n } = gridMesh(4, 4);
      for (let i = 0; i < vertices.length; i++) vertices[i] += rnd() * 0.01;
      const pinned = new Set([Math.floor(rnd() * n)]);
      const next = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned));
      const legacy = sortConstraints(buildLRAConstraintsLegacy(vertices, n, triIds, pinned));
      expect(next).toEqual(legacy);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe('buildLRAConstraints — edge cases', () => {
  it('handles a single-particle mesh (all pinned)', () => {
    const vertices = new Float32Array([0, 0, 0]);
    const triIds = new Int32Array([]);
    const pinned = new Set([0]);
    const constraints = buildLRAConstraints(vertices, 1, triIds, pinned);
    expect(constraints).toEqual([]);
  });

  it('handles a two-particle mesh with no triangles (isolated nodes)', () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0]);
    const triIds = new Int32Array([]);
    const pinned = new Set([0]);
    // Node 1 has no edges, so it is not reachable and emits no constraint.
    const constraints = buildLRAConstraints(vertices, 2, triIds, pinned);
    expect(constraints).toEqual([]);
  });

  it('is idempotent under repeated invocation', () => {
    const { vertices, triIds, n } = gridMesh(4, 4);
    const pinned = new Set([0, 3]);
    const first = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned));
    const second = sortConstraints(buildLRAConstraints(vertices, n, triIds, pinned));
    expect(first).toEqual(second);
  });

  it('does not mutate its inputs', () => {
    const { vertices, triIds, n } = gridMesh(3, 3);
    const verticesCopy = new Float32Array(vertices);
    const triIdsCopy = new Int32Array(triIds);
    const pinned = new Set([0, 2]);
    const pinnedCopy = new Set(pinned);
    buildLRAConstraints(vertices, n, triIds, pinned);
    expect(Array.from(vertices)).toEqual(Array.from(verticesCopy));
    expect(Array.from(triIds)).toEqual(Array.from(triIdsCopy));
    expect([...pinned]).toEqual([...pinnedCopy]);
  });
});

// ─── Benchmark (opt-in via BENCH=1) ───────────────────────────────────────

describe('buildLRAConstraints — benchmark', () => {
  it.skipIf(!process.env.BENCH)('reports wall-clock time at N=1000 and N=10000', () => {
    const sizes = [
      { label: 'N=1000', resX: 25, resY: 40 },
      { label: 'N=10000', resX: 100, resY: 100 },
      { label: 'N=20000', resX: 100, resY: 200 },
    ];
    for (const { label, resX, resY } of sizes) {
      const { vertices, triIds, n } = gridMesh(resX, resY);
      const pinned = new Set([0, resX - 1, (resY - 1) * resX, n - 1]);

      const runsNew: number[] = [];
      const runsLegacy: number[] = [];
      for (let r = 0; r < 3; r++) {
        const tNew0 = performance.now();
        buildLRAConstraints(vertices, n, triIds, pinned);
        runsNew.push(performance.now() - tNew0);
      }
      for (let r = 0; r < 3; r++) {
        const tLeg0 = performance.now();
        buildLRAConstraintsLegacy(vertices, n, triIds, pinned);
        runsLegacy.push(performance.now() - tLeg0);
      }
      const median = (xs: number[]): number =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      // eslint-disable-next-line no-console
      console.log(
        `[bench] ${label}  legacy=${median(runsLegacy).toFixed(2)}ms  new=${median(runsNew).toFixed(2)}ms`,
      );
    }
  });
});

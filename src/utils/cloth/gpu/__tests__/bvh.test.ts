import { describe, it, expect } from 'vitest';
import { buildLinearBVH } from '../bvh';
import type { LinearBVH } from '../bvh';
import type { CollisionMeshData } from '../../collisionMesh';

/** Two triangles forming a 1×1 floor plane at y=0 */
function makeFloorPlane(): CollisionMeshData {
  return {
    vertices: new Float32Array([
      -0.5, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, 0.5,
      -0.5, 0, -0.5,  0.5, 0, 0.5,  -0.5, 0, 0.5,
    ]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0]),
    triCount: 2,
  };
}

/** A cube (12 triangles) for BVH depth testing */
function makeCube(): CollisionMeshData {
  const v = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [2, 6, 7], [2, 7, 3],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ];
  const vertices = new Float32Array(faces.length * 9);
  const normals = new Float32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const [a, b, c] = faces[i];
    vertices.set(v[a], i * 9);
    vertices.set(v[b], i * 9 + 3);
    vertices.set(v[c], i * 9 + 6);
    const abx = v[b][0] - v[a][0], aby = v[b][1] - v[a][1], abz = v[b][2] - v[a][2];
    const acx = v[c][0] - v[a][0], acy = v[c][1] - v[a][1], acz = v[c][2] - v[a][2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    normals.set([nx, ny, nz], i * 3);
  }
  return { vertices, normals, triCount: faces.length };
}

describe('buildLinearBVH', () => {
  it('returns valid LinearBVH for a simple floor plane', () => {
    const mesh = makeFloorPlane();
    const bvh = buildLinearBVH(mesh);

    expect(bvh.nodeCount).toBeGreaterThan(0);
    expect(bvh.triCount).toBe(2);
    expect(bvh.nodes.length).toBe(bvh.nodeCount * 8);
    expect(bvh.triVerts.length).toBe(2 * 9);
    expect(bvh.triNormals.length).toBe(2 * 3);
  });

  it('every triangle is reachable from leaf nodes', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const reachable = new Set<number>();
    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount > 0) {
        const triStart = bvh.nodes[i * 8 + 6];
        for (let t = 0; t < triCount; t++) {
          reachable.add(triStart + t);
        }
      }
    }
    expect(reachable.size).toBe(mesh.triCount);
  });

  it('root node AABB contains all triangles', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const minX = bvh.nodes[0], minY = bvh.nodes[1], minZ = bvh.nodes[2];
    const maxX = bvh.nodes[3], maxY = bvh.nodes[4], maxZ = bvh.nodes[5];

    const eps = 1e-5;
    for (let i = 0; i < bvh.triVerts.length; i += 3) {
      expect(bvh.triVerts[i]).toBeGreaterThanOrEqual(minX - eps);
      expect(bvh.triVerts[i]).toBeLessThanOrEqual(maxX + eps);
      expect(bvh.triVerts[i + 1]).toBeGreaterThanOrEqual(minY - eps);
      expect(bvh.triVerts[i + 1]).toBeLessThanOrEqual(maxY + eps);
      expect(bvh.triVerts[i + 2]).toBeGreaterThanOrEqual(minZ - eps);
      expect(bvh.triVerts[i + 2]).toBeLessThanOrEqual(maxZ + eps);
    }
  });

  it('child AABBs are contained within parent AABBs', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const eps = 1e-5;
    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount === 0) {
        const leftIdx = bvh.nodes[i * 8 + 6];
        // Right child = first preorder node OUTSIDE the left subtree = skip[left].
        // (The old `leftIdx + 1` assumption is false in general — right =
        // left + leftSubtreeSize — and passed spuriously because any preorder
        // descendant of `i` is contained in i's AABB.)
        const rightIdx = bvh.skip[leftIdx];

        const pMinX = bvh.nodes[i * 8], pMinY = bvh.nodes[i * 8 + 1], pMinZ = bvh.nodes[i * 8 + 2];
        const pMaxX = bvh.nodes[i * 8 + 3], pMaxY = bvh.nodes[i * 8 + 4], pMaxZ = bvh.nodes[i * 8 + 5];

        for (const cIdx of [leftIdx, rightIdx]) {
          if (cIdx >= bvh.nodeCount) continue;
          expect(bvh.nodes[cIdx * 8]).toBeGreaterThanOrEqual(pMinX - eps);
          expect(bvh.nodes[cIdx * 8 + 1]).toBeGreaterThanOrEqual(pMinY - eps);
          expect(bvh.nodes[cIdx * 8 + 2]).toBeGreaterThanOrEqual(pMinZ - eps);
          expect(bvh.nodes[cIdx * 8 + 3]).toBeLessThanOrEqual(pMaxX + eps);
          expect(bvh.nodes[cIdx * 8 + 4]).toBeLessThanOrEqual(pMaxY + eps);
          expect(bvh.nodes[cIdx * 8 + 5]).toBeLessThanOrEqual(pMaxZ + eps);
        }
      }
    }
  });

  it('handles empty mesh gracefully', () => {
    const mesh: CollisionMeshData = {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triCount: 0,
    };
    const bvh = buildLinearBVH(mesh);
    expect(bvh.nodeCount).toBe(0);
    expect(bvh.triCount).toBe(0);
  });

  it('leaf nodes have maxLeafSize or fewer triangles', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount > 0) {
        expect(triCount).toBeLessThanOrEqual(4);
      }
    }
  });
});

// ─── #897 F4.3b: escape (skip) pointers for threaded GPU traversal ──────────
//
// The GPU findBest kernel replaces its flat Loop-over-all-nodes scan with a
// stackless traversal: on AABB miss (or after processing a leaf) the cursor
// jumps to `skip[i]` — the first preorder node OUTSIDE node i's subtree; on an
// internal-node hit it descends into the left child (slot 6 = parent + 1,
// preorder). These tests pin the skip array semantics AND simulate the exact
// kernel iteration in plain TS, asserting it collects the same triangle set as
// the flat-scan baseline (every leaf whose AABB overlaps point ± margin —
// the pre-F4.3b kernel semantics).

/** Mirrors the kernel's AABB overlap test: point ± margin vs node AABB. */
function aabbHit(
  nodes: Float32Array,
  nodeIdx: number,
  p: readonly [number, number, number],
  margin: number,
): boolean {
  const b = nodeIdx * 8;
  return (
    p[0] + margin >= nodes[b] && p[0] - margin <= nodes[b + 3] &&
    p[1] + margin >= nodes[b + 1] && p[1] - margin <= nodes[b + 4] &&
    p[2] + margin >= nodes[b + 2] && p[2] - margin <= nodes[b + 5]
  );
}

/** Flat-scan baseline — pre-F4.3b kernel: every leaf whose AABB overlaps. */
function flatScanTriangles(
  bvh: LinearBVH,
  p: readonly [number, number, number],
  margin: number,
): Set<number> {
  const tris = new Set<number>();
  for (let i = 0; i < bvh.nodeCount; i++) {
    const triCount = bvh.nodes[i * 8 + 7];
    if (triCount > 0 && aabbHit(bvh.nodes, i, p, margin)) {
      const triStart = bvh.nodes[i * 8 + 6];
      for (let t = 0; t < triCount; t++) tris.add(triStart + t);
    }
  }
  return tris;
}

/**
 * Skip-pointer traversal — plain-TS simulation of the new kernel's node
 * iteration (hit && leaf → collect + skip; hit && internal → left child;
 * miss → skip). Throws if it visits more than nodeCount nodes — the bound
 * the GPU Loop relies on for termination.
 */
function traverseTriangles(
  bvh: LinearBVH,
  p: readonly [number, number, number],
  margin: number,
): { tris: Set<number>; visited: number } {
  const tris = new Set<number>();
  let idx = 0;
  let visited = 0;
  while (idx < bvh.nodeCount) {
    if (++visited > bvh.nodeCount) {
      throw new Error(`traversal exceeded node budget (${bvh.nodeCount})`);
    }
    if (aabbHit(bvh.nodes, idx, p, margin)) {
      const triCount = bvh.nodes[idx * 8 + 7];
      if (triCount > 0) {
        const triStart = bvh.nodes[idx * 8 + 6];
        for (let t = 0; t < triCount; t++) tris.add(triStart + t);
        idx = bvh.skip[idx];
      } else {
        idx = bvh.nodes[idx * 8 + 6]; // descend into left child
      }
    } else {
      idx = bvh.skip[idx];
    }
  }
  return { tris, visited };
}

/** Deterministic LCG so the soup/points are reproducible across runs. */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Random-triangle soup: small triangles scattered in the unit cube. */
function makeRandomSoup(triCount: number, seed: number): CollisionMeshData {
  const rnd = makeLcg(seed);
  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const cx = rnd(), cy = rnd(), cz = rnd();
    for (let v = 0; v < 3; v++) {
      vertices[t * 9 + v * 3] = cx + (rnd() - 0.5) * 0.2;
      vertices[t * 9 + v * 3 + 1] = cy + (rnd() - 0.5) * 0.2;
      vertices[t * 9 + v * 3 + 2] = cz + (rnd() - 0.5) * 0.2;
    }
    // Normal values are irrelevant for skip/traversal tests.
    normals.set([0, 1, 0], t * 3);
  }
  return { vertices, normals, triCount };
}

function randomPoints(
  n: number,
  seed: number,
  lo: number,
  hi: number,
): Array<[number, number, number]> {
  const rnd = makeLcg(seed);
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    pts.push([
      lo + rnd() * (hi - lo),
      lo + rnd() * (hi - lo),
      lo + rnd() * (hi - lo),
    ]);
  }
  return pts;
}

function expectTraversalMatchesFlatScan(bvh: LinearBVH, points: Array<[number, number, number]>, margin: number): void {
  for (const p of points) {
    const expected = flatScanTriangles(bvh, p, margin);
    const { tris, visited } = traverseTriangles(bvh, p, margin);
    expect([...tris].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    expect(visited).toBeLessThanOrEqual(bvh.nodeCount);
  }
}

describe('buildLinearBVH skip pointers (#897 F4.3b)', () => {
  it('returns a skip array sized nodeCount with the root escaping to the sentinel', () => {
    const bvh = buildLinearBVH(makeCube());
    expect(bvh.skip).toBeDefined();
    expect(bvh.skip).toBeInstanceOf(Uint32Array);
    expect(bvh.skip.length).toBe(bvh.nodeCount);
    // Root's subtree is the whole tree → its escape is the terminate sentinel.
    expect(bvh.skip[0]).toBe(bvh.nodeCount);
  });

  it('skip pointers strictly advance and never exceed the sentinel', () => {
    const bvh = buildLinearBVH(makeRandomSoup(200, 0xC0FFEE));
    for (let i = 0; i < bvh.nodeCount; i++) {
      expect(bvh.skip[i]).toBeGreaterThan(i);
      expect(bvh.skip[i]).toBeLessThanOrEqual(bvh.nodeCount);
    }
  });

  it('internal nodes: left child is parent+1 (preorder) and skip threads through the right subtree', () => {
    const bvh = buildLinearBVH(makeRandomSoup(200, 0xBADA55));
    let internals = 0;
    for (let i = 0; i < bvh.nodeCount; i++) {
      if (bvh.nodes[i * 8 + 7] !== 0) continue; // leaf
      internals++;
      const left = bvh.nodes[i * 8 + 6];
      // Preorder layout: left child immediately follows its parent. The GPU
      // kernel descends via slot 6, so this pins the descent target too.
      expect(left).toBe(i + 1);
      // skip[left] = first node past the left subtree = the right child.
      const right = bvh.skip[left];
      expect(right).toBeGreaterThan(left);
      expect(right).toBeLessThan(bvh.skip[i]);
      // Right subtree ends where the parent's subtree ends.
      expect(bvh.skip[right]).toBe(bvh.skip[i]);
    }
    expect(internals).toBeGreaterThan(0);
  });

  it('empty mesh returns an empty skip array', () => {
    const bvh = buildLinearBVH({
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triCount: 0,
    });
    expect(bvh.skip).toBeInstanceOf(Uint32Array);
    expect(bvh.skip.length).toBe(0);
  });

  it('skip-traversal collects exactly the flat-scan triangle set (floor plane)', () => {
    const bvh = buildLinearBVH(makeFloorPlane());
    expectTraversalMatchesFlatScan(bvh, randomPoints(50, 1, -1, 1), 0.1);
  });

  it('skip-traversal collects exactly the flat-scan triangle set (cube)', () => {
    const bvh = buildLinearBVH(makeCube());
    expectTraversalMatchesFlatScan(bvh, randomPoints(50, 2, -1, 1), 0.1);
  });

  it('skip-traversal collects exactly the flat-scan triangle set (random 200-tri soup)', () => {
    const bvh = buildLinearBVH(makeRandomSoup(200, 0xFEED));
    const points = randomPoints(50, 3, -0.2, 1.2);
    // uAabbMargin floor in the kernel is 0.1 m; also pin a tighter margin so
    // the equivalence doesn't hold only for AABBs that swallow everything.
    expectTraversalMatchesFlatScan(bvh, points, 0.1);
    expectTraversalMatchesFlatScan(bvh, points, 0.01);
  });

  it('a hit on the soup actually collects a non-empty triangle set (sanity: not vacuous)', () => {
    const bvh = buildLinearBVH(makeRandomSoup(200, 0xFEED));
    // Center of the unit cube with the kernel's default margin — must hit.
    const { tris } = traverseTriangles(bvh, [0.5, 0.5, 0.5], 0.1);
    expect(tris.size).toBeGreaterThan(0);
  });
});

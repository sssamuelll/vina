/**
 * Penetration metric tests — cloth↔body signed-distance oracle (plan
 * drape-profesional 2026-07-02 §A1 / Fase 0.1).
 *
 * Synthetic closed bodies built inline: an axis-aligned cube (unit tests) and
 * a triangulated cylinder at avatar scale (perf smoke).
 */
import { describe, it, expect } from 'vitest';
import type { CollisionMeshData } from '../collisionMesh';
import {
  buildPenetrationBody,
  computePenetrationMetric,
  registerPenetrationBody,
  getPenetrationBody,
  penetrationStrideFor,
  PENETRATION_THRESHOLD_M,
} from '../penetrationMetric';

// ─── Synthetic bodies ─────────────────────────────────────────────────────────

/** Closed axis-aligned cube centered at origin, half-extent `h`, outward normals. */
function makeCube(h: number): CollisionMeshData {
  // 8 corners
  const c = [
    [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], // z = -h
    [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h],     // z = +h
  ];
  // 6 faces as corner-index quads + outward normal
  const faces: Array<{ q: [number, number, number, number]; n: [number, number, number] }> = [
    { q: [1, 2, 6, 5], n: [1, 0, 0] },   // +x
    { q: [0, 4, 7, 3], n: [-1, 0, 0] },  // -x
    { q: [3, 7, 6, 2], n: [0, 1, 0] },   // +y
    { q: [0, 1, 5, 4], n: [0, -1, 0] },  // -y
    { q: [4, 5, 6, 7], n: [0, 0, 1] },   // +z
    { q: [0, 3, 2, 1], n: [0, 0, -1] },  // -z
  ];
  const triCount = faces.length * 2;
  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);
  let t = 0;
  for (const { q, n } of faces) {
    for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      const off = t * 9;
      for (let v = 0; v < 3; v++) {
        vertices[off + v * 3] = c[tri[v]][0];
        vertices[off + v * 3 + 1] = c[tri[v]][1];
        vertices[off + v * 3 + 2] = c[tri[v]][2];
      }
      normals[t * 3] = n[0]; normals[t * 3 + 1] = n[1]; normals[t * 3 + 2] = n[2];
      t++;
    }
  }
  return { vertices, normals, triCount };
}

/**
 * Closed-ish triangulated cylinder (axis = Y), outward normals — avatar-scale
 * body for the perf smoke. `rings * segments * 2` triangles.
 */
function makeCylinder(radius: number, height: number, rings: number, segments: number): CollisionMeshData {
  const triCount = rings * segments * 2;
  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);
  const ringPos = (r: number, s: number): [number, number, number] => {
    const a = (s / segments) * Math.PI * 2;
    return [radius * Math.cos(a), (r / rings) * height, radius * Math.sin(a)];
  };
  let t = 0;
  const pushTri = (a: [number, number, number], b: [number, number, number], cc: [number, number, number]) => {
    const off = t * 9;
    vertices.set(a, off); vertices.set(b, off + 3); vertices.set(cc, off + 6);
    // Outward radial normal at the triangle centroid (good enough for a cylinder wall).
    const cx = (a[0] + b[0] + cc[0]) / 3, cz = (a[2] + b[2] + cc[2]) / 3;
    const l = Math.hypot(cx, cz) || 1;
    normals[t * 3] = cx / l; normals[t * 3 + 1] = 0; normals[t * 3 + 2] = cz / l;
    t++;
  };
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const p00 = ringPos(r, s), p10 = ringPos(r, s + 1), p01 = ringPos(r + 1, s), p11 = ringPos(r + 1, s + 1);
      pushTri(p00, p10, p11);
      pushTri(p00, p11, p01);
    }
  }
  return { vertices, normals, triCount };
}

/** Flat Float32Array of cloth verts at the given points. */
function cloth(points: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => out.set(p, i * 3));
  return out;
}

// ─── computePenetrationMetric ─────────────────────────────────────────────────

describe('computePenetrationMetric', () => {
  // 4cm cube: center is 2cm inside every face → within the hash's detection band.
  const h = 0.02;
  const body = buildPenetrationBody(makeCube(h))!;

  it('counts a vert clearly inside the body', () => {
    const { count, minSignedDist } = computePenetrationMetric(cloth([[0, 0, 0]]), body);
    expect(count).toBe(1);
    expect(minSignedDist).toBeCloseTo(-h, 3);
  });

  it('does not count a vert outside the body; minSignedDist stays positive', () => {
    const { count, minSignedDist } = computePenetrationMetric(cloth([[h + 0.01, 0, 0]]), body);
    expect(count).toBe(0);
    expect(minSignedDist).toBeCloseTo(0.01, 3);
  });

  it('does not count a vert in the threshold band (-1mm at default -2mm)', () => {
    const { count, minSignedDist } = computePenetrationMetric(cloth([[h - 0.001, 0, 0]]), body);
    expect(count).toBe(0);
    expect(minSignedDist).toBeCloseTo(-0.001, 4);
  });

  it('threshold override counts the -1mm vert', () => {
    const { count } = computePenetrationMetric(
      cloth([[h - 0.001, 0, 0]]), body, { threshold: -0.0005 },
    );
    expect(count).toBe(1);
  });

  it('mixed verts: counts only penetrating ones, minSignedDist = most negative', () => {
    const { count, minSignedDist } = computePenetrationMetric(
      cloth([[0, 0, 0], [h + 0.01, 0, 0], [h - 0.001, 0, 0]]), body,
    );
    expect(count).toBe(1);
    expect(minSignedDist).toBeCloseTo(-h, 3);
  });

  it('empty cloth positions → count 0, minSignedDist Infinity', () => {
    const { count, minSignedDist } = computePenetrationMetric(new Float32Array(0), body);
    expect(count).toBe(0);
    expect(minSignedDist).toBe(Infinity);
  });

  it('skips NaN verts (A3 NaN guard)', () => {
    const { count } = computePenetrationMetric(cloth([[NaN, 0, 0], [0, 0, 0]]), body);
    expect(count).toBe(1);
  });

  it('stride subsamples deterministically from index 0', () => {
    const inside: [number, number, number] = [0, 0, 0];
    const { count } = computePenetrationMetric(
      cloth([inside, inside, inside]), body, { stride: 3 },
    );
    expect(count).toBe(1); // only vert 0 sampled
  });

  it('default threshold is -2mm', () => {
    expect(PENETRATION_THRESHOLD_M).toBe(-0.002);
  });

  it('penetrationStrideFor: every 3rd vert until the sample budget bites', () => {
    expect(penetrationStrideFor(1000)).toBe(3);
    expect(penetrationStrideFor(10_000)).toBe(3);
    expect(penetrationStrideFor(30_000)).toBe(9);
  });
});

// ─── buildPenetrationBody / registry ─────────────────────────────────────────

describe('penetration body registry', () => {
  it('buildPenetrationBody returns null for an empty mesh', () => {
    const empty: CollisionMeshData = { vertices: new Float32Array(0), normals: new Float32Array(0), triCount: 0 };
    expect(buildPenetrationBody(empty)).toBeNull();
  });

  it('getPenetrationBody is null until a mesh is registered (metric no-op path)', () => {
    registerPenetrationBody(null);
    expect(getPenetrationBody()).toBeNull();
  });

  it('registers a mesh, lazily builds once, and clears on null', () => {
    const mesh = makeCube(0.02);
    registerPenetrationBody(mesh);
    const a = getPenetrationBody();
    expect(a).not.toBeNull();
    expect(a!.mesh).toBe(mesh);
    expect(getPenetrationBody()).toBe(a); // cached, not rebuilt
    registerPenetrationBody(null);
    expect(getPenetrationBody()).toBeNull();
  });

  it('re-registering a new mesh invalidates the cached build', () => {
    const meshA = makeCube(0.02);
    const meshB = makeCube(0.03);
    registerPenetrationBody(meshA);
    const a = getPenetrationBody();
    registerPenetrationBody(meshB);
    const b = getPenetrationBody();
    expect(b).not.toBe(a);
    expect(b!.mesh).toBe(meshB);
    registerPenetrationBody(null);
  });
});

// ─── Perf smoke ───────────────────────────────────────────────────────────────

describe('perf smoke (realistic sizes)', () => {
  it('30k cloth verts vs 15k body tris completes < 100ms', () => {
    // Body: ~15k-tri cylinder at torso scale (r=0.15m, h=1.7m).
    const bodyMesh = makeCylinder(0.15, 1.7, 75, 100); // 15,000 tris
    const body = buildPenetrationBody(bodyMesh)!;

    // Cloth: 30k verts hugging the body 3mm outside — worst case: every vert
    // near the surface with a full candidate list.
    const rows = 150, cols = 200;
    const positions = new Float32Array(rows * cols * 3);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < cols; s++) {
        const a = (s / cols) * Math.PI * 2;
        positions[i++] = 0.153 * Math.cos(a);
        positions[i++] = (r / rows) * 1.7;
        positions[i++] = 0.153 * Math.sin(a);
      }
    }

    const t0 = performance.now();
    const { count } = computePenetrationMetric(
      positions, body, { stride: penetrationStrideFor(rows * cols) },
    );
    const elapsed = performance.now() - t0;

    expect(count).toBe(0); // all verts outside
    // Loose CI-safe bound; the main-thread budget (≤8ms) is verified locally —
    // see the cadence/stride comment in GarmentSimulation.tsx.
    expect(elapsed).toBeLessThan(100);
  });
});

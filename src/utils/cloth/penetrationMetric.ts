/**
 * Penetration metric — cloth↔body signed-distance oracle.
 *
 * Plan drape-profesional 2026-07-02 §A1 (Fase 0.1): computes how many cloth
 * verts sit ≥2mm INSIDE the avatar body, plus the most-negative signed
 * distance. Published from the GPU readback cadence (GarmentSimulation.tsx)
 * as `window.__OPENCLO_PENETRATION_COUNT__` (e2e §8) and
 * `simulation.collisionDistance` (inspector rule `fit:body-penetration`).
 *
 * Reuses the CPU collision tier's machinery wholesale: closest-feature +
 * pseudonormal inside/outside sign from `pointToTriangleDist`
 * (triangleCollision.ts) and its `TriangleSpatialHash` for candidate lookup.
 * This is a read-only oracle — it never writes positions.
 *
 * @module penetrationMetric
 */
import type { CollisionMeshData } from './collisionMesh';
import { buildBodyPseudonormals, type BodyPseudonormals } from './bodyPseudonormals';
import { pointToTriangleDist, TriangleSpatialHash } from './triangleCollision';

/** Default count threshold: verts with signed distance < −2mm (≥2mm inside). */
export const PENETRATION_THRESHOLD_M = -0.002;

/**
 * Same cell sizing the CPU/WASM collision tiers use
 * (`Math.max(0.02, thickness*10)` → 2cm for default cloth).
 */
const DEFAULT_CELL_SIZE = 0.02;

/** Static body prepared for point queries — build ONCE per body (it's static during drape). */
export interface PenetrationBody {
  mesh: CollisionMeshData;
  pn: BodyPseudonormals;
  hash: TriangleSpatialHash;
  /**
   * Per tri: centroid xyz + bounding radius (4 floats). Candidate prefilter:
   * `|p−centroid| − radius` lower-bounds the true point-triangle distance, so
   * candidates that can't beat the current winner skip the full closest-feature
   * test (~4× on dense candidate lists — what keeps the metric inside budget).
   */
  triBound: Float32Array;
}

export interface PenetrationMetric {
  /** Sampled cloth verts with signed distance < threshold (inside the body). */
  count: number;
  /** Most-negative signed distance seen (m); +Infinity when nothing was evaluable. */
  minSignedDist: number;
}

/** Build the query acceleration for a body mesh. Returns null for an empty mesh. */
export function buildPenetrationBody(
  mesh: CollisionMeshData,
  cellSize: number = DEFAULT_CELL_SIZE,
): PenetrationBody | null {
  if (mesh.triCount <= 0) return null;
  const triBound = new Float32Array(mesh.triCount * 4);
  const v = mesh.vertices;
  for (let t = 0; t < mesh.triCount; t++) {
    const o = t * 9;
    const cx = (v[o] + v[o + 3] + v[o + 6]) / 3;
    const cy = (v[o + 1] + v[o + 4] + v[o + 7]) / 3;
    const cz = (v[o + 2] + v[o + 5] + v[o + 8]) / 3;
    let r2 = 0;
    for (let k = 0; k < 3; k++) {
      const dx = v[o + k * 3] - cx, dy = v[o + k * 3 + 1] - cy, dz = v[o + k * 3 + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    const b = t * 4;
    triBound[b] = cx; triBound[b + 1] = cy; triBound[b + 2] = cz;
    triBound[b + 3] = Math.sqrt(r2);
  }
  return {
    mesh,
    pn: buildBodyPseudonormals(mesh),
    hash: new TriangleSpatialHash(mesh, cellSize),
    triBound,
  };
}

/**
 * Signed-distance penetration metric over cloth verts.
 *
 * For each sampled vert: nearest body triangle among spatial-hash candidates,
 * signed by the closest-feature pseudonormal (same sign logic the solver
 * uses). Pure function — no side effects.
 *
 * `opts.stride` subsamples verts deterministically (indices 0, stride, 2·stride…)
 * to stay inside the main-thread budget; `count` is over SAMPLED verts (zero is
 * still zero at any stride).
 */
export function computePenetrationMetric(
  clothPositions: Float32Array,
  body: PenetrationBody,
  opts?: { threshold?: number; stride?: number },
): PenetrationMetric {
  const threshold = opts?.threshold ?? PENETRATION_THRESHOLD_M;
  const stride = Math.max(1, opts?.stride ?? 1);
  const numVerts = Math.floor(clothPositions.length / 3);
  const { mesh, pn, hash, triBound } = body;

  let count = 0;
  let minSignedDist = Infinity;

  for (let v = 0; v < numVerts; v += stride) {
    const i = v * 3;
    const px = clothPositions[i], py = clothPositions[i + 1], pz = clothPositions[i + 2];
    // NaN guard (A3) — un vert NaN no es evaluable.
    if (px !== px || py !== py || pz !== pz) continue;

    // ponytail: empty candidates = vert beyond the hash's ±1-cell reach → treated
    // as not-penetrating. Detection band ≈ ±2·cellSize around the surface; verts
    // deeper inside are missed, but deep pass-through still leaves verts in the
    // near-surface band on the far side. Upgrade path: BVH point query.
    const nearby = hash.query(px, py, pz);
    if (nearby.length === 0) continue;

    // Two-pass nearest-triangle search (what keeps the metric inside budget):
    // pass 1 finds the candidate with the smallest cheap lower bound
    // (|p−centroid|−radius, see PenetrationBody.triBound) and full-tests ONLY
    // it, seeding a tight minDist; pass 2 prunes every other candidate against
    // that bound before paying for the full closest-feature test.
    let bestK = 0;
    let bestLower = Infinity;
    for (let k = 0; k < nearby.length; k++) {
      const b = nearby[k] * 4;
      const bx = px - triBound[b], by = py - triBound[b + 1], bz = pz - triBound[b + 2];
      const lower = Math.sqrt(bx * bx + by * by + bz * bz) - triBound[b + 3];
      if (lower < bestLower) { bestLower = lower; bestK = k; }
    }
    const seedTri = nearby[bestK];
    const seed = pointToTriangleDist(
      px, py, pz,
      mesh.vertices, seedTri * 9,
      mesh.normals, seedTri * 3,
      pn, seedTri,
    );
    let minDist = seed.dist;
    let side = seed.side;
    for (let k = 0; k < nearby.length; k++) {
      if (k === bestK) continue;
      const t = nearby[k];
      const b = t * 4;
      const bx = px - triBound[b], by = py - triBound[b + 1], bz = pz - triBound[b + 2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - triBound[b + 3] >= minDist) continue;
      const r = pointToTriangleDist(
        px, py, pz,
        mesh.vertices, t * 9,
        mesh.normals, t * 3,
        pn, t,
      );
      if (r.dist < minDist) {
        minDist = r.dist;
        side = r.side;
      }
    }

    const signed = side < 0 ? -minDist : minDist;
    if (signed < minSignedDist) minSignedDist = signed;
    if (signed < threshold) count++;
  }

  return { count, minSignedDist };
}

/**
 * Deterministic sample budget for the main-thread wiring. Measured (dev
 * machine, adversarial synthetic: 100% of verts within 3mm of a 15k-tri body):
 * ~2µs per sampled vert → ~3500 samples ≈ 6-7ms, inside the ≤8ms budget.
 * Real drapes are cheaper (hanging verts have empty candidate lists).
 */
const PENETRATION_SAMPLE_BUDGET = 3500;

/**
 * Stride for a cloth of `numVerts`: every 3rd vert (the documented subsample)
 * until the sample budget forces it coarser (30k verts → stride 9 ≈ 6.6ms).
 */
export function penetrationStrideFor(numVerts: number): number {
  return Math.max(3, Math.ceil(numVerts / PENETRATION_SAMPLE_BUDGET));
}

// ─── Body registry ────────────────────────────────────────────────────────────
// Module-level singleton (same pattern as rendererDeviceLost.ts): the avatar
// collider is extracted in useSimulationLifecycle (loadCollision + the
// measurement-rebuild effect) but consumed in GarmentSimulation's readback
// cadence — the registry is the smallest plumbing between the two.

let registeredMesh: CollisionMeshData | null = null;
let builtBody: PenetrationBody | null = null;

/** Register the current avatar collision mesh (null = no body → metric no-op). */
export function registerPenetrationBody(mesh: CollisionMeshData | null): void {
  registeredMesh = mesh !== null && mesh.triCount > 0 ? mesh : null;
  builtBody = null; // derived data (pseudonormals + hash) rebuilds lazily
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    // Dev probe (render-vs-collision surface comparisons @gpu-local).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__OPENCLO_COLLISION_MESH__ = registeredMesh;
  }
}

/** The registered mesh, for sibling oracles (facePokeMetric) to key their own
 *  lazy builds on — one registry, N derived caches. */
export function getRegisteredCollisionMesh(): CollisionMeshData | null {
  return registeredMesh;
}

/**
 * Body prepared for the metric, or null when no body is loaded. Lazily builds
 * pseudonormals + spatial hash once per registered mesh (one-time cost, paid
 * on the first metric tick instead of during collision load).
 */
export function getPenetrationBody(): PenetrationBody | null {
  if (registeredMesh === null) return null;
  if (builtBody === null || builtBody.mesh !== registeredMesh) {
    builtBody = buildPenetrationBody(registeredMesh);
  }
  return builtBody;
}

/**
 * Face-poke metric — body-vertex-through-cloth-FACE oracle (plan A4).
 *
 * The A1 penetration metric (penetrationMetric.ts) samples cloth VERTS and is
 * structurally BLIND to the visible symptom: a convex body feature poking up
 * between the 3 verts of a cloth face (all 3 outside the body, face interior
 * pierced — measured 2026-07-02: thousands of real face contacts on María
 * while A1 read 0). This metric counts exactly what the user sees:
 *
 *   visible = (cloth face, welded body vert) pairs where the body vert
 *             projects INSIDE the face and sits OUTSIDE the cloth surface
 *             (signed distance along the outward face normal > 0) — skin
 *             showing through cloth.
 *   near    = pairs inside the collision band (−margin < signed ≤ 0) — held
 *             off correctly but within margin (contact pressure, not a poke).
 *
 * Body verts are WELDED (no tri-soup multiplicity — unlike the kernel/oracle
 * pair-count, which multiplies each mesh vert by its ~6 incident tris). This
 * is the gate metric for A4 (≥80% reduction of `visible` vs baseline OFF);
 * counts are over SAMPLED faces (deterministic stride) — compare same-stride.
 *
 * Read-only oracle: never writes positions. CPU-side, spatial-hash
 * accelerated; runs on the GPU readback cadence next to A1.
 *
 * @module facePokeMetric
 */
import type { CollisionMeshData } from './collisionMesh';
import { weld } from './bodyPseudonormals';
import { getRegisteredCollisionMesh } from './penetrationMetric';

/** Above-surface detection band (m): visible pokes deeper than this are missed.
 *  120mm per the 2026-07-02 probe (687 deep pokes at 120mm vs 73 at 30mm) — the
 *  first 60mm baseline run pinned maxDepth at 58.1mm = band-clipped, so the big
 *  visible patches live beyond 60mm. Cost scales ~band³ (grid query volume). */
export const FACE_POKE_BAND_ABOVE = 0.12;

/** Grid cell size (m) for the welded-body-vert hash. */
const CELL = 0.04;

export interface FacePokeMetricBody {
  /** Welded body vert positions (weldedCount*3). */
  verts: Float32Array;
  /** Angle-weighted unit vertex pseudonormals (weldedCount*3). */
  pseudo: Float32Array;
  weldedCount: number;
  /** cell key → welded vert indices. */
  grid: Map<string, number[]>;
}

export interface FacePokeMetric {
  /** Sampled (face, body-vert) pairs with the body vert OUTSIDE the cloth (signed > 0). */
  visible: number;
  /** Sampled pairs inside the collision band (−margin < signed ≤ 0). */
  near: number;
  /** Deepest visible poke seen (m above the cloth surface); 0 when none. */
  maxDepth: number;
  /** Faces actually evaluated (numFaces/stride). */
  sampledFaces: number;
  /** Stride used (publish so gate runs compare same-stride counts). */
  stride: number;
}

const cellKey = (x: number, y: number, z: number) =>
  `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;

/** Build the welded-vert + pseudonormal + grid acceleration. Null for empty mesh. */
export function buildFacePokeMetricBody(mesh: CollisionMeshData): FacePokeMetricBody | null {
  if (mesh.triCount <= 0) return null;
  const { weldedOf, positions, weldedCount } = weld(mesh, 1e-4);
  const fn = mesh.normals;
  const v = mesh.vertices;

  // Angle-weighted face-normal accumulation per welded vert (same recipe as
  // buildBodyPseudonormals, without the per-tri-corner expansion).
  const acc = new Float64Array(weldedCount * 3);
  for (let t = 0; t < mesh.triCount; t++) {
    const o = t * 9;
    for (let lv = 0; lv < 3; lv++) {
      // interior angle at corner lv
      const a = [v[o + lv * 3], v[o + lv * 3 + 1], v[o + lv * 3 + 2]];
      const b0 = ((lv + 1) % 3) * 3, c0 = ((lv + 2) % 3) * 3;
      let ux = v[o + b0] - a[0], uy = v[o + b0 + 1] - a[1], uz = v[o + b0 + 2] - a[2];
      let wx = v[o + c0] - a[0], wy = v[o + c0 + 1] - a[1], wz = v[o + c0 + 2] - a[2];
      const ul = Math.hypot(ux, uy, uz) || 1, wl = Math.hypot(wx, wy, wz) || 1;
      ux /= ul; uy /= ul; uz /= ul; wx /= wl; wy /= wl; wz /= wl;
      const d = Math.max(-1, Math.min(1, ux * wx + uy * wy + uz * wz));
      const ang = Math.acos(d);
      const id = weldedOf[t * 3 + lv] * 3;
      acc[id] += fn[t * 3] * ang;
      acc[id + 1] += fn[t * 3 + 1] * ang;
      acc[id + 2] += fn[t * 3 + 2] * ang;
    }
  }
  const pseudo = new Float32Array(weldedCount * 3);
  for (let i = 0; i < weldedCount; i++) {
    const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1;
    pseudo[i * 3] = acc[i * 3] / l;
    pseudo[i * 3 + 1] = acc[i * 3 + 1] / l;
    pseudo[i * 3 + 2] = acc[i * 3 + 2] / l;
  }

  const grid = new Map<string, number[]>();
  for (let i = 0; i < weldedCount; i++) {
    const k = cellKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const arr = grid.get(k);
    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }
  return { verts: positions, pseudo, weldedCount, grid };
}

/**
 * Count body-vert-through-cloth-face contacts over sampled cloth faces.
 *
 * Sign convention mirrors facePokeCorrection.ts / the GPU kernels: the face
 * normal is oriented OUTWARD from the body by flipping against the body
 * vert's pseudonormal; signed = (p − A)·n_outward. Barycentric inside test is
 * strict (the metric counts true pokes; the response kernels clamp).
 */
export function computeFacePokeMetric(
  clothPositions: Float32Array,
  clothTriIndices: Uint32Array | Uint16Array,
  body: FacePokeMetricBody,
  opts?: { margin?: number; stride?: number; bandAbove?: number },
): FacePokeMetric {
  const margin = opts?.margin ?? 0.008;
  const stride = Math.max(1, opts?.stride ?? 1);
  const bandAbove = opts?.bandAbove ?? FACE_POKE_BAND_ABOVE;
  const numFaces = Math.floor(clothTriIndices.length / 3);
  const { verts, pseudo, grid } = body;

  let visible = 0;
  let near = 0;
  let maxDepth = 0;
  let sampledFaces = 0;

  for (let t = 0; t < numFaces; t += stride) {
    const i0 = clothTriIndices[t * 3], i1 = clothTriIndices[t * 3 + 1], i2 = clothTriIndices[t * 3 + 2];
    const ax = clothPositions[i0 * 3], ay = clothPositions[i0 * 3 + 1], az = clothPositions[i0 * 3 + 2];
    const bx = clothPositions[i1 * 3], by = clothPositions[i1 * 3 + 1], bz = clothPositions[i1 * 3 + 2];
    const cx = clothPositions[i2 * 3], cy = clothPositions[i2 * 3 + 1], cz = clothPositions[i2 * 3 + 2];
    // NaN guard (A3)
    if (ax !== ax || bx !== bx || cx !== cx) continue;
    sampledFaces++;

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const d00 = e1x * e1x + e1y * e1y + e1z * e1z;
    const d01 = e1x * e2x + e1y * e2y + e1z * e2z;
    const d11 = e2x * e2x + e2y * e2y + e2z * e2z;
    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) < 1e-12) continue;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    // Face AABB expanded by the detection band → grid cells to visit.
    const band = Math.max(bandAbove, margin);
    const minX = Math.min(ax, bx, cx) - band, maxX = Math.max(ax, bx, cx) + band;
    const minY = Math.min(ay, by, cy) - band, maxY = Math.max(ay, by, cy) + band;
    const minZ = Math.min(az, bz, cz) - band, maxZ = Math.max(az, bz, cz) + band;

    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gy = Math.floor(minY / CELL); gy <= Math.floor(maxY / CELL); gy++) {
        for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
          const cands = grid.get(`${gx},${gy},${gz}`);
          if (!cands) continue;
          for (const vi of cands) {
            const px = verts[vi * 3], py = verts[vi * 3 + 1], pz = verts[vi * 3 + 2];
            if (px < minX || px > maxX || py < minY || py > maxY || pz < minZ || pz > maxZ) continue;

            // Orient the face normal outward from the body (flip vs pseudonormal).
            const dotPn = nx * pseudo[vi * 3] + ny * pseudo[vi * 3 + 1] + nz * pseudo[vi * 3 + 2];
            const s = dotPn < 0 ? -1 : 1;
            const ox = nx * s, oy = ny * s, oz = nz * s;

            const wpx = px - ax, wpy = py - ay, wpz = pz - az;
            const signed = wpx * ox + wpy * oy + wpz * oz;
            if (signed <= -margin || signed > bandAbove) continue;

            const d20 = wpx * e1x + wpy * e1y + wpz * e1z;
            const d21 = wpx * e2x + wpy * e2y + wpz * e2z;
            const beta = (d11 * d20 - d01 * d21) / denom;
            const gamma = (d00 * d21 - d01 * d20) / denom;
            const alpha = 1 - beta - gamma;
            if (alpha < 0 || beta < 0 || gamma < 0) continue;

            if (signed > 0) {
              visible++;
              if (signed > maxDepth) maxDepth = signed;
            } else {
              near++;
            }
          }
        }
      }
    }
  }

  return { visible, near, maxDepth, sampledFaces, stride };
}

/** Deterministic face-sampling stride for the main-thread wiring (~7k faces
 *  sampled ≈ 2-5ms measured band; María 57k faces → stride 8). */
const FACE_SAMPLE_BUDGET = 7000;
export function facePokeStrideFor(numFaces: number): number {
  return Math.max(1, Math.ceil(numFaces / FACE_SAMPLE_BUDGET));
}

// ─── Body accessor ────────────────────────────────────────────────────────────
// Piggybacks on penetrationMetric's registry (one registry, N derived caches):
// registered/cleared by useSimulationLifecycle at 5 sites — this stays in sync
// for free. Lazy build keyed on mesh identity.

let builtBody: (FacePokeMetricBody & { mesh: CollisionMeshData }) | null = null;

export function getFacePokeMetricBody(): FacePokeMetricBody | null {
  const mesh = getRegisteredCollisionMesh();
  if (mesh === null) {
    builtBody = null;
    return null;
  }
  if (builtBody === null || builtBody.mesh !== mesh) {
    const b = buildFacePokeMetricBody(mesh);
    builtBody = b ? { ...b, mesh } : null;
  }
  return builtBody;
}

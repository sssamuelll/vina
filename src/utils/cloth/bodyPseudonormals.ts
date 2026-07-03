// src/utils/cloth/bodyPseudonormals.ts
import type { CollisionMeshData } from './collisionMesh';

export interface BodyPseudonormals {
  /** triCount*9 — per tri: 3 edge pseudonormals (AB, BC, CA) × xyz, unit. */
  edge: Float32Array;
  /** triCount*9 — per tri: 3 vertex pseudonormals (A, B, C) × xyz, unit. */
  vertex: Float32Array;
}

/** Quantize a vertex to an integer grid key for welding within `eps`. */
function vkey(x: number, y: number, z: number, eps: number): string {
  const q = 1 / eps;
  return `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
}

/** Weld soup verts; return per-soup-vert the welded index + the welded positions.
 *  Exported for facePokeMetric (welded body verts = soup sin multiplicidad). */
export function weld(mesh: CollisionMeshData, eps: number) {
  const v = mesh.vertices;
  const map = new Map<string, number>();
  const weldedOf = new Int32Array(mesh.triCount * 3); // soup vert i -> welded id
  const pos: number[] = [];
  for (let i = 0; i < mesh.triCount * 3; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    const k = vkey(x, y, z, eps);
    let id = map.get(k);
    if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(x, y, z); }
    weldedOf[i] = id;
  }
  return { weldedOf, positions: new Float32Array(pos), weldedCount: pos.length / 3 };
}

export function weldAndCountManifold(mesh: CollisionMeshData, eps: number) {
  const { weldedOf, weldedCount } = weld(mesh, eps);
  // Count edge usage by welded-vertex pair (unordered).
  const use = new Map<string, number>();
  const band = new Map<string, number>();
  const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < mesh.triCount; t++) {
    const a = weldedOf[t * 3], b = weldedOf[t * 3 + 1], c = weldedOf[t * 3 + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = ek(p, q);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let nonManifoldEdges = 0, boundaryEdges = 0;
  for (const n of use.values()) {
    if (n === 1) boundaryEdges++;
    else if (n > 2) nonManifoldEdges++;
  }
  // y-band histogram of non-manifold edges for armpit/armscye locating — fill on
  // demand from the welded positions; omitted here for brevity in the count path.
  void band;
  return { welded: weldedCount, tris: mesh.triCount, nonManifoldEdges, boundaryEdges, byBand: {} as Record<string, number> };
}

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Interior angle of triangle t at its local vertex `lv` (0=A,1=B,2=C). */
function vertexAngle(v: Float32Array, t: number, lv: number): number {
  const o = t * 9;
  const P = (k: number): [number, number, number] => [v[o + k * 3], v[o + k * 3 + 1], v[o + k * 3 + 2]];
  const a = P(lv), b = P((lv + 1) % 3), c = P((lv + 2) % 3);
  const u = norm3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const w = norm3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const d = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]));
  return Math.acos(d);
}

export function buildBodyPseudonormals(mesh: CollisionMeshData, eps = 1e-4): BodyPseudonormals {
  const { weldedOf } = weld(mesh, eps);
  const N = mesh.triCount;
  const fn = mesh.normals; // 3 floats/tri (unit face normals)

  // Accumulate angle-weighted face normals per welded vertex, and summed face
  // normals per welded edge.
  const vAcc = new Map<number, [number, number, number]>();
  const eAcc = new Map<string, [number, number, number]>();
  const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < N; t++) {
    const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2];
    const w = [weldedOf[t * 3], weldedOf[t * 3 + 1], weldedOf[t * 3 + 2]];
    for (let lv = 0; lv < 3; lv++) {
      const ang = vertexAngle(mesh.vertices, t, lv);
      const id = w[lv];
      const acc = vAcc.get(id) ?? [0, 0, 0];
      acc[0] += nx * ang; acc[1] += ny * ang; acc[2] += nz * ang;
      vAcc.set(id, acc);
    }
    for (const [p, q] of [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]] as const) {
      const k = ek(p, q);
      const acc = eAcc.get(k) ?? [0, 0, 0];
      acc[0] += nx; acc[1] += ny; acc[2] += nz;
      eAcc.set(k, acc);
    }
  }

  const edge = new Float32Array(N * 9);
  const vertex = new Float32Array(N * 9);
  for (let t = 0; t < N; t++) {
    const w = [weldedOf[t * 3], weldedOf[t * 3 + 1], weldedOf[t * 3 + 2]];
    // edges in order AB(0), BC(1), CA(2)
    const epairs = [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]] as const;
    for (let e = 0; e < 3; e++) {
      const acc = eAcc.get(ek(epairs[e][0], epairs[e][1]))!;
      const [x, y, z] = norm3(acc[0], acc[1], acc[2]);
      edge[t * 9 + e * 3] = x; edge[t * 9 + e * 3 + 1] = y; edge[t * 9 + e * 3 + 2] = z;
    }
    // vertices in order A(0), B(1), C(2)
    for (let lv = 0; lv < 3; lv++) {
      const acc = vAcc.get(w[lv])!;
      const [x, y, z] = norm3(acc[0], acc[1], acc[2]);
      vertex[t * 9 + lv * 3] = x; vertex[t * 9 + lv * 3 + 1] = y; vertex[t * 9 + lv * 3 + 2] = z;
    }
  }
  return { edge, vertex };
}

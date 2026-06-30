// src/utils/cloth/facePokeCorrection.ts

export interface FacePokeResult {
  dA: [number, number, number];
  dB: [number, number, number];
  dC: [number, number, number];
}

/**
 * v1 face-poke correction: body VERTICES vs a single cloth face.
 * Pure geometry — the GPU kernel (TSL) mirrors this exactly. Body EDGES are
 * out of v1 (measured escalation).
 *
 * @param bodyVerts CollisionMeshData.vertices (triCount*9; we treat the 3 verts/tri as candidate body points)
 * @param bodyVertPseudo BodyPseudonormals.vertex (triCount*9; vertex-pseudonormal per body vert, same layout)
 */
export function facePokeCorrection(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  bodyVerts: Float32Array,
  bodyVertPseudo: Float32Array,
  margin: number,
): FacePokeResult {
  // Face plane normal n = (B-A) x (C-A), normalized.
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  const dA: [number, number, number] = [0, 0, 0];
  const dB: [number, number, number] = [0, 0, 0];
  const dC: [number, number, number] = [0, 0, 0];

  // Precompute for barycentric (cached dot products of edge vectors).
  const d00 = e1x * e1x + e1y * e1y + e1z * e1z;
  const d01 = e1x * e2x + e1y * e2y + e1z * e2z;
  const d11 = e2x * e2x + e2y * e2y + e2z * e2z;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return { dA, dB, dC };

  const nVerts = bodyVerts.length / 3;
  for (let v = 0; v < nVerts; v++) {
    const px = bodyVerts[v * 3], py = bodyVerts[v * 3 + 1], pz = bodyVerts[v * 3 + 2];
    // Outward orientation via this body vertex's pseudonormal.
    const pnx = bodyVertPseudo[v * 3], pny = bodyVertPseudo[v * 3 + 1], pnz = bodyVertPseudo[v * 3 + 2];
    let ox = nx, oy = ny, oz = nz;
    if (ox * pnx + oy * pny + oz * pnz < 0) { ox = -ox; oy = -oy; oz = -oz; }
    // Signed distance of P from the face plane, along outward normal.
    const signed = (px - ax) * ox + (py - ay) * oy + (pz - az) * oz;
    if (signed <= -margin) continue; // body vertex safely >= margin behind the face → no violation
    // Barycentric of P projected onto the triangle.
    const wx = px - ax, wy = py - ay, wz = pz - az;
    const d20 = wx * e1x + wy * e1y + wz * e1z;
    const d21 = wx * e2x + wy * e2y + wz * e2z;
    const beta = (d11 * d20 - d01 * d21) / denom;
    const gamma = (d00 * d21 - d01 * d20) / denom;
    const alpha = 1 - beta - gamma;
    if (alpha < 0 || beta < 0 || gamma < 0) continue; // projects outside the triangle
    const depth = signed + margin; // > 0 — push the face out until the body vert sits margin behind it
    const s = alpha * alpha + beta * beta + gamma * gamma;
    if (s === 0) continue;
    const ka = (alpha / s) * depth, kb = (beta / s) * depth, kg = (gamma / s) * depth;
    dA[0] += ka * ox; dA[1] += ka * oy; dA[2] += ka * oz;
    dB[0] += kb * ox; dB[1] += kb * oy; dB[2] += kb * oz;
    dC[0] += kg * ox; dC[1] += kg * oy; dC[2] += kg * oz;
  }
  return { dA, dB, dC };
}

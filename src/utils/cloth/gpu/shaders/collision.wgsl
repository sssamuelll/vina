// ─── Body Collision Compute Shader ──────────────────────────────────────────
//
// Brute-force point-vs-triangle collision for cloth against avatar/props.
// Each thread handles one cloth particle and tests it against ALL collision
// triangles. For typical garment meshes (~5K particles, ~10K collision tris)
// this is fast enough (~0.5ms per frame on mid-range GPU).
//
// The collision mesh vertices are pre-expanded: 9 floats per triangle
// (3 vertices × 3 components). Normals are 3 floats per triangle.
// ─────────────────────────────────────────────────────────────────────────────

struct CollisionParams {
  numParticles: u32,
  numTriangles: u32,
  margin: f32,
  friction: f32,
};

@group(0) @binding(0) var<storage, read_write> pos: array<f32>;
@group(0) @binding(1) var<storage, read> collisionVerts: array<f32>;
@group(0) @binding(2) var<storage, read> collisionNormals: array<f32>;
@group(0) @binding(3) var<uniform> cparams: CollisionParams;

@compute @workgroup_size(256)
fn solveBodyCollision(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= cparams.numParticles) { return; }

  let idx = pi * 3u;
  var px = pos[idx];
  var py = pos[idx + 1u];
  var pz = pos[idx + 2u];

  // Track the closest penetrating triangle
  var minDist: f32 = 1e10;
  var pushX: f32 = 0.0;
  var pushY: f32 = 0.0;
  var pushZ: f32 = 0.0;
  var collided = false;

  for (var t: u32 = 0u; t < cparams.numTriangles; t++) {
    let vi = t * 9u;  // 3 verts × 3 components
    let ni = t * 3u;

    let ax = collisionVerts[vi];
    let ay = collisionVerts[vi + 1u];
    let az = collisionVerts[vi + 2u];
    let bx = collisionVerts[vi + 3u];
    let by = collisionVerts[vi + 4u];
    let bz = collisionVerts[vi + 5u];
    let cx = collisionVerts[vi + 6u];
    let cy = collisionVerts[vi + 7u];
    let cz = collisionVerts[vi + 8u];

    let nnx = collisionNormals[ni];
    let nny = collisionNormals[ni + 1u];
    let nnz = collisionNormals[ni + 2u];

    // Vector from triangle vertex A to particle
    let apx = px - ax;
    let apy = py - ay;
    let apz = pz - az;

    // Signed distance to triangle plane
    let planeDist = apx * nnx + apy * nny + apz * nnz;

    // Only consider particles within margin distance of the front side
    if (planeDist > cparams.margin || planeDist < -cparams.margin) {
      continue;
    }

    // Project particle onto triangle plane
    let projx = px - planeDist * nnx;
    let projy = py - planeDist * nny;
    let projz = pz - planeDist * nnz;

    // Barycentric coordinates to check if projection is inside triangle
    let abx = bx - ax; let aby = by - ay; let abz = bz - az;
    let acx = cx - ax; let acy = cy - ay; let acz = cz - az;
    let v0x = projx - ax; let v0y = projy - ay; let v0z = projz - az;

    let d00 = abx * abx + aby * aby + abz * abz;
    let d01 = abx * acx + aby * acy + abz * acz;
    let d02 = abx * v0x + aby * v0y + abz * v0z;
    let d11 = acx * acx + acy * acy + acz * acz;
    let d12 = acx * v0x + acy * v0y + acz * v0z;

    let denom = d00 * d11 - d01 * d01;
    if (abs(denom) < 1e-12) { continue; }

    let invD = 1.0 / denom;
    let u = (d11 * d02 - d01 * d12) * invD;
    let v = (d00 * d12 - d01 * d02) * invD;

    // Check if point is inside the triangle
    if (u < 0.0 || v < 0.0 || u + v > 1.0) { continue; }

    // Penetrating or within margin — compute push distance
    let absDist = abs(planeDist);
    if (absDist < minDist) {
      minDist = absDist;
      // Push particle to the surface (margin distance along normal)
      let pushDist = cparams.margin - planeDist;
      pushX = pushDist * nnx;
      pushY = pushDist * nny;
      pushZ = pushDist * nnz;
      collided = true;
    }
  }

  if (collided) {
    // Apply collision correction
    pos[idx]      += pushX;
    pos[idx + 1u] += pushY;
    pos[idx + 2u] += pushZ;
  }
}

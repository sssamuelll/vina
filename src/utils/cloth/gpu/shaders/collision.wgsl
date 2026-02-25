// ─── SDF Body Collision Compute Shader ──────────────────────────────────────
//
// Samples a 3D Signed Distance Field (SDF) for each cloth particle.
// If a particle is inside or near the body surface, push it out along
// the SDF gradient. SDF is generated CPU-side from the avatar mesh
// and uploaded as a flat storage buffer.
//
// Trilinear interpolation for smooth collision response.
// Finite differences for gradient computation.
// ─────────────────────────────────────────────────────────────────────────────

struct CollisionParams {
  numParticles: u32,
  resolution: u32,         // SDF grid resolution (e.g. 64)
  _pad0: u32,
  _pad1: u32,
  minX: f32,               // SDF bounding box min
  minY: f32,
  minZ: f32,
  cellSize: f32,           // SDF cell size
  collisionMargin: f32,    // push-out distance (e.g. 0.005m)
  friction: f32,           // surface friction (0-1)
  _pad2: f32,
  _pad3: f32,
};

@group(0) @binding(0) var<uniform> cparams: CollisionParams;
@group(0) @binding(1) var<storage, read_write> pos: array<f32>;
@group(0) @binding(2) var<storage, read_write> prevPos: array<f32>;
@group(0) @binding(3) var<storage, read> invMass: array<f32>;
@group(0) @binding(4) var<storage, read> sdfVolume: array<f32>;

// ─── SDF Sampling (trilinear interpolation) ─────────────────────────────────

fn sdfIndex(x: u32, y: u32, z: u32) -> u32 {
  return z * cparams.resolution * cparams.resolution + y * cparams.resolution + x;
}

fn sampleSDF(px: f32, py: f32, pz: f32) -> f32 {
  let res = cparams.resolution;

  // Convert world → grid coords
  let gx = (px - cparams.minX) / cparams.cellSize;
  let gy = (py - cparams.minY) / cparams.cellSize;
  let gz = (pz - cparams.minZ) / cparams.cellSize;

  let fRes = f32(res - 1u);

  // Bounds check — outside grid means far from body
  if (gx < 0.0 || gx >= fRes || gy < 0.0 || gy >= fRes || gz < 0.0 || gz >= fRes) {
    return 1.0;
  }

  // Grid cell indices
  let x0 = u32(floor(gx));
  let y0 = u32(floor(gy));
  let z0 = u32(floor(gz));
  let x1 = min(x0 + 1u, res - 1u);
  let y1 = min(y0 + 1u, res - 1u);
  let z1 = min(z0 + 1u, res - 1u);

  // Fractional part
  let fx = gx - f32(x0);
  let fy = gy - f32(y0);
  let fz = gz - f32(z0);

  // 8 corner samples
  let c000 = sdfVolume[sdfIndex(x0, y0, z0)];
  let c100 = sdfVolume[sdfIndex(x1, y0, z0)];
  let c010 = sdfVolume[sdfIndex(x0, y1, z0)];
  let c110 = sdfVolume[sdfIndex(x1, y1, z0)];
  let c001 = sdfVolume[sdfIndex(x0, y0, z1)];
  let c101 = sdfVolume[sdfIndex(x1, y0, z1)];
  let c011 = sdfVolume[sdfIndex(x0, y1, z1)];
  let c111 = sdfVolume[sdfIndex(x1, y1, z1)];

  // Trilinear interpolation
  let c00 = c000 * (1.0 - fx) + c100 * fx;
  let c01 = c001 * (1.0 - fx) + c101 * fx;
  let c10 = c010 * (1.0 - fx) + c110 * fx;
  let c11 = c011 * (1.0 - fx) + c111 * fx;

  let c0 = c00 * (1.0 - fy) + c10 * fy;
  let c1 = c01 * (1.0 - fy) + c11 * fy;

  return c0 * (1.0 - fz) + c1 * fz;
}

// ─── SDF Gradient (finite differences) ──────────────────────────────────────

fn sdfGradient(px: f32, py: f32, pz: f32) -> vec3f {
  let h = cparams.cellSize * 0.5;

  let dx = sampleSDF(px + h, py, pz) - sampleSDF(px - h, py, pz);
  let dy = sampleSDF(px, py + h, pz) - sampleSDF(px, py - h, pz);
  let dz = sampleSDF(px, py, pz + h) - sampleSDF(px, py, pz - h);

  let grad = vec3f(dx, dy, dz);
  let len = length(grad);

  if (len < 1e-8) {
    return vec3f(0.0, 1.0, 0.0); // default push up
  }

  return grad / len;
}

// ─── Main Collision Kernel ──────────────────────────────────────────────────

@compute @workgroup_size(256)
fn solveCollision(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= cparams.numParticles) { return; }
  if (invMass[i] == 0.0) { return; } // pinned

  let idx = i * 3u;
  let px = pos[idx];
  let py = pos[idx + 1];
  let pz = pos[idx + 2];

  let dist = sampleSDF(px, py, pz);

  // Only correct if inside or within margin
  if (dist < cparams.collisionMargin) {
    let grad = sdfGradient(px, py, pz);
    let correction = cparams.collisionMargin - dist;

    // Push particle out along gradient
    let newPx = px + grad.x * correction;
    let newPy = py + grad.y * correction;
    let newPz = pz + grad.z * correction;

    // Apply friction: project velocity onto surface plane
    if (cparams.friction > 0.0) {
      // Velocity = (newPos - prevPos) projected onto tangent plane
      let vpx = newPx - prevPos[idx];
      let vpy = newPy - prevPos[idx + 1];
      let vpz = newPz - prevPos[idx + 2];

      // Normal component
      let vn = vpx * grad.x + vpy * grad.y + vpz * grad.z;

      // Tangential component
      let vtx = vpx - vn * grad.x;
      let vty = vpy - vn * grad.y;
      let vtz = vpz - vn * grad.z;

      let vtLen = sqrt(vtx * vtx + vty * vty + vtz * vtz);

      if (vtLen > 1e-8) {
        // Coulomb friction: reduce tangential velocity
        let fricScale = max(0.0, 1.0 - cparams.friction * abs(vn) / vtLen);
        pos[idx]     = prevPos[idx]     + vtx * fricScale + vn * grad.x;
        pos[idx + 1] = prevPos[idx + 1] + vty * fricScale + vn * grad.y;
        pos[idx + 2] = prevPos[idx + 2] + vtz * fricScale + vn * grad.z;
      } else {
        pos[idx]     = newPx;
        pos[idx + 1] = newPy;
        pos[idx + 2] = newPz;
      }
    } else {
      pos[idx]     = newPx;
      pos[idx + 1] = newPy;
      pos[idx + 2] = newPz;
    }
  }
}

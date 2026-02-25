// ─── Constraint Solvers ─────────────────────────────────────────────────────
//
// Distance (stretch) and bending constraints for XPBD cloth.
// Each constraint is solved independently per workgroup invocation.
// Multiple substep iterations are dispatched from the CPU side.
// ─────────────────────────────────────────────────────────────────────────────

struct SimParams {
  numParticles: u32,
  numStretchConstraints: u32,
  numBendConstraints: u32,
  numSeamConstraints: u32,
  sdt: f32,
  substeps: f32,
  gravityX: f32,
  gravityY: f32,
  gravityZ: f32,
  damping: f32,
  stretchCompliance: f32,
  bendCompliance: f32,
  seamStiffness: f32,
  groundY: f32,
  collisionMargin: f32,
  clothThickness: f32,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> pos: array<f32>;
@group(0) @binding(4) var<storage, read> invMass: array<f32>;

// Stretch constraint buffers
@group(1) @binding(0) var<storage, read> stretchIds: array<u32>;
@group(1) @binding(1) var<storage, read> stretchRestLen: array<f32>;

// ─── Stretch (Distance) Constraints ─────────────────────────────────────────

@compute @workgroup_size(256)
fn solveStretch(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.numStretchConstraints) { return; }

  let id0 = stretchIds[i * 2u];
  let id1 = stretchIds[i * 2u + 1u];

  let w0 = invMass[id0];
  let w1 = invMass[id1];
  let w = w0 + w1;
  if (w == 0.0) { return; }

  let idx0 = id0 * 3u;
  let idx1 = id1 * 3u;

  let dx = pos[idx0]     - pos[idx1];
  let dy = pos[idx0 + 1] - pos[idx1 + 1];
  let dz = pos[idx0 + 2] - pos[idx1 + 2];

  let len = sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) { return; }

  let restLen = stretchRestLen[i];
  let C = len - restLen;
  let alpha = params.stretchCompliance / (params.sdt * params.sdt);
  let s = -C / (w + alpha);

  let gx = dx / len;
  let gy = dy / len;
  let gz = dz / len;

  pos[idx0]     += gx * s * w0;
  pos[idx0 + 1] += gy * s * w0;
  pos[idx0 + 2] += gz * s * w0;

  pos[idx1]     -= gx * s * w1;
  pos[idx1 + 1] -= gy * s * w1;
  pos[idx1 + 2] -= gz * s * w1;
}

// ─── Seam Constraints ───────────────────────────────────────────────────────
// Pull sewed vertices together. Same structure as stretch but with
// higher stiffness and target distance = 0.

@group(2) @binding(0) var<storage, read> seamIds: array<u32>;
@group(2) @binding(1) var<storage, read> seamTargetDist: array<f32>;

@compute @workgroup_size(256)
fn solveSeams(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.numSeamConstraints) { return; }

  let id0 = seamIds[i * 2u];
  let id1 = seamIds[i * 2u + 1u];

  let w0 = invMass[id0];
  let w1 = invMass[id1];
  let w = w0 + w1;
  if (w == 0.0) { return; }

  let idx0 = id0 * 3u;
  let idx1 = id1 * 3u;

  let dx = pos[idx0]     - pos[idx1];
  let dy = pos[idx0 + 1] - pos[idx1 + 1];
  let dz = pos[idx0 + 2] - pos[idx1 + 2];

  let len = sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) { return; }

  let target = seamTargetDist[i];
  let C = len - target;
  let alpha = params.seamStiffness / (params.sdt * params.sdt);
  let s = -C / (w + alpha);

  let gx = dx / len;
  let gy = dy / len;
  let gz = dz / len;

  pos[idx0]     += gx * s * w0;
  pos[idx0 + 1] += gy * s * w0;
  pos[idx0 + 2] += gz * s * w0;

  pos[idx1]     -= gx * s * w1;
  pos[idx1 + 1] -= gy * s * w1;
  pos[idx1 + 2] -= gz * s * w1;
}

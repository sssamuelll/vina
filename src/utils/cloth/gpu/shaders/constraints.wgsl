// ─── Constraint Solvers ─────────────────────────────────────────────────────
//
// Distance (stretch) and seam constraints for XPBD cloth.
//
// Constraints are graph-colored and dispatched per-color to avoid race
// conditions on shared vertices. Each color group gets its own bind group
// with a subset of constraints and a per-dispatch count uniform.
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

// Per-color constraint buffers (swapped between dispatches)
@group(1) @binding(0) var<storage, read> stretchIds: array<u32>;
@group(1) @binding(1) var<storage, read> stretchRestLen: array<f32>;

// Per-dispatch constraint count (set per color group)
struct DispatchParams {
  count: u32,
};
@group(1) @binding(2) var<uniform> dispatchParams: DispatchParams;

// ─── Stretch (Distance) Constraints ─────────────────────────────────────────

@compute @workgroup_size(256)
fn solveStretch(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= dispatchParams.count) { return; }

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

  let len2 = dx * dx + dy * dy + dz * dz;
  if (len2 != len2 || len2 < 1e-20) { return; } // NaN or near-zero guard
  let len = sqrt(len2);

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

// ─── Bend (Distance) Constraints ────────────────────────────────────────────
// Reuses group(1) bindings but interprets IDs as quads [a, b, c, d].
// Applies distance constraint between opposite vertices c (index 2) and d (index 3).
// Uses bendCompliance from SimParams for softer bending resistance.

@compute @workgroup_size(256)
fn solveBend(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= dispatchParams.count) { return; }

  // Quad layout: [a, b, c, d] — use c and d (opposite vertices)
  let id0 = stretchIds[i * 4u + 2u];
  let id1 = stretchIds[i * 4u + 3u];

  let w0 = invMass[id0];
  let w1 = invMass[id1];
  let w = w0 + w1;
  if (w == 0.0) { return; }

  let idx0 = id0 * 3u;
  let idx1 = id1 * 3u;

  let dx = pos[idx0]     - pos[idx1];
  let dy = pos[idx0 + 1] - pos[idx1 + 1];
  let dz = pos[idx0 + 2] - pos[idx1 + 2];

  let len2 = dx * dx + dy * dy + dz * dz;
  if (len2 != len2 || len2 < 1e-20) { return; }
  let len = sqrt(len2);

  let restLen = stretchRestLen[i];
  let C = len - restLen;
  let alpha = params.bendCompliance / (params.sdt * params.sdt);
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

@group(2) @binding(0) var<storage, read> seamIds: array<u32>;
@group(2) @binding(1) var<storage, read> seamTargetDist: array<f32>;
@group(2) @binding(2) var<uniform> seamDispatch: DispatchParams;

@compute @workgroup_size(256)
fn solveSeams(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= seamDispatch.count) { return; }

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

  let len2s = dx * dx + dy * dy + dz * dz;
  if (len2s != len2s || len2s < 1e-20) { return; } // NaN or near-zero guard
  let len = sqrt(len2s);

  let tgt = seamTargetDist[i];
  let C = len - tgt;
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

// ─── Cloth Simulation Compute Shaders ───────────────────────────────────────
//
// XPBD cloth simulation running entirely on GPU.
// Based on Matthias Müller's "Ten Minute Physics" XPBD approach.
//
// Buffer layout must match gpuBuffers.ts packSimParams() exactly.
// ─────────────────────────────────────────────────────────────────────────────

struct SimParams {
  numParticles: u32,
  numStretchConstraints: u32,
  numBendConstraints: u32,
  numSeamConstraints: u32,
  sdt: f32,                    // substep delta time
  substeps: f32,               // (unused in shader, loop on CPU side)
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
@group(0) @binding(2) var<storage, read_write> prevPos: array<f32>;
@group(0) @binding(3) var<storage, read_write> vel: array<f32>;
@group(0) @binding(4) var<storage, read> invMass: array<f32>;

// ─── Pre-solve: gravity integration ─────────────────────────────────────────

@compute @workgroup_size(256)
fn preSolve(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.numParticles) { return; }

  let w = invMass[i];
  if (w == 0.0) { return; } // pinned

  let idx = i * 3u;

  // Save previous position
  prevPos[idx]     = pos[idx];
  prevPos[idx + 1] = pos[idx + 1];
  prevPos[idx + 2] = pos[idx + 2];

  // Apply gravity + damping
  vel[idx]     = vel[idx]     * params.damping + params.gravityX * params.sdt;
  vel[idx + 1] = vel[idx + 1] * params.damping + params.gravityY * params.sdt;
  vel[idx + 2] = vel[idx + 2] * params.damping + params.gravityZ * params.sdt;

  // Integrate position
  pos[idx]     = pos[idx]     + vel[idx]     * params.sdt;
  pos[idx + 1] = pos[idx + 1] + vel[idx + 1] * params.sdt;
  pos[idx + 2] = pos[idx + 2] + vel[idx + 2] * params.sdt;

  // Ground plane collision
  if (pos[idx + 1] < params.groundY) {
    pos[idx]     = prevPos[idx];
    pos[idx + 1] = params.groundY;
    pos[idx + 2] = prevPos[idx + 2];
  }
}

// ─── Post-solve: velocity update ────────────────────────────────────────────

@compute @workgroup_size(256)
fn postSolve(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.numParticles) { return; }

  let w = invMass[i];
  if (w == 0.0) { return; }

  let idx = i * 3u;
  let invDt = 1.0 / params.sdt;

  vel[idx]     = (pos[idx]     - prevPos[idx])     * invDt;
  vel[idx + 1] = (pos[idx + 1] - prevPos[idx + 1]) * invDt;
  vel[idx + 2] = (pos[idx + 2] - prevPos[idx + 2]) * invDt;
}

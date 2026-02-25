// ─── Vertex Normal Recomputation ────────────────────────────────────────────
//
// Two-pass normal computation:
// Pass 1: Compute face normals, atomically accumulate to vertex normals
// Pass 2: Normalize vertex normals
//
// This runs AFTER all constraint solving, BEFORE rendering.
// ─────────────────────────────────────────────────────────────────────────────

struct NormalParams {
  numParticles: u32,
  numTriangles: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> nparams: NormalParams;
@group(0) @binding(1) var<storage, read> pos: array<f32>;
@group(0) @binding(2) var<storage, read> triIds: array<u32>;
@group(0) @binding(3) var<storage, read_write> normals: array<atomic<i32>>;

// ─── Pass 1: Accumulate face normals to vertices ────────────────────────────
// We use atomic<i32> with fixed-point encoding (multiply by 1000) because
// WGSL doesn't support atomic<f32>.

@compute @workgroup_size(256)
fn accumulateNormals(@builtin(global_invocation_id) gid: vec3u) {
  let t = gid.x;
  if (t >= nparams.numTriangles) { return; }

  let i0 = triIds[t * 3u];
  let i1 = triIds[t * 3u + 1u];
  let i2 = triIds[t * 3u + 2u];

  // Edge vectors
  let e1x = pos[i1 * 3u]     - pos[i0 * 3u];
  let e1y = pos[i1 * 3u + 1] - pos[i0 * 3u + 1];
  let e1z = pos[i1 * 3u + 2] - pos[i0 * 3u + 2];

  let e2x = pos[i2 * 3u]     - pos[i0 * 3u];
  let e2y = pos[i2 * 3u + 1] - pos[i0 * 3u + 1];
  let e2z = pos[i2 * 3u + 2] - pos[i0 * 3u + 2];

  // Cross product (face normal, not normalized — area-weighted)
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;

  // Fixed-point encode (×1000) and atomic add to each vertex
  let scale = 1000.0;
  let inx = i32(nx * scale);
  let iny = i32(ny * scale);
  let inz = i32(nz * scale);

  // Vertex 0
  atomicAdd(&normals[i0 * 3u],     inx);
  atomicAdd(&normals[i0 * 3u + 1], iny);
  atomicAdd(&normals[i0 * 3u + 2], inz);

  // Vertex 1
  atomicAdd(&normals[i1 * 3u],     inx);
  atomicAdd(&normals[i1 * 3u + 1], iny);
  atomicAdd(&normals[i1 * 3u + 2], inz);

  // Vertex 2
  atomicAdd(&normals[i2 * 3u],     inx);
  atomicAdd(&normals[i2 * 3u + 1], iny);
  atomicAdd(&normals[i2 * 3u + 2], inz);
}

// ─── Pass 2: Normalize + convert back to float ─────────────────────────────

// Output normals as float (separate buffer for rendering)
@group(0) @binding(4) var<storage, read_write> normalsFlt: array<f32>;

@compute @workgroup_size(256)
fn normalizeNormals(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= nparams.numParticles) { return; }

  let idx = i * 3u;
  let scale = 1.0 / 1000.0;

  let nx = f32(atomicLoad(&normals[idx]))     * scale;
  let ny = f32(atomicLoad(&normals[idx + 1])) * scale;
  let nz = f32(atomicLoad(&normals[idx + 2])) * scale;

  let len = sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-8) {
    let invLen = 1.0 / len;
    normalsFlt[idx]     = nx * invLen;
    normalsFlt[idx + 1] = ny * invLen;
    normalsFlt[idx + 2] = nz * invLen;
  } else {
    normalsFlt[idx]     = 0.0;
    normalsFlt[idx + 1] = 1.0;
    normalsFlt[idx + 2] = 0.0;
  }

  // Reset atomic accumulators for next frame
  atomicStore(&normals[idx],     0);
  atomicStore(&normals[idx + 1], 0);
  atomicStore(&normals[idx + 2], 0);
}

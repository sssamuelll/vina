// ─── Self-Collision via Spatial Hash (GPU) ──────────────────────────────────
//
// 4-pass approach (Müller "Ten Minute Physics" adapted for GPU):
//   1. hashCount:  each particle hashes to cell, atomicAdd to cellCount
//   2. prefixSum:  parallel prefix sum to build cellStart
//   3. scatter:    each particle writes its index to sorted entries array
//   4. resolve:    each particle queries 27 neighbor cells, pushes apart
//
// Adjacency is pre-uploaded (flat list + offsets) to skip connected neighbors.
// ─────────────────────────────────────────────────────────────────────────────

struct SelfCollisionParams {
  numParticles: u32,
  tableSize: u32,       // prime, ~2×numParticles
  thickness: f32,       // cloth thickness (min separation)
  _pad0: u32,
};

// ─── Bindings ───────────────────────────────────────────────────────────────

// Group 0: self-collision-specific
@group(0) @binding(0) var<uniform> scParams: SelfCollisionParams;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read> invMass: array<f32>;
@group(0) @binding(3) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(5) var<storage, read_write> cellEntries: array<u32>;

// Group 1: adjacency (read-only, uploaded once)
@group(1) @binding(0) var<storage, read> adjOffsets: array<u32>;   // numParticles+1 (CSR format)
@group(1) @binding(1) var<storage, read> adjNeighbors: array<u32>; // flat neighbor list

// ─── Hash Function ──────────────────────────────────────────────────────────

fn hashCoords(xi: i32, yi: i32, zi: i32) -> u32 {
  let h = ((xi * 92837111) ^ (yi * 689287499) ^ (zi * 283923481)) % i32(scParams.tableSize);
  if (h < 0) {
    return u32(h + i32(scParams.tableSize));
  }
  return u32(h);
}

fn intCoord(v: f32, invCellSize: f32) -> i32 {
  return i32(floor(v * invCellSize));
}

// ─── Pass 1: Hash + Count ───────────────────────────────────────────────────

@compute @workgroup_size(256)
fn hashCount(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let invCS = 1.0 / scParams.thickness; // cell size = thickness
  let idx = i * 3u;
  let h = hashCoords(
    intCoord(positions[idx], invCS),
    intCoord(positions[idx + 1u], invCS),
    intCoord(positions[idx + 2u], invCS),
  );

  atomicAdd(&cellCount[h], 1u);
}

// ─── Pass 2: Prefix Sum (simple serial — run with 1 workgroup) ──────────────
// For large meshes a parallel Blelloch scan would be better, but serial
// on a single workgroup is fine up to ~256K cells (128K particles).

@compute @workgroup_size(1)
fn prefixSum(@builtin(global_invocation_id) gid: vec3u) {
  var running: u32 = 0u;
  for (var i: u32 = 0u; i < scParams.tableSize; i++) {
    let count = atomicLoad(&cellCount[i]);
    cellStart[i] = running;
    running += count;
    // Reset count for scatter pass reuse
    atomicStore(&cellCount[i], 0u);
  }
}

// ─── Pass 3: Scatter ────────────────────────────────────────────────────────

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let invCS = 1.0 / scParams.thickness;
  let idx = i * 3u;
  let h = hashCoords(
    intCoord(positions[idx], invCS),
    intCoord(positions[idx + 1u], invCS),
    intCoord(positions[idx + 2u], invCS),
  );

  let offset = atomicAdd(&cellCount[h], 1u);
  cellEntries[cellStart[h] + offset] = i;
}

// ─── Adjacency check ────────────────────────────────────────────────────────

fn isAdjacent(i: u32, j: u32) -> bool {
  let start = adjOffsets[i];
  let end = adjOffsets[i + 1u];
  for (var k = start; k < end; k++) {
    if (adjNeighbors[k] == j) { return true; }
  }
  return false;
}

// ─── Pass 4: Resolve Collisions ─────────────────────────────────────────────

@compute @workgroup_size(256)
fn resolveCollisions(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }
  if (invMass[i] == 0.0) { return; }

  let invCS = 1.0 / scParams.thickness;
  let idx = i * 3u;
  let px = positions[idx];
  let py = positions[idx + 1u];
  let pz = positions[idx + 2u];

  let xi0 = intCoord(px, invCS) - 1;
  let yi0 = intCoord(py, invCS) - 1;
  let zi0 = intCoord(pz, invCS) - 1;

  let thickSq = scParams.thickness * scParams.thickness;
  let wi = invMass[i];

  // Accumulate correction (Jacobi-style: average all corrections)
  var corrX: f32 = 0.0;
  var corrY: f32 = 0.0;
  var corrZ: f32 = 0.0;
  var corrCount: u32 = 0u;

  for (var dxi: i32 = 0; dxi <= 2; dxi++) {
    for (var dyi: i32 = 0; dyi <= 2; dyi++) {
      for (var dzi: i32 = 0; dzi <= 2; dzi++) {
        let h = hashCoords(xi0 + dxi, yi0 + dyi, zi0 + dzi);
        let s = cellStart[h];
        let count = atomicLoad(&cellCount[h]);
        let e = s + count;

        for (var k = s; k < e; k++) {
          let j = cellEntries[k];
          if (j <= i) { continue; } // avoid duplicates: only j > i
          if (invMass[j] == 0.0) { continue; }
          if (isAdjacent(i, j)) { continue; }

          let jdx = j * 3u;
          let dx = px - positions[jdx];
          let dy = py - positions[jdx + 1u];
          let dz = pz - positions[jdx + 2u];
          let dist2 = dx * dx + dy * dy + dz * dz;

          if (dist2 >= thickSq || dist2 < 1e-12) { continue; }

          let dist = sqrt(dist2);
          let invDist = 1.0 / dist;
          let nx = dx * invDist;
          let ny = dy * invDist;
          let nz = dz * invDist;

          let wj = invMass[j];
          let wSum = wi + wj;
          let corr = (scParams.thickness - dist) / wSum;

          // Only apply this particle's share
          corrX += nx * corr * wi;
          corrY += ny * corr * wi;
          corrZ += nz * corr * wi;
          corrCount += 1u;

          // Also push j (Gauss-Seidel for j — slight asymmetry but fast)
          positions[jdx]      -= nx * corr * wj;
          positions[jdx + 1u] -= ny * corr * wj;
          positions[jdx + 2u] -= nz * corr * wj;
        }
      }
    }
  }

  if (corrCount > 0u) {
    positions[idx]      += corrX;
    positions[idx + 1u] += corrY;
    positions[idx + 2u] += corrZ;
  }
}

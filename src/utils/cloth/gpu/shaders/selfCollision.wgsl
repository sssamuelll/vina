// ─── Self-Collision via Spatial Hash (GPU) ──────────────────────────────────
//
// 5-pass approach (Müller "Ten Minute Physics" adapted for GPU):
//   1. hashCount:         each particle hashes to cell, atomicAdd to cellCount
//   2. prefixSum:         (external shader) parallel prefix sum to build cellStart
//   3. scatter:           each particle writes its index to sorted entries array
//   4. resolveCollisions: each particle queries 27 neighbor cells, atomicAdd corrections
//   5. applyCorrections:  drain atomic deltas, average, add to positions, reset
//
// Adjacency is pre-uploaded (flat list + offsets) to skip connected neighbors.
//
// Race-free: resolveCollisions uses atomicAdd on i32 delta buffers (scaled by 1e6)
// for BOTH particles in each pair. No direct position writes in resolve pass.
// ─────────────────────────────────────────────────────────────────────────────

struct SelfCollisionParams {
  numParticles: u32,
  tableSize: u32,       // prime, ~2×numParticles
  thickness: f32,       // cloth thickness (min separation)
  _pad0: u32,
};

// Fixed-point scale for atomic<i32> accumulation (WGSL has no atomic<f32>)
const COLLISION_SCALE: f32 = 1000000.0;

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

// Group 2: atomic correction buffers (reset each substep by applyCorrections)
@group(2) @binding(0) var<storage, read_write> scDelta: array<atomic<i32>>;     // 3 per particle (x,y,z)
@group(2) @binding(1) var<storage, read_write> scCorrCount: array<atomic<u32>>; // 1 per particle

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

// ─── Pass 4: Resolve Collisions (atomic accumulation) ───────────────────────
// For each pair (i, j) where j > i, compute the correction vector and
// atomicAdd both particles' shares into scDelta. No direct position writes.

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

          // Particle i: pushed in +n direction
          let ciX = i32(nx * corr * wi * COLLISION_SCALE);
          let ciY = i32(ny * corr * wi * COLLISION_SCALE);
          let ciZ = i32(nz * corr * wi * COLLISION_SCALE);

          atomicAdd(&scDelta[idx],      ciX);
          atomicAdd(&scDelta[idx + 1u], ciY);
          atomicAdd(&scDelta[idx + 2u], ciZ);
          atomicAdd(&scCorrCount[i], 1u);

          // Particle j: pushed in -n direction
          let cjX = i32(-nx * corr * wj * COLLISION_SCALE);
          let cjY = i32(-ny * corr * wj * COLLISION_SCALE);
          let cjZ = i32(-nz * corr * wj * COLLISION_SCALE);

          atomicAdd(&scDelta[jdx],      cjX);
          atomicAdd(&scDelta[jdx + 1u], cjY);
          atomicAdd(&scDelta[jdx + 2u], cjZ);
          atomicAdd(&scCorrCount[j], 1u);
        }
      }
    }
  }
}

// ─── Pass 5: Apply Corrections + Reset ──────────────────────────────────────
// Drain atomic deltas, average by correction count, add to positions.
// Always reset buffers (even if count == 0) so they're clean for next substep.

@compute @workgroup_size(256)
fn applyCorrections(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let idx = i * 3u;
  let count = atomicLoad(&scCorrCount[i]);

  if (count > 0u) {
    let invScale = 1.0 / (f32(count) * COLLISION_SCALE);
    let dx = f32(atomicLoad(&scDelta[idx]))      * invScale;
    let dy = f32(atomicLoad(&scDelta[idx + 1u])) * invScale;
    let dz = f32(atomicLoad(&scDelta[idx + 2u])) * invScale;

    positions[idx]      += dx;
    positions[idx + 1u] += dy;
    positions[idx + 2u] += dz;
  }

  // Reset for next substep
  atomicStore(&scDelta[idx],      0);
  atomicStore(&scDelta[idx + 1u], 0);
  atomicStore(&scDelta[idx + 2u], 0);
  atomicStore(&scCorrCount[i], 0u);
}

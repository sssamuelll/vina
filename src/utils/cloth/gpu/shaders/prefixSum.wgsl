// ─── Parallel Prefix Sum (Blelloch Work-Efficient Scan) ─────────────────────
//
// Replaces the serial single-thread prefix sum in selfCollision.wgsl.
// Three-pass hierarchical scan for up to 400k+ cells:
//
//   1. scanBlock:     Blelloch scan within each block of 512 elements
//   2. scanBlockSums: Serial scan of per-block totals (~800 blocks max)
//   3. propagate:     Add block offsets to produce global prefix sum
//
// Each thread in scanBlock handles 2 elements (workgroup_size=256, block=512).
// ─────────────────────────────────────────────────────────────────────────────

struct PrefixSumParams {
  numElements: u32,
  blockSize: u32,   // 512 (2 × workgroup_size)
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> psParams: PrefixSumParams;
@group(0) @binding(1) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(3) var<storage, read_write> blockSums: array<u32>;

// ─── Shared memory for workgroup-local scan ─────────────────────────────────

var<workgroup> temp: array<u32, 512>;

// ─── Pass 1: Blelloch scan within each block ────────────────────────────────
//
// Each workgroup processes 512 elements (256 threads × 2 elements each).
// Writes per-block total to blockSums, stores scanned results to cellStart,
// and zeroes cellCount for the scatter pass.

@compute @workgroup_size(256)
fn scanBlock(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let tid = lid.x;
  let blockId = wid.x;
  let blockOffset = blockId * psParams.blockSize;

  // ─── Load 2 elements per thread into shared memory ──────────────────────
  let ai = tid;
  let bi = tid + 256u;

  let globalA = blockOffset + ai;
  let globalB = blockOffset + bi;

  if (globalA < psParams.numElements) {
    temp[ai] = atomicLoad(&cellCount[globalA]);
  } else {
    temp[ai] = 0u;
  }
  if (globalB < psParams.numElements) {
    temp[bi] = atomicLoad(&cellCount[globalB]);
  } else {
    temp[bi] = 0u;
  }

  // ─── Up-sweep (reduce) phase ────────────────────────────────────────────
  var offset: u32 = 1u;
  for (var d: u32 = 256u; d > 0u; d >>= 1u) {
    workgroupBarrier();
    if (tid < d) {
      let idxA = offset * (2u * tid + 1u) - 1u;
      let idxB = offset * (2u * tid + 2u) - 1u;
      temp[idxB] += temp[idxA];
    }
    offset <<= 1u;
  }

  // ─── Store block total and clear last element for down-sweep ────────────
  if (tid == 0u) {
    blockSums[blockId] = temp[511u];
    temp[511u] = 0u;
  }

  // ─── Down-sweep (distribute) phase ──────────────────────────────────────
  for (var d: u32 = 1u; d < 512u; d <<= 1u) {
    offset >>= 1u;
    workgroupBarrier();
    if (tid < d) {
      let idxA = offset * (2u * tid + 1u) - 1u;
      let idxB = offset * (2u * tid + 2u) - 1u;
      let t = temp[idxA];
      temp[idxA] = temp[idxB];
      temp[idxB] += t;
    }
  }

  workgroupBarrier();

  // ─── Write results to cellStart and zero cellCount for scatter reuse ────
  if (globalA < psParams.numElements) {
    cellStart[globalA] = temp[ai];
    atomicStore(&cellCount[globalA], 0u);
  }
  if (globalB < psParams.numElements) {
    cellStart[globalB] = temp[bi];
    atomicStore(&cellCount[globalB], 0u);
  }
}

// ─── Pass 2: Serial scan of block sums ──────────────────────────────────────
//
// Only ~800 blocks for 400k cells — serial on a single thread is fine here.

@compute @workgroup_size(1)
fn scanBlockSums(@builtin(global_invocation_id) gid: vec3u) {
  let numBlocks = (psParams.numElements + psParams.blockSize - 1u) / psParams.blockSize;
  var running: u32 = 0u;
  for (var i: u32 = 0u; i < numBlocks; i++) {
    let val = blockSums[i];
    blockSums[i] = running;
    running += val;
  }
}

// ─── Pass 3: Propagate block offsets ────────────────────────────────────────
//
// Each thread adds its block's prefix to the per-element cellStart.
// Block 0 already has correct values (offset = 0), so skip it.

@compute @workgroup_size(256)
fn propagate(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let blockId = wid.x;
  if (blockId == 0u) { return; } // block 0 needs no offset

  let blockOffset = blockId * psParams.blockSize;
  let add = blockSums[blockId];

  let ai = blockOffset + lid.x;
  let bi = blockOffset + lid.x + 256u;

  if (ai < psParams.numElements) {
    cellStart[ai] += add;
  }
  if (bi < psParams.numElements) {
    cellStart[bi] += add;
  }
}

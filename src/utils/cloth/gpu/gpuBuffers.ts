/**
 * GPU Buffer Management for cloth simulation.
 *
 * Creates and manages GPU storage buffers for particle data,
 * constraints, and simulation parameters.
 *
 * @module gpuBuffers
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export enum EdgeType {
  WARP = 0,   // Vertical (along V axis in UV)
  WEFT = 1,   // Horizontal (along U axis in UV)
  SHEAR = 2,  // Diagonal (45°)
}

export interface ClothMeshData {
  /** Flat array of vertex positions [x,y,z, x,y,z, ...] */
  positions: Float32Array;
  /** Triangle indices [i0,i1,i2, ...] */
  triangles: Uint32Array;
  /** Inverse mass per vertex (0 = pinned) */
  invMass: Float32Array;
}

export interface StretchConstraints {
  /** Pairs of particle indices [a,b, a,b, ...] */
  ids: Uint32Array;
  /** Rest lengths per constraint */
  restLengths: Float32Array;
  /** EdgeType per constraint (WARP, WEFT, or SHEAR) */
  edgeTypes: Uint8Array;
}

export interface BendConstraints {
  /** Quads of particle indices [a,b,c,d, ...] — shared edge a-b, opposite vertices c,d */
  ids: Uint32Array;
  /** Rest dihedral angles */
  restAngles: Float32Array;
  /** EdgeType per constraint (WARP or WEFT) */
  edgeTypes: Uint8Array;
}

export interface SeamConstraintData {
  /** Pairs of particle indices to sew together [a,b, a,b, ...] */
  ids: Uint32Array;
  /** Target distance per constraint (0 = pull together) */
  targetDist: Float32Array;
}

export interface SimParams {
  numParticles: number;
  numStretchConstraints: number;
  numBendConstraints: number;
  numSeamConstraints: number;
  dt: number;
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  stretchCompliance: number;
  bendCompliance: number;
  seamStiffness: number;
  groundY: number;
  collisionMargin: number;
  clothThickness: number;
  selfCollision: boolean;
}

// ─── Buffer Collection ──────────────────────────────────────────────────────

export interface GpuClothBuffers {
  positions: GPUBuffer;
  prevPositions: GPUBuffer;
  velocities: GPUBuffer;
  invMass: GPUBuffer;
  stretchIds: GPUBuffer;
  stretchRestLengths: GPUBuffer;
  bendIds: GPUBuffer;
  bendRestAngles: GPUBuffer;
  seamIds: GPUBuffer | null;
  seamTargetDist: GPUBuffer | null;
  normals: GPUBuffer;
  params: GPUBuffer;
  /** Readback buffer for positions (MAP_READ) */
  readback: GPUBuffer;
  numParticles: number;
  numStretchConstraints: number;
  numBendConstraints: number;
  numSeamConstraints: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createStorageBuffer(
  device: GPUDevice,
  data: Float32Array | Uint32Array,
  label: string,
  usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: data.byteLength,
    usage,
    mappedAtCreation: true,
  });
  if (data instanceof Float32Array) {
    new Float32Array(buffer.getMappedRange()).set(data);
  } else {
    new Uint32Array(buffer.getMappedRange()).set(data);
  }
  buffer.unmap();
  return buffer;
}

function createZeroBuffer(
  device: GPUDevice,
  size: number,
  label: string,
  usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
): GPUBuffer {
  return device.createBuffer({ label, size, usage });
}

// ─── Constraint Extraction ──────────────────────────────────────────────────

/**
 * Classify edge direction based on UV coordinates.
 * @param uvA - UV coords of first vertex [u, v]
 * @param uvB - UV coords of second vertex [u, v]
 * @returns EdgeType (WARP, WEFT, or SHEAR)
 */
export function classifyEdgeType(uvA: [number, number], uvB: [number, number]): EdgeType {
  const du = uvB[0] - uvA[0];
  const dv = uvB[1] - uvA[1];
  const angle = Math.atan2(Math.abs(dv), Math.abs(du)) * (180 / Math.PI);

  // Weft: mostly horizontal (angle < 22.5° or > 157.5°)
  if (angle < 22.5 || angle > 157.5) return EdgeType.WEFT;
  // Warp: mostly vertical (67.5° < angle < 112.5°)
  if (angle > 67.5 && angle < 112.5) return EdgeType.WARP;
  // Shear: diagonal
  return EdgeType.SHEAR;
}

/**
 * Extract stretch (distance) constraints from triangle mesh.
 * Each unique edge becomes a constraint.
 *
 * GPU/WASM-side topology extractor. Returns `Uint32Array` ids (compatible with
 * both WebGPU storage buffers + Rust WASM `set_stretch_with_types` API). The
 * CPU equivalent lives inline in `xpbdSolver.ts` constructor (lines ~421-456)
 * with `Int32Array` ids and a sorted-edge dedup. See A4 Fase 2 § 3.2 for the
 * cleavage ratification.
 */
export function extractStretchConstraints(
  positions: Float32Array,
  triangles: Uint32Array,
  uvs?: Float32Array,  // optional UV coords [u,v, u,v, ...]
): StretchConstraints {
  const edgeSet = new Set<string>();
  const ids: number[] = [];
  const restLengths: number[] = [];
  const edgeTypes: number[] = [];

  for (let t = 0; t < triangles.length; t += 3) {
    const triVerts = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = triVerts[e];
      const b = triVerts[(e + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const dx = positions[b * 3] - positions[a * 3];
      const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
      const dz = positions[b * 3 + 2] - positions[a * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      ids.push(a, b);
      restLengths.push(len);

      // Classify edge type based on UV direction
      if (uvs && uvs.length >= (Math.max(a, b) + 1) * 2) {
        const uvA: [number, number] = [uvs[a * 2], uvs[a * 2 + 1]];
        const uvB: [number, number] = [uvs[b * 2], uvs[b * 2 + 1]];
        edgeTypes.push(classifyEdgeType(uvA, uvB));
      } else {
        edgeTypes.push(EdgeType.SHEAR); // Default when no UVs
      }
    }
  }

  return {
    ids: new Uint32Array(ids),
    restLengths: new Float32Array(restLengths),
    edgeTypes: new Uint8Array(edgeTypes),
  };
}

/**
 * Extract bending constraints from triangle mesh.
 * For each internal edge (shared by 2 triangles), create a bend constraint
 * between the 4 vertices of the two triangles.
 *
 * Returns rest **dihedral angles** (radians). The TSL/WebGPU bend solver
 * consumes angles directly; the WASM and CPU solvers consume **distances**
 * instead — WASM converts via `bendRestDistances.ts:computeBendRestDistances`
 * at the worker boundary (BUG-1 fix, PR #604), CPU computes distances inline
 * (xpbdSolver.ts:564-568). The angle/distance seam is ratified in A4 Fase 2
 * § 2.5; the dual-extractor cleavage in § 3.2.
 */
export function extractBendConstraints(
  positions: Float32Array,
  triangles: Uint32Array,
  uvs?: Float32Array,
): BendConstraints {
  // Build edge → triangle adjacency
  const edgeToTri = new Map<string, number[]>();

  for (let t = 0; t < triangles.length; t += 3) {
    const triIdx = t / 3;
    const verts = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = verts[e];
      const b = verts[(e + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const list = edgeToTri.get(key) || [];
      list.push(triIdx);
      edgeToTri.set(key, list);
    }
  }

  const ids: number[] = [];
  const restAngles: number[] = [];
  const edgeTypes: number[] = [];

  for (const [key, tris] of edgeToTri) {
    if (tris.length !== 2) continue;

    const [aStr, bStr] = key.split('-');
    const a = parseInt(aStr);
    const b = parseInt(bStr);

    // Find opposite vertices
    const tri0Verts = [triangles[tris[0] * 3], triangles[tris[0] * 3 + 1], triangles[tris[0] * 3 + 2]];
    const tri1Verts = [triangles[tris[1] * 3], triangles[tris[1] * 3 + 1], triangles[tris[1] * 3 + 2]];

    const c = tri0Verts.find(v => v !== a && v !== b)!;
    const d = tri1Verts.find(v => v !== a && v !== b)!;

    // Compute rest dihedral angle
    const angle = computeDihedralAngle(positions, a, b, c, d);
    ids.push(a, b, c, d);
    restAngles.push(angle);

    // Classify the shared edge (a-b) by UV direction
    let edgeType = EdgeType.SHEAR;
    if (uvs && uvs.length >= (Math.max(a, b) + 1) * 2) {
      const uvA: [number, number] = [uvs[a * 2], uvs[a * 2 + 1]];
      const uvB: [number, number] = [uvs[b * 2], uvs[b * 2 + 1]];
      edgeType = classifyEdgeType(uvA, uvB);
    }
    // For bending, SHEAR edges default to WEFT (or could use average)
    if (edgeType === EdgeType.SHEAR) {
      edgeType = EdgeType.WEFT;
    }
    edgeTypes.push(edgeType);
  }

  return {
    ids: new Uint32Array(ids),
    restAngles: new Float32Array(restAngles),
    edgeTypes: new Uint8Array(edgeTypes),
  };
}

function computeDihedralAngle(
  pos: Float32Array,
  a: number, b: number, c: number, d: number,
): number {
  // Edge vector
  const ex = pos[b * 3] - pos[a * 3];
  const ey = pos[b * 3 + 1] - pos[a * 3 + 1];
  const ez = pos[b * 3 + 2] - pos[a * 3 + 2];

  // Vectors to opposite vertices
  const acx = pos[c * 3] - pos[a * 3];
  const acy = pos[c * 3 + 1] - pos[a * 3 + 1];
  const acz = pos[c * 3 + 2] - pos[a * 3 + 2];

  const adx = pos[d * 3] - pos[a * 3];
  const ady = pos[d * 3 + 1] - pos[a * 3 + 1];
  const adz = pos[d * 3 + 2] - pos[a * 3 + 2];

  // Face normals
  const n0x = ey * acz - ez * acy;
  const n0y = ez * acx - ex * acz;
  const n0z = ex * acy - ey * acx;

  const n1x = ey * adz - ez * ady;
  const n1y = ez * adx - ex * adz;
  const n1z = ex * ady - ey * adx;

  const len0 = Math.sqrt(n0x * n0x + n0y * n0y + n0z * n0z);
  const len1 = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);

  if (len0 < 1e-10 || len1 < 1e-10) return Math.PI;

  const dot = (n0x * n1x + n0y * n1y + n0z * n1z) / (len0 * len1);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// ─── Buffer Creation ────────────────────────────────────────────────────────

/**
 * Create all GPU buffers for cloth simulation.
 */
export function createClothBuffers(
  device: GPUDevice,
  mesh: ClothMeshData,
  stretch: StretchConstraints,
  bend: BendConstraints,
  seam: SeamConstraintData | null,
  params: SimParams,
): GpuClothBuffers {
  const n = mesh.positions.length; // total floats (numParticles × 3)

  // Position buffer: STORAGE (compute) + VERTEX (render) + COPY_SRC (readback)
  const positions = createStorageBuffer(
    device, mesh.positions, 'positions',
    GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  );

  const prevPositions = createStorageBuffer(
    device, new Float32Array(mesh.positions), 'prevPositions',
  );

  const velocities = createZeroBuffer(device, n * 4, 'velocities');
  const invMass = createStorageBuffer(device, mesh.invMass, 'invMass');
  const normals = createZeroBuffer(
    device, n * 4, 'normals',
    GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  );

  // Constraints
  const stretchIds = createStorageBuffer(device, stretch.ids, 'stretchIds');
  const stretchRestLengths = createStorageBuffer(device, stretch.restLengths, 'stretchRestLengths');
  const bendIds = createStorageBuffer(device, bend.ids, 'bendIds');
  const bendRestAngles = createStorageBuffer(device, bend.restAngles, 'bendRestAngles');

  // Seam constraints (optional)
  let seamIds: GPUBuffer | null = null;
  let seamTargetDist: GPUBuffer | null = null;
  if (seam && seam.ids.length > 0) {
    seamIds = createStorageBuffer(device, seam.ids, 'seamIds');
    seamTargetDist = createStorageBuffer(device, seam.targetDist, 'seamTargetDist');
  }

  // Uniform params buffer (uses DataView for proper u32/f32 packing)
  const paramsData = packSimParams(params);
  const paramsBuffer = device.createBuffer({
    label: 'simParams',
    size: paramsData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint8Array(paramsBuffer.getMappedRange()).set(new Uint8Array(paramsData));
  paramsBuffer.unmap();

  // Readback buffer
  const readback = device.createBuffer({
    label: 'readback',
    size: n * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  return {
    positions,
    prevPositions,
    velocities,
    invMass,
    stretchIds,
    stretchRestLengths,
    bendIds,
    bendRestAngles,
    seamIds,
    seamTargetDist,
    normals,
    params: paramsBuffer,
    readback,
    numParticles: mesh.positions.length / 3,
    numStretchConstraints: stretch.ids.length / 2,
    numBendConstraints: bend.ids.length / 4,
    numSeamConstraints: seam ? seam.ids.length / 2 : 0,
  };
}

/**
 * Pack SimParams into an ArrayBuffer for the uniform buffer.
 * Uses DataView to write u32 and f32 fields with correct bit representation.
 *
 * Previously used Float32Array for ALL fields, which caused the first 4 u32
 * fields (numParticles, etc.) to be bit-reinterpreted: JS number 1000 stored
 * as f32 bits 0x44740000, read by WGSL as u32 → 1,156,653,056 (garbage).
 */
function packSimParams(p: SimParams): ArrayBuffer {
  const buf = new ArrayBuffer(64); // 16 fields × 4 bytes
  const view = new DataView(buf);

  // u32 fields (offsets 0-12)
  view.setUint32(0,  p.numParticles, true);
  view.setUint32(4,  p.numStretchConstraints, true);
  view.setUint32(8,  p.numBendConstraints, true);
  view.setUint32(12, p.numSeamConstraints, true);

  // f32 fields (offsets 16-60)
  view.setFloat32(16, p.dt / p.substeps, true);  // sdt
  view.setFloat32(20, p.substeps, true);
  view.setFloat32(24, p.gravity[0], true);
  view.setFloat32(28, p.gravity[1], true);
  view.setFloat32(32, p.gravity[2], true);
  view.setFloat32(36, p.damping, true);
  view.setFloat32(40, p.stretchCompliance, true);
  view.setFloat32(44, p.bendCompliance, true);
  view.setFloat32(48, p.seamStiffness, true);
  view.setFloat32(52, p.groundY, true);
  view.setFloat32(56, p.collisionMargin, true);
  view.setFloat32(60, p.clothThickness, true);

  return buf;
}

/**
 * Graph-color constraints so that no two constraints sharing a vertex
 * get the same color. Returns constraints reordered by color group.
 *
 * This enables race-free parallel constraint solving: each color group
 * can be dispatched as a separate compute pass, with all constraints in
 * the group guaranteed to operate on independent vertices.
 *
 * Greedy assignment runs in smallest-degree-last (degeneracy) order, not
 * input order (#897 F4.3d). Each color group costs one compute dispatch per
 * substep, so the color count multiplies per-frame CPU dispatch overhead;
 * input-order greedy is order-sensitive and wasted colors on the irregular
 * CDT edge order of production meshes. Measured (2026-06-13): shuffled 20×20
 * warp/weft/shear grid fixture 11 → 8 colors (= maxConstraintsPerVertex,
 * the edge-coloring floor); María's mesh 57 → 10 stretch colors
 * (855 → 150 stretch dispatches/frame at 15 substeps). Honest caveat: the
 * frame median did NOT move (31-32fps before and after, n=2 each) — post
 * F4.3b/c the frame is not CPU-dispatch-bound, so the win is dispatch
 * headroom and order-robustness, not measured fps.
 * Any proper coloring is physics-equivalent — only group membership and
 * intra-pass ordering change, both invisible to consumers.
 */
export interface ColoredConstraints {
  /** Constraint IDs reordered by color [color0..., color1..., ...] */
  ids: Uint32Array;
  /** Rest lengths reordered to match */
  restLengths: Float32Array;
  /** Per-constraint compliance values reordered to match (optional) */
  compliance?: Float32Array;
  /** (offset, count) per color group */
  colorRanges: Array<{ offset: number; count: number }>;
}

export function colorConstraints(
  ids: Uint32Array,
  restLengths: Float32Array,
  numConstraints: number,
  compliance?: Float32Array,
): ColoredConstraints {
  if (numConstraints === 0) {
    return { ids: new Uint32Array(0), restLengths: new Float32Array(0), colorRanges: [] };
  }

  // Build vertex → constraint adjacency
  const vertexConstraints = new Map<number, number[]>();
  for (let i = 0; i < numConstraints; i++) {
    const v0 = ids[i * 2];
    const v1 = ids[i * 2 + 1];
    if (!vertexConstraints.has(v0)) vertexConstraints.set(v0, []);
    if (!vertexConstraints.has(v1)) vertexConstraints.set(v1, []);
    vertexConstraints.get(v0)!.push(i);
    vertexConstraints.get(v1)!.push(i);
  }

  // ── Smallest-degree-last (degeneracy) ordering ──────────────────────────
  // Approximate conflict degree per constraint: occurrences of OTHER
  // constraints in its two endpoint lists. Self appears once in each list
  // (hence -2); a neighbor sharing both endpoints counts twice — consistent
  // with the per-occurrence decrement below, so degrees never go negative.
  const degrees = new Int32Array(numConstraints);
  for (let i = 0; i < numConstraints; i++) {
    degrees[i] =
      vertexConstraints.get(ids[i * 2])!.length +
      vertexConstraints.get(ids[i * 2 + 1])!.length - 2;
  }

  // Bucket queue with lazy deletion: repeatedly remove the min-degree
  // constraint, decrementing surviving neighbors. Coloring in REVERSE
  // removal order keeps greedy within (degeneracy + 1) colors — at the
  // edge-coloring floor on planar-ish cloth meshes, independent of input
  // order. O(total adjacency) pushes.
  const buckets: number[][] = [];
  for (let i = 0; i < numConstraints; i++) {
    (buckets[degrees[i]] ??= []).push(i);
  }
  const removed = new Uint8Array(numConstraints);
  const removalOrder = new Int32Array(numConstraints);
  let nRemoved = 0;
  let cursor = 0;
  while (nRemoved < numConstraints) {
    while (buckets[cursor] === undefined || buckets[cursor].length === 0) cursor++;
    const i = buckets[cursor].pop()!;
    if (removed[i] === 1 || degrees[i] !== cursor) continue; // stale lazy entry
    removed[i] = 1;
    removalOrder[nRemoved++] = i;
    for (const endpoint of [ids[i * 2], ids[i * 2 + 1]]) {
      for (const j of vertexConstraints.get(endpoint)!) {
        if (j === i || removed[j] === 1) continue;
        degrees[j]--;
        (buckets[degrees[j]] ??= []).push(j);
        if (degrees[j] < cursor) cursor = degrees[j];
      }
    }
  }

  // Greedy graph coloring in smallest-degree-last order
  const constraintColors = new Int32Array(numConstraints).fill(-1);
  let numColors = 0;

  for (let k = numConstraints - 1; k >= 0; k--) {
    const i = removalOrder[k];
    const usedColors = new Set<number>();
    const v0 = ids[i * 2];
    const v1 = ids[i * 2 + 1];
    for (const neighbor of vertexConstraints.get(v0)!) {
      if (constraintColors[neighbor] >= 0) usedColors.add(constraintColors[neighbor]);
    }
    for (const neighbor of vertexConstraints.get(v1)!) {
      if (constraintColors[neighbor] >= 0) usedColors.add(constraintColors[neighbor]);
    }

    let color = 0;
    while (usedColors.has(color)) color++;
    constraintColors[i] = color;
    if (color + 1 > numColors) numColors = color + 1;
  }

  // Group by color and reorder
  const colorGroups: number[][] = Array.from({ length: numColors }, () => []);
  for (let i = 0; i < numConstraints; i++) {
    colorGroups[constraintColors[i]].push(i);
  }

  const reorderedIds = new Uint32Array(numConstraints * 2);
  const reorderedRest = new Float32Array(numConstraints);
  const reorderedCompliance = compliance ? new Float32Array(numConstraints) : undefined;
  const colorRanges: Array<{ offset: number; count: number }> = [];
  let offset = 0;

  for (const group of colorGroups) {
    colorRanges.push({ offset, count: group.length });
    for (let j = 0; j < group.length; j++) {
      const srcIdx = group[j];
      reorderedIds[(offset + j) * 2] = ids[srcIdx * 2];
      reorderedIds[(offset + j) * 2 + 1] = ids[srcIdx * 2 + 1];
      reorderedRest[offset + j] = restLengths[srcIdx];
      if (compliance && reorderedCompliance) {
        reorderedCompliance[offset + j] = compliance[srcIdx];
      }
    }
    offset += group.length;
  }

  return { ids: reorderedIds, restLengths: reorderedRest, compliance: reorderedCompliance, colorRanges };
}

/**
 * Update simulation params on GPU.
 */
export function updateSimParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  params: SimParams,
): void {
  const data = packSimParams(params);
  device.queue.writeBuffer(buffer, 0, new Uint8Array(data));
}

/**
 * Read back positions from GPU to CPU (async).
 */
export async function readbackPositions(
  device: GPUDevice,
  buffers: GpuClothBuffers,
): Promise<Float32Array> {
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(
    buffers.positions, 0,
    buffers.readback, 0,
    buffers.numParticles * 3 * 4,
  );
  device.queue.submit([encoder.finish()]);

  await buffers.readback.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(buffers.readback.getMappedRange().slice(0));
  buffers.readback.unmap();
  return data;
}

/**
 * Destroy all GPU buffers.
 */
export function destroyClothBuffers(buffers: GpuClothBuffers): void {
  buffers.positions.destroy();
  buffers.prevPositions.destroy();
  buffers.velocities.destroy();
  buffers.invMass.destroy();
  buffers.stretchIds.destroy();
  buffers.stretchRestLengths.destroy();
  buffers.bendIds.destroy();
  buffers.bendRestAngles.destroy();
  buffers.seamIds?.destroy();
  buffers.seamTargetDist?.destroy();
  buffers.normals.destroy();
  buffers.params.destroy();
  buffers.readback.destroy();
}

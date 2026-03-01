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

  // Uniform params buffer
  const paramsData = packSimParams(params);
  const paramsBuffer = createStorageBuffer(
    device, paramsData, 'simParams',
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  );

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
 * Pack SimParams into a Float32Array for the uniform buffer.
 * Layout must match the WGSL struct exactly.
 */
function packSimParams(p: SimParams): Float32Array {
  return new Float32Array([
    p.numParticles,
    p.numStretchConstraints,
    p.numBendConstraints,
    p.numSeamConstraints,
    p.dt / p.substeps,           // sdt (substep dt)
    p.substeps,
    p.gravity[0], p.gravity[1], p.gravity[2],
    p.damping,
    p.stretchCompliance,
    p.bendCompliance,
    p.seamStiffness,
    p.groundY,
    p.collisionMargin,
    p.clothThickness,
  ]);
}

/**
 * Update simulation params on GPU.
 */
export function updateSimParams(
  device: GPUDevice,
  buffer: GPUBuffer,
  params: SimParams,
): void {
  device.queue.writeBuffer(buffer, 0, packSimParams(params));
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

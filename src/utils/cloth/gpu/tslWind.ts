/**
 * TSL Wind Compute — atomic i32 accumulation for race-free wind force on GPU.
 *
 * Two-pass wind algorithm (matching CPU solver xpbdSolver.ts:806-860):
 *   1. accumNode  (per-triangle): compute face normal via cross product, project
 *      wind onto normal (dot = wind . normal), compute forcePerVert = dot * area
 *      * dragCoeff / 3, scale to int32 (x 1e6), atomicAdd to accumulation buffer
 *      for all 3 vertices.
 *   2. applyNode  (per-particle): read accumulated int32, convert to float (/ 1e6),
 *      multiply by invMass * sdt (matching CPU solver), add to velocity,
 *      reset accum to zero via atomicStore.
 *
 * Race-free: accumNode uses atomicAdd on i32 delta buffers (scaled by 1e6)
 * for all 3 vertices in each triangle. No direct velocity writes in accum pass.
 *
 * @module tslWind
 */

import { StorageBufferAttribute } from 'three/webgpu';
import {
  Fn,
  storage,
  uniform,
  compute,
  instanceIndex,
  uint,
  int,
  float,
  If,
  atomicAdd,
  atomicStore,
} from 'three/tsl';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WindBufferSet {
  /** Int32Array accumulation buffer, N*3 elements (x/y/z per particle) */
  windAccumSBA: StorageBufferAttribute;
  /** Number of particles */
  numParticles: number;
}

export interface WindComputeNodes {
  /** Per-triangle wind accumulation compute node */
  accumNode: TslNode;
  /** Per-particle wind apply compute node */
  applyNode: TslNode;
  /** Wind X uniform — update .value at runtime */
  windX: { value: number };
  /** Wind Y uniform — update .value at runtime */
  windY: { value: number };
  /** Wind Z uniform — update .value at runtime */
  windZ: { value: number };
  /** Drag coefficient uniform — update .value at runtime */
  dragCoeff: { value: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Fixed-point scale for atomic<i32> accumulation (WGSL has no atomic<f32>).
 * Precision: 1e-6. Safe for typical garment triangle counts.
 */
export const WIND_SCALE = 1000000.0;

// ─── Buffer Factory ─────────────────────────────────────────────────────────

/**
 * Create the StorageBufferAttribute for wind force accumulation.
 */
export function createWindBuffers(numParticles: number): WindBufferSet {
  return {
    windAccumSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    numParticles,
  };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the 2 TSL Fn() compute nodes for the wind force pipeline.
 *
 * @param posBufNode      - Cloth particle positions (vec3 storage, shared with solver)
 * @param velBufNode      - Cloth particle velocities (vec3 storage, shared with solver)
 * @param invMassBufNode  - Inverse mass per particle (float storage, shared with solver)
 * @param sdtUniform      - Substep delta time uniform (shared with solver)
 * @param triIdsBufNode   - Triangle index buffer (uint storage, 3 indices per triangle)
 * @param windBuffers     - Wind buffer set from createWindBuffers()
 * @param numTriangles    - Number of triangles in the mesh
 * @param windForce       - Initial wind direction/magnitude [x, y, z]
 * @param dragCoefficient - Initial drag coefficient
 */
export function makeWindComputeNode(
  posBufNode: TslNode,
  velBufNode: TslNode,
  invMassBufNode: TslNode,
  sdtUniform: TslNode,
  triIdsBufNode: TslNode,
  windBuffers: WindBufferSet,
  numTriangles: number,
  windForce: [number, number, number],
  dragCoefficient: number,
): WindComputeNodes {
  const N = windBuffers.numParticles;

  // ─── Wrap SBA as TSL storage node ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windAccumBuf = storage(windBuffers.windAccumSBA, 'int' as any, N * 3);

  // ─── Uniforms (exposed for runtime updates) ─────────────────────
  const uWindX = uniform(windForce[0]);
  const uWindY = uniform(windForce[1]);
  const uWindZ = uniform(windForce[2]);
  const uDragCoeff = uniform(dragCoefficient);

  // ─── Pass 1: accumulate wind force per triangle ─────────────────
  // Dispatch: numTriangles. Each triangle computes the wind force projected
  // onto its face normal, then atomicAdds the force to all 3 vertices.
  // Matches CPU solver xpbdSolver.ts:806-860.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accumFn = (Fn as any)(() => {
    const tri = instanceIndex;
    const triBase = uint(tri).mul(uint(3));

    // Vertex indices for this triangle
    const i0 = triIdsBufNode.element(triBase);
    const i1 = triIdsBufNode.element(triBase.add(uint(1)));
    const i2 = triIdsBufNode.element(triBase.add(uint(2)));

    // Vertex positions
    const p0 = posBufNode.element(i0);
    const p1 = posBufNode.element(i1);
    const p2 = posBufNode.element(i2);

    // Edge vectors
    const e1x = p1.x.sub(p0.x);
    const e1y = p1.y.sub(p0.y);
    const e1z = p1.z.sub(p0.z);

    const e2x = p2.x.sub(p0.x);
    const e2y = p2.y.sub(p0.y);
    const e2z = p2.z.sub(p0.z);

    // Cross product = face normal (unnormalized, magnitude = 2 * area)
    const nx = e1y.mul(e2z).sub(e1z.mul(e2y));
    const ny = e1z.mul(e2x).sub(e1x.mul(e2z));
    const nz = e1x.mul(e2y).sub(e1y.mul(e2x));

    // Normal length and area
    const normalLen = nx.mul(nx).add(ny.mul(ny)).add(nz.mul(nz)).sqrt();

    If(normalLen.greaterThan(float(1e-8)), () => {
      const area = normalLen.mul(float(0.5));

      // Normalize
      const invLen = float(1.0).div(normalLen);
      const nnx = nx.mul(invLen);
      const nny = ny.mul(invLen);
      const nnz = nz.mul(invLen);

      // Wind force projected onto face normal: dot = wind . normal
      const dot = uWindX.mul(nnx).add(uWindY.mul(nny)).add(uWindZ.mul(nnz));

      // forcePerVertex = dot * area * dragCoeff / 3
      const forcePerVert = dot.mul(area).mul(uDragCoeff).div(float(3.0));

      // Scale force direction (normal) by forcePerVert and convert to int32
      const scale = float(WIND_SCALE);
      const fx = int(nnx.mul(forcePerVert).mul(scale));
      const fy = int(nny.mul(forcePerVert).mul(scale));
      const fz = int(nnz.mul(forcePerVert).mul(scale));

      // Accumulate on vertex 0
      const b0 = i0.mul(uint(3));
      atomicAdd(windAccumBuf.element(b0), fx);
      atomicAdd(windAccumBuf.element(b0.add(uint(1))), fy);
      atomicAdd(windAccumBuf.element(b0.add(uint(2))), fz);

      // Accumulate on vertex 1
      const b1 = i1.mul(uint(3));
      atomicAdd(windAccumBuf.element(b1), fx);
      atomicAdd(windAccumBuf.element(b1.add(uint(1))), fy);
      atomicAdd(windAccumBuf.element(b1.add(uint(2))), fz);

      // Accumulate on vertex 2
      const b2 = i2.mul(uint(3));
      atomicAdd(windAccumBuf.element(b2), fx);
      atomicAdd(windAccumBuf.element(b2.add(uint(1))), fy);
      atomicAdd(windAccumBuf.element(b2.add(uint(2))), fz);
    });
  })();

  const accumNode = compute(accumFn, numTriangles, [64]);

  // ─── Pass 2: apply accumulated wind force per particle ──────────
  // Dispatch: numParticles. Reads accumulated int32 force, converts to float,
  // adds to velocity, then resets accum buffer to zero.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFn = (Fn as any)(() => {
    const i = instanceIndex;
    const base = uint(i).mul(uint(3));

    // Read accumulated force (separate pass — no concurrent writes, safe without atomicLoad)
    const fx = float(windAccumBuf.element(base));
    const fy = float(windAccumBuf.element(base.add(uint(1))));
    const fz = float(windAccumBuf.element(base.add(uint(2))));

    const invScale = float(1.0 / WIND_SCALE);

    // Scale by invMass * sdt to match CPU solver (xpbdSolver.ts:851-857):
    //   vel += normal * forcePerVertex * invMass * sdt
    // Pinned particles (invMass=0) receive zero wind force.
    const scale = invMassBufNode.element(i).mul(sdtUniform).mul(invScale);

    // Add wind force to velocity
    velBufNode.element(i).x.addAssign(fx.mul(scale));
    velBufNode.element(i).y.addAssign(fy.mul(scale));
    velBufNode.element(i).z.addAssign(fz.mul(scale));

    // Reset accumulation buffer for next frame
    const zeroI32 = int(0).toVar();
    atomicStore(windAccumBuf.element(base), zeroI32);
    atomicStore(windAccumBuf.element(base.add(uint(1))), zeroI32);
    atomicStore(windAccumBuf.element(base.add(uint(2))), zeroI32);
  })();

  const applyNode = compute(applyFn, N, [64]);

  return {
    accumNode,
    applyNode,
    windX: uWindX,
    windY: uWindY,
    windZ: uWindZ,
    dragCoeff: uDragCoeff,
  };
}

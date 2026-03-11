/**
 * TSL Compute Solver — ports WGSL shaders to Three.js TSL Fn() functions.
 *
 * Each solver step reads/writes StorageBufferAttribute instances from the
 * TslBufferSet. The vertex shader can reference the same SBAs via
 * material.positionNode, achieving zero-copy rendering.
 *
 * Solver steps:
 *   1. preSolve   — save prevPos, integrate gravity + damping (per-particle)
 *   2. stretch    — graph-colored distance constraints (per-color dispatch)
 *   3. bend       — single Jacobi distance constraint on opposite verts (per-constraint)
 *   4. seam       — distance constraint pulling seam pairs together (per-constraint)
 *   5. postSolve  — velocity update, NaN guard, speed clamp (per-particle)
 *
 * @module tslSolver
 */

import {
  storage,
  Fn,
  If,
  compute,
  uniform,
  float,
  uint,
  instanceIndex,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import type StorageBufferNode from 'three/src/nodes/accessors/StorageBufferNode.js';
import type UniformNode from 'three/src/nodes/core/UniformNode.js';
import type { TslBufferSet } from './tslBuffers';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface TslSolverConfig {
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  stretchCompliance: number;
  bendCompliance: number;
  seamStiffness: number;
  groundY: number;
  dt: number;
}

// ─── Solver interface ────────────────────────────────────────────────────────

export interface TslSolver {
  /** Pre-solve compute node (gravity + Verlet integration) */
  preSolve: ComputeNode;
  /** Per-color stretch constraint compute nodes */
  stretchColors: ComputeNode[];
  /** Bend constraint compute node (null if no bend constraints) */
  bend: ComputeNode | null;
  /** Seam constraint compute node (null if no seam constraints) */
  seam: ComputeNode | null;
  /** Post-solve compute node (velocity update + clamping) */
  postSolve: ComputeNode;
  /** Position SBA — shared with vertex shader for zero-copy rendering */
  positionSBA: StorageBufferAttribute;
  /** Number of particles */
  numParticles: number;
  /** Number of triangles */
  numTriangles: number;
  /** Triangle index buffer (for CPU normal computation) */
  triangles: Uint32Array;
  /** Update solver uniforms at runtime */
  updateConfig: (config: Partial<TslSolverConfig>) => void;
}

// ─── Uniform nodes ───────────────────────────────────────────────────────────

type FloatUniform = UniformNode<'float', number>;

interface SolverUniforms {
  sdt: FloatUniform;
  gravX: FloatUniform;
  gravY: FloatUniform;
  gravZ: FloatUniform;
  damping: FloatUniform;
  stretchCompliance: FloatUniform;
  bendCompliance: FloatUniform;
  seamStiffness: FloatUniform;
  groundY: FloatUniform;
}

function createUniforms(config: TslSolverConfig): SolverUniforms {
  const sdt = config.dt / config.substeps;
  return {
    sdt: uniform(sdt),
    gravX: uniform(config.gravity[0]),
    gravY: uniform(config.gravity[1]),
    gravZ: uniform(config.gravity[2]),
    damping: uniform(config.damping),
    stretchCompliance: uniform(config.stretchCompliance),
    bendCompliance: uniform(config.bendCompliance),
    seamStiffness: uniform(config.seamStiffness),
    groundY: uniform(config.groundY),
  };
}

// ─── Pre-solve kernel ────────────────────────────────────────────────────────

function makePreSolveFn(
  posBuf: StorageBufferNode<'float'>,
  prevPosBuf: StorageBufferNode<'float'>,
  velBuf: StorageBufferNode<'float'>,
  invMassBuf: StorageBufferNode<'float'>,
  uniforms: SolverUniforms,
) {
  return Fn(() => {
    const i = instanceIndex;

    // Read invMass — if zero, particle is pinned
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      // Flat indices for xyz components
      const ix = uint(i).mul(uint(3));
      const iy = ix.add(uint(1));
      const iz = ix.add(uint(2));

      // Save prevPos = pos
      const px = posBuf.element(ix);
      const py = posBuf.element(iy);
      const pz = posBuf.element(iz);
      prevPosBuf.element(ix).assign(px);
      prevPosBuf.element(iy).assign(py);
      prevPosBuf.element(iz).assign(pz);

      // vel += gravity * sdt
      velBuf.element(ix).addAssign(uniforms.gravX.mul(uniforms.sdt));
      velBuf.element(iy).addAssign(uniforms.gravY.mul(uniforms.sdt));
      velBuf.element(iz).addAssign(uniforms.gravZ.mul(uniforms.sdt));

      // vel *= damping
      velBuf.element(ix).assign(velBuf.element(ix).mul(uniforms.damping));
      velBuf.element(iy).assign(velBuf.element(iy).mul(uniforms.damping));
      velBuf.element(iz).assign(velBuf.element(iz).mul(uniforms.damping));

      // pos += vel * sdt
      posBuf.element(ix).addAssign(velBuf.element(ix).mul(uniforms.sdt));
      posBuf.element(iy).addAssign(velBuf.element(iy).mul(uniforms.sdt));
      posBuf.element(iz).addAssign(velBuf.element(iz).mul(uniforms.sdt));

      // Ground collision: if pos.y < groundY → snap
      If(posBuf.element(iy).lessThan(uniforms.groundY), () => {
        posBuf.element(ix).assign(prevPosBuf.element(ix));
        posBuf.element(iy).assign(uniforms.groundY);
        posBuf.element(iz).assign(prevPosBuf.element(iz));
      });
    });
  })();
}

// ─── Shared distance constraint kernel factory ───────────────────────────────

/**
 * Factory for distance constraint solvers (stretch, bend, seam).
 *
 * @param posBuf        - Position storage node (flat f32, stride 3)
 * @param invMassBuf    - Inverse mass storage node (1 per particle)
 * @param idsBuf        - Constraint ID storage node (uint)
 * @param restLenBuf    - Rest length / target distance storage node (f32)
 * @param compliance    - Compliance uniform node
 * @param sdt           - Sub-timestep uniform node
 * @param idStride      - Elements per constraint in ID buffer (2 for pairs, 4 for quads)
 * @param idOffset0     - Index within stride for first particle (0 for pairs, 2 for bend)
 * @param idOffset1     - Index within stride for second particle (1 for pairs, 3 for bend)
 */
function makeDistanceConstraintFn(
  posBuf: StorageBufferNode<'float'>,
  invMassBuf: StorageBufferNode<'float'>,
  idsBuf: StorageBufferNode<'uint'>,
  restLenBuf: StorageBufferNode<'float'>,
  compliance: FloatUniform,
  sdt: FloatUniform,
  idStride: number,
  idOffset0: number,
  idOffset1: number,
) {
  return Fn(() => {
    const ci = instanceIndex; // constraint index

    // Read particle indices
    const baseIdx = uint(ci).mul(uint(idStride));
    const id0 = idsBuf.element(baseIdx.add(uint(idOffset0)));
    const id1 = idsBuf.element(baseIdx.add(uint(idOffset1)));

    // Inverse masses
    const w0 = invMassBuf.element(id0);
    const w1 = invMassBuf.element(id1);

    // Flat position indices
    const i0x = id0.mul(uint(3));
    const i0y = i0x.add(uint(1));
    const i0z = i0x.add(uint(2));
    const i1x = id1.mul(uint(3));
    const i1y = i1x.add(uint(1));
    const i1z = i1x.add(uint(2));

    // Compute delta
    const dx = posBuf.element(i1x).sub(posBuf.element(i0x));
    const dy = posBuf.element(i1y).sub(posBuf.element(i0y));
    const dz = posBuf.element(i1z).sub(posBuf.element(i0z));

    // Distance
    const len2 = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
    const len = len2.sqrt();

    // Avoid division by zero
    If(len.greaterThan(float(1e-7)), () => {
      // Rest length
      const restLen = restLenBuf.element(ci);

      // Constraint violation
      const C = len.sub(restLen);

      // XPBD compliance
      const alpha = compliance.div(sdt.mul(sdt));

      // Correction scalar
      const denom = w0.add(w1).add(alpha);
      const s = C.negate().div(denom);

      // Normalized gradient
      const nx = dx.div(len);
      const ny = dy.div(len);
      const nz = dz.div(len);

      // Push particle 0 along gradient (positive direction)
      posBuf.element(i0x).addAssign(nx.mul(s).mul(w0).negate());
      posBuf.element(i0y).addAssign(ny.mul(s).mul(w0).negate());
      posBuf.element(i0z).addAssign(nz.mul(s).mul(w0).negate());

      // Push particle 1 in opposite direction
      posBuf.element(i1x).addAssign(nx.mul(s).mul(w1));
      posBuf.element(i1y).addAssign(ny.mul(s).mul(w1));
      posBuf.element(i1z).addAssign(nz.mul(s).mul(w1));
    });
  })();
}

// ─── Post-solve kernel ───────────────────────────────────────────────────────

function makePostSolveFn(
  posBuf: StorageBufferNode<'float'>,
  prevPosBuf: StorageBufferNode<'float'>,
  velBuf: StorageBufferNode<'float'>,
  sdt: FloatUniform,
) {
  return Fn(() => {
    const i = instanceIndex;

    const ix = uint(i).mul(uint(3));
    const iy = ix.add(uint(1));
    const iz = ix.add(uint(2));

    // vel = (pos - prevPos) / sdt
    const vx = posBuf.element(ix).sub(prevPosBuf.element(ix)).div(sdt);
    const vy = posBuf.element(iy).sub(prevPosBuf.element(iy)).div(sdt);
    const vz = posBuf.element(iz).sub(prevPosBuf.element(iz)).div(sdt);

    // Speed squared
    const speed2 = vx.mul(vx).add(vy.mul(vy)).add(vz.mul(vz));

    // NaN guard: if speed² is NaN, zero velocity and restore prevPos
    // NaN != NaN, so speed2.equal(speed2) is false when NaN
    If(speed2.equal(speed2), () => {
      // Valid — check speed clamp (50 m/s max)
      const maxSpeed = float(50.0);
      const maxSpeed2 = maxSpeed.mul(maxSpeed);

      If(speed2.greaterThan(maxSpeed2), () => {
        // Scale down velocity
        const speed = speed2.sqrt();
        const scale = maxSpeed.div(speed);
        velBuf.element(ix).assign(vx.mul(scale));
        velBuf.element(iy).assign(vy.mul(scale));
        velBuf.element(iz).assign(vz.mul(scale));
      }).Else(() => {
        velBuf.element(ix).assign(vx);
        velBuf.element(iy).assign(vy);
        velBuf.element(iz).assign(vz);
      });
    }).Else(() => {
      // NaN detected — zero velocity, restore prevPos
      velBuf.element(ix).assign(float(0.0));
      velBuf.element(iy).assign(float(0.0));
      velBuf.element(iz).assign(float(0.0));
      posBuf.element(ix).assign(prevPosBuf.element(ix));
      posBuf.element(iy).assign(prevPosBuf.element(iy));
      posBuf.element(iz).assign(prevPosBuf.element(iz));
    });
  })();
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a TSL-based XPBD cloth solver.
 *
 * Returns compute nodes ready to be dispatched via `renderer.computeAsync(node)`.
 * All data is stored in StorageBufferAttributes shared with the vertex shader,
 * enabling zero-copy rendering.
 */
export function createTslSolver(
  buffers: TslBufferSet,
  config: TslSolverConfig,
): TslSolver {
  const N = buffers.numParticles;

  // ─── Uniforms ──────────────────────────────────────────────────────
  const uniforms = createUniforms(config);

  // ─── Wrap SBAs as TSL storage nodes ────────────────────────────────
  const posBuf = storage(buffers.positionSBA, 'float', N * 3);
  const prevPosBuf = storage(buffers.prevPosSBA, 'float', N * 3);
  const velBuf = storage(buffers.velocitySBA, 'float', N * 3);
  const invMassBuf = storage(buffers.invMassSBA, 'float', N);

  // ─── Pre-solve ─────────────────────────────────────────────────────
  const preSolveFn = makePreSolveFn(posBuf, prevPosBuf, velBuf, invMassBuf, uniforms);
  const preSolve = compute(preSolveFn, N);

  // ─── Stretch constraints (per-color) ───────────────────────────────
  const stretchColors = buffers.stretchColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 2);
    const restBuf = storage(color.restLengthsSBA, 'float', color.count);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, idsBuf, restBuf,
      uniforms.stretchCompliance, uniforms.sdt,
      2, 0, 1,
    );
    return compute(fn, color.count);
  });

  // ─── Bend constraints ──────────────────────────────────────────────
  let bend: ComputeNode | null = null;
  if (buffers.bendIdsSBA && buffers.bendRestSBA && buffers.numBendConstraints > 0) {
    const bendIdsBuf = storage(buffers.bendIdsSBA, 'uint', buffers.numBendConstraints * 4);
    const bendRestBuf = storage(buffers.bendRestSBA, 'float', buffers.numBendConstraints);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, bendIdsBuf, bendRestBuf,
      uniforms.bendCompliance, uniforms.sdt,
      4, 2, 3, // quad stride, opposite vertex indices
    );
    bend = compute(fn, buffers.numBendConstraints);
  }

  // ─── Seam constraints ──────────────────────────────────────────────
  let seam: ComputeNode | null = null;
  if (buffers.seamIdsSBA && buffers.seamTargetDistSBA && buffers.numSeamConstraints > 0) {
    const seamIdsBuf = storage(buffers.seamIdsSBA, 'uint', buffers.numSeamConstraints * 2);
    const seamRestBuf = storage(buffers.seamTargetDistSBA, 'float', buffers.numSeamConstraints);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, seamIdsBuf, seamRestBuf,
      uniforms.seamStiffness, uniforms.sdt,
      2, 0, 1,
    );
    seam = compute(fn, buffers.numSeamConstraints);
  }

  // ─── Post-solve ────────────────────────────────────────────────────
  const postSolveFn = makePostSolveFn(posBuf, prevPosBuf, velBuf, uniforms.sdt);
  const postSolve = compute(postSolveFn, N);

  // ─── Config updater ────────────────────────────────────────────────
  function updateConfig(partial: Partial<TslSolverConfig>): void {
    if (partial.dt !== undefined || partial.substeps !== undefined) {
      const dt = partial.dt ?? config.dt;
      const substeps = partial.substeps ?? config.substeps;
      config.dt = dt;
      config.substeps = substeps;
      uniforms.sdt.value = dt / substeps;
    }
    if (partial.gravity !== undefined) {
      config.gravity = partial.gravity;
      uniforms.gravX.value = partial.gravity[0];
      uniforms.gravY.value = partial.gravity[1];
      uniforms.gravZ.value = partial.gravity[2];
    }
    if (partial.damping !== undefined) {
      config.damping = partial.damping;
      uniforms.damping.value = partial.damping;
    }
    if (partial.stretchCompliance !== undefined) {
      config.stretchCompliance = partial.stretchCompliance;
      uniforms.stretchCompliance.value = partial.stretchCompliance;
    }
    if (partial.bendCompliance !== undefined) {
      config.bendCompliance = partial.bendCompliance;
      uniforms.bendCompliance.value = partial.bendCompliance;
    }
    if (partial.seamStiffness !== undefined) {
      config.seamStiffness = partial.seamStiffness;
      uniforms.seamStiffness.value = partial.seamStiffness;
    }
    if (partial.groundY !== undefined) {
      config.groundY = partial.groundY;
      uniforms.groundY.value = partial.groundY;
    }
  }

  return {
    preSolve,
    stretchColors,
    bend,
    seam,
    postSolve,
    positionSBA: buffers.positionSBA,
    numParticles: N,
    numTriangles: buffers.numTriangles,
    triangles: buffers.triangles,
    updateConfig,
  };
}

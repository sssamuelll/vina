/**
 * TSL Compute Solver — ports WGSL shaders to Three.js TSL Fn() functions.
 *
 * Each solver step reads/writes StorageBufferAttribute instances from the
 * TslBufferSet. The vertex shader can reference the same SBAs via
 * material.positionNode, achieving zero-copy rendering.
 *
 * IMPORTANT: Three.js pads StorageBufferAttribute with itemSize=3 to vec4
 * (stride 4) on the GPU for alignment. The compute kernels MUST use 'vec3'
 * storage type so TSL handles this padding transparently. Using 'float'
 * with flat N*3 indexing would misalign every particle after the first.
 *
 * Solver steps:
 *   1. preSolve     — save prevPos, integrate gravity + damping (per-particle)
 *   2. stretch      — graph-colored distance constraints (per-color dispatch)
 *   3. bend         — single Jacobi distance constraint on opposite verts
 *   4. seam         — distance constraint pulling seam pairs together
 *   5. groundClamp  — clamp positions to ground plane (AFTER constraints)
 *   6. postSolve    — velocity update, ground friction, NaN guard, speed clamp
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
  int,
  vec3,
  instanceIndex,
  atomicStore,
  atomicAdd,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import type { TslBufferSet } from './tslBuffers';
import type { TslCollisionBody } from './tslCollision';
import type { SelfCollisionComputeNodes } from './tslSelfCollision';
import { makeSelfCollisionComputeNodes } from './tslSelfCollision';
import type { WindComputeNodes } from './tslWind';
import { makeWindComputeNode, createWindBuffers } from './tslWind';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface TslSolverConfig {
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  internalDamping: number;
  seamStiffness: number;
  groundY: number;
  dt: number;
  selfCollision?: boolean;
  thickness?: number;
  windForce?: [number, number, number];
  dragCoefficient?: number;
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
  /** Ground plane clamping (dispatch AFTER constraints, BEFORE postSolve) */
  groundClamp: ComputeNode;
  /** Post-solve compute node (velocity update + ground friction + clamping) */
  postSolve: ComputeNode;
  /** Position SBA — shared with vertex shader for zero-copy rendering */
  positionSBA: StorageBufferAttribute;
  /**
   * Position storage node — the SAME node used by compute kernels.
   * Use `.toAttribute()` for material.positionNode to ensure the vertex
   * shader reads from the same GPU buffer that compute writes to.
   */
  positionBufNode: TslNode;
  /** Normal storage node for material.normalNode (GPU smooth normals) */
  normalBufNode: TslNode;
  /** Normal SBA (for potential CPU readback) */
  normalSBA: StorageBufferAttribute;
  /** Zero the normal accumulation buffer (dispatch: numParticles) */
  normalZero: ComputeNode;
  /** Accumulate face normals per vertex via atomicAdd (dispatch: numTriangles) */
  normalAccum: ComputeNode;
  /** Normalize accumulated normals and write to normalSBA (dispatch: numParticles) */
  normalNormalize: ComputeNode;
  /** Number of particles */
  numParticles: number;
  /** Number of triangles */
  numTriangles: number;
  /** Triangle index buffer */
  triangles: Uint32Array;
  /** Previous position storage node (for collision friction computation) */
  prevPosBufNode: TslNode;
  /** Inverse mass storage node (for collision pinned-particle check) */
  invMassBufNode: TslNode;
  /** Self-collision compute nodes (null if disabled) */
  selfCollisionNodes: SelfCollisionComputeNodes | null;
  /** Wind force compute nodes (always created; zero wind is a no-op) */
  windNodes: WindComputeNodes;
  /** Active collision bodies (BVH-accelerated) */
  collisionBodies: TslCollisionBody[];
  /** Add or replace a collision body */
  setCollisionBody(body: TslCollisionBody): void;
  /** Remove a collision body by ID */
  removeCollisionBody(id: string): void;
  /** Update solver uniforms at runtime */
  updateConfig: (config: Partial<TslSolverConfig>) => void;
}

// ─── Uniform nodes ───────────────────────────────────────────────────────────

// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FloatUniform = any;

interface SolverUniforms {
  sdt: FloatUniform;
  gravX: FloatUniform;
  gravY: FloatUniform;
  gravZ: FloatUniform;
  damping: FloatUniform;
  internalDamping: FloatUniform;
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
    internalDamping: uniform(config.internalDamping),
    seamStiffness: uniform(config.seamStiffness),
    groundY: uniform(config.groundY),
  };
}

// ─── Pre-solve kernel ────────────────────────────────────────────────────────

/**
 * Pre-solve: save previous positions, integrate gravity and damping.
 * Ground collision is NOT here — it's in a separate groundClamp pass
 * that runs AFTER constraint solving (matching the CPU solver order).
 */
function makePreSolveFn(
  posBuf: TslNode,
  prevPosBuf: TslNode,
  velBuf: TslNode,
  invMassBuf: TslNode,
  uniforms: SolverUniforms,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;

    // Read invMass — if zero, particle is pinned
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      // Save prevPos = pos
      prevPosBuf.element(i).assign(posBuf.element(i));

      // vel += gravity * sdt
      const grav = vec3(uniforms.gravX, uniforms.gravY, uniforms.gravZ);
      velBuf.element(i).addAssign(grav.mul(uniforms.sdt));

      // Internal damping: totalDamping = damping * (1 - internalDamping * 0.1)
      // Matches CPU solver's damping model from xpbdSolver.ts
      const totalDamping = uniforms.damping.mul(
        float(1.0).sub(uniforms.internalDamping.mul(float(0.1))),
      );
      velBuf.element(i).assign(velBuf.element(i).mul(totalDamping));

      // pos += vel * sdt
      posBuf.element(i).addAssign(velBuf.element(i).mul(uniforms.sdt));
    });
  })();
}

// ─── Ground clamp kernel ─────────────────────────────────────────────────────

/**
 * Ground plane constraint: clamp Y to groundY.
 * Runs AFTER all soft constraints (stretch, bend, seam) so that constraints
 * can't push particles below ground. Only clamps Y — horizontal position
 * is free to move (friction is handled in postSolve).
 */
function makeGroundClampFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  groundY: FloatUniform,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      If(posBuf.element(i).y.lessThan(groundY), () => {
        posBuf.element(i).y.assign(groundY);
      });
    });
  })();
}

// ─── Shared distance constraint kernel factory ───────────────────────────────

/**
 * Factory for distance constraint solvers (stretch, bend, seam).
 *
 * Compliance source: per-constraint buffer (stretch/bend) or uniform (seam).
 * Exactly one of complianceBuf/complianceUniform must be non-null.
 */
function makeDistanceConstraintFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  idsBuf: TslNode,
  restLenBuf: TslNode,
  sdt: FloatUniform,
  idStride: number,
  idOffset0: number,
  idOffset1: number,
  complianceBuf: TslNode | null,
  complianceUniform: FloatUniform | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex; // constraint index

    // Read particle indices from flat ID buffer
    const baseIdx = uint(ci).mul(uint(idStride));
    const id0 = idsBuf.element(baseIdx.add(uint(idOffset0)));
    const id1 = idsBuf.element(baseIdx.add(uint(idOffset1)));

    // Inverse masses
    const w0 = invMassBuf.element(id0);
    const w1 = invMassBuf.element(id1);

    // Compute delta vector between particles
    const delta = posBuf.element(id1).sub(posBuf.element(id0));

    // Distance
    const len2 = delta.dot(delta);
    const len = len2.sqrt();

    // Avoid division by zero
    If(len.greaterThan(float(1e-7)), () => {
      // Rest length
      const restLen = restLenBuf.element(ci);

      // Constraint violation
      const C = len.sub(restLen);

      // XPBD compliance — per-constraint buffer or uniform fallback
      const complianceVal = complianceBuf
        ? complianceBuf.element(ci)
        : complianceUniform!;
      const alpha = complianceVal.div(sdt.mul(sdt));

      // Correction scalar
      const denom = w0.add(w1).add(alpha);
      const s = C.negate().div(denom);

      // Normalized gradient
      const n = delta.div(len);

      // Push particle 0 along gradient (toward particle 1 when stretched)
      posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());

      // Push particle 1 in opposite direction
      posBuf.element(id1).addAssign(n.mul(s).mul(w1));
    });
  })();
}

// ─── Post-solve kernel ───────────────────────────────────────────────────────

/**
 * Post-solve: compute velocity from position change, apply ground friction,
 * clamp speed, guard against NaN.
 *
 * Ground friction uses a simplified Coulomb model matching the CPU solver:
 * - Static friction: zero horizontal velocity when tangent speed < threshold
 * - Kinetic friction: decelerate horizontal velocity proportional to gravity
 * - Vertical velocity: zero out downward component when on ground
 */
function makePostSolveFn(
  posBuf: TslNode,
  prevPosBuf: TslNode,
  velBuf: TslNode,
  invMassBuf: TslNode,
  uniforms: SolverUniforms,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      // vel = (pos - prevPos) / sdt
      const v = posBuf.element(i).sub(prevPosBuf.element(i)).div(uniforms.sdt);

      // Speed squared
      const speed2 = v.dot(v);

      // NaN guard: NaN != NaN, so speed2.equal(speed2) is false when NaN
      If(speed2.equal(speed2), () => {
        // Check if particle is on or near ground (within tolerance)
        const groundTolerance = float(0.001);

        If(posBuf.element(i).y.lessThan(uniforms.groundY.add(groundTolerance)), () => {
          // ─── On ground: apply Coulomb friction ───────────────────
          const tangentSpeed2 = v.x.mul(v.x).add(v.z.mul(v.z));
          const tangentSpeed = tangentSpeed2.sqrt();

          If(tangentSpeed.lessThan(float(0.01)), () => {
            // Static friction: stop horizontal motion
            velBuf.element(i).x.assign(float(0.0));
            velBuf.element(i).z.assign(float(0.0));
          }).Else(() => {
            // Kinetic friction: decelerate tangent velocity
            // frictionDecel = mu_k * g * sdt (mu_k=0.4, g=9.81)
            const frictionDecel = float(0.4).mul(float(9.81)).mul(uniforms.sdt);
            // newSpeed = max(0, tangentSpeed - frictionDecel)
            const reduced = tangentSpeed.sub(frictionDecel);

            If(reduced.lessThan(float(0.0)), () => {
              velBuf.element(i).x.assign(float(0.0));
              velBuf.element(i).z.assign(float(0.0));
            }).Else(() => {
              const scale = reduced.div(tangentSpeed);
              velBuf.element(i).x.assign(v.x.mul(scale));
              velBuf.element(i).z.assign(v.z.mul(scale));
            });
          });

          // Vertical: prevent downward velocity (allow upward/bounce)
          If(v.y.lessThan(float(0.0)), () => {
            velBuf.element(i).y.assign(float(0.0));
          }).Else(() => {
            velBuf.element(i).y.assign(v.y);
          });
        }).Else(() => {
          // ─── Not on ground: normal velocity with speed clamp ─────
          const maxSpeed = float(5.0);
          const maxSpeed2 = maxSpeed.mul(maxSpeed);

          If(speed2.greaterThan(maxSpeed2), () => {
            const speed = speed2.sqrt();
            velBuf.element(i).assign(v.mul(maxSpeed.div(speed)));
          }).Else(() => {
            velBuf.element(i).assign(v);
          });
        });
      }).Else(() => {
        // NaN detected — zero velocity, restore prevPos
        velBuf.element(i).assign(vec3(0, 0, 0));
        posBuf.element(i).assign(prevPosBuf.element(i));
      });
    });
  })();
}

// ─── Normal compute kernels ──────────────────────────────────────────────────

/**
 * Fixed-point scale for atomic normal accumulation.
 * Face normals (float) are multiplied by this before conversion to int32.
 * Precision: 1e-6. Overflow: safe for up to ~2100 adjacent triangles per vertex.
 */
const NORMAL_SCALE = 1000000.0;

/**
 * Zero the normal accumulation buffer before each frame's normal recompute.
 * Uses atomicStore since the buffer is declared atomic (for atomicAdd in accum pass).
 */
function makeNormalZeroFn(
  normalAccumBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const base = uint(i).mul(uint(3));
    // Use toVar() to force explicit i32 type in WGSL — bare int(0) emits AbstractInt
    // which some WebGPU implementations reject for atomicStore
    const zeroI32 = int(0).toVar();
    atomicStore(normalAccumBuf.element(base), zeroI32);
    atomicStore(normalAccumBuf.element(base.add(uint(1))), zeroI32);
    atomicStore(normalAccumBuf.element(base.add(uint(2))), zeroI32);
  })();
}

/**
 * Accumulate face normals per vertex using atomicAdd on int32 fixed-point.
 * Dispatched once per triangle. Each triangle contributes its (unnormalized)
 * face normal to all 3 vertices — area weighting is implicit since cross
 * product magnitude = 2× triangle area.
 */
function makeNormalAccumFn(
  posBuf: TslNode,
  triIdsBuf: TslNode,
  normalAccumBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const tri = instanceIndex;
    const triBase = uint(tri).mul(uint(3));

    // Vertex indices for this triangle
    const i0 = triIdsBuf.element(triBase);
    const i1 = triIdsBuf.element(triBase.add(uint(1)));
    const i2 = triIdsBuf.element(triBase.add(uint(2)));

    // Vertex positions
    const p0 = posBuf.element(i0);
    const p1 = posBuf.element(i1);
    const p2 = posBuf.element(i2);

    // Edge vectors
    const e1 = p1.sub(p0);
    const e2 = p2.sub(p0);

    // Face normal via cross product (manual to avoid import dependency)
    const fnx = e1.y.mul(e2.z).sub(e1.z.mul(e2.y));
    const fny = e1.z.mul(e2.x).sub(e1.x.mul(e2.z));
    const fnz = e1.x.mul(e2.y).sub(e1.y.mul(e2.x));

    // Convert to fixed-point int32
    const scale = float(NORMAL_SCALE);
    const inx = int(fnx.mul(scale));
    const iny = int(fny.mul(scale));
    const inz = int(fnz.mul(scale));

    // Accumulate on vertex 0
    const b0 = i0.mul(uint(3));
    atomicAdd(normalAccumBuf.element(b0), inx);
    atomicAdd(normalAccumBuf.element(b0.add(uint(1))), iny);
    atomicAdd(normalAccumBuf.element(b0.add(uint(2))), inz);

    // Accumulate on vertex 1
    const b1 = i1.mul(uint(3));
    atomicAdd(normalAccumBuf.element(b1), inx);
    atomicAdd(normalAccumBuf.element(b1.add(uint(1))), iny);
    atomicAdd(normalAccumBuf.element(b1.add(uint(2))), inz);

    // Accumulate on vertex 2
    const b2 = i2.mul(uint(3));
    atomicAdd(normalAccumBuf.element(b2), inx);
    atomicAdd(normalAccumBuf.element(b2.add(uint(1))), iny);
    atomicAdd(normalAccumBuf.element(b2.add(uint(2))), inz);
  })();
}

/**
 * Normalize accumulated face normals and write to the output normal buffer.
 * Reads from the atomic int32 accumulation buffer, converts to float,
 * normalizes, and writes to the vec3 normal buffer used by the vertex shader.
 */
function makeNormalNormalizeFn(
  normalBuf: TslNode,
  normalAccumBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const invScale = float(1.0 / NORMAL_SCALE);
    const base = uint(i).mul(uint(3));

    // Read accumulated fixed-point i32 values. This runs in a separate pass
    // after accumulation, so no concurrent writes — regular element access is safe.
    // (Three.js TSL doesn't export atomicLoad; each Fn() compiles to its own
    // shader, so this buffer won't be declared atomic in the normalize kernel.)
    const nx = float(normalAccumBuf.element(base)).mul(invScale);
    const ny = float(normalAccumBuf.element(base.add(uint(1)))).mul(invScale);
    const nz = float(normalAccumBuf.element(base.add(uint(2)))).mul(invScale);

    const n = vec3(nx, ny, nz);
    const len2 = n.dot(n);
    const len = len2.sqrt();

    // Write normalized normal, or fallback to up vector for degenerate cases
    If(len.greaterThan(float(1e-8)), () => {
      normalBuf.element(i).assign(n.div(len));
    }).Else(() => {
      normalBuf.element(i).assign(vec3(0, 1, 0));
    });
  })();
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a TSL-based XPBD cloth solver.
 *
 * Returns compute nodes ready to be dispatched via `renderer.compute(node)`.
 * All data is stored in StorageBufferAttributes shared with the vertex shader,
 * enabling zero-copy rendering.
 *
 * Execution order per substep (matching CPU solver):
 *   preSolve → stretch(per-color) → bend → seam → groundClamp → postSolve
 */
export function createTslSolver(
  buffers: TslBufferSet,
  config: TslSolverConfig,
): TslSolver {
  const N = buffers.numParticles;

  // ─── Uniforms ──────────────────────────────────────────────────────
  const uniforms = createUniforms(config);

  // ─── Wrap SBAs as TSL storage nodes ────────────────────────────────
  // Use 'vec3' type: Three.js pads itemSize=3 SBAs to vec4 on the GPU.
  // The 'vec3' storage type handles this padding transparently, while
  // 'float' with flat N*3 indexing would misalign at stride boundaries.
  const posBuf = storage(buffers.positionSBA, 'vec3', N);
  const prevPosBuf = storage(buffers.prevPosSBA, 'vec3', N);
  const velBuf = storage(buffers.velocitySBA, 'vec3', N);
  const invMassBuf = storage(buffers.invMassSBA, 'float', N);

  // ─── Pre-solve ─────────────────────────────────────────────────────
  const preSolveFn = makePreSolveFn(posBuf, prevPosBuf, velBuf, invMassBuf, uniforms);
  const preSolve = compute(preSolveFn, N, [64]);

  // ─── Stretch constraints (per-color, per-constraint compliance) ────
  const stretchColors = buffers.stretchColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 2);
    const restBuf = storage(color.restLengthsSBA, 'float', color.count);
    const compBuf = storage(color.complianceSBA, 'float', color.count);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, idsBuf, restBuf,
      uniforms.sdt,
      2, 0, 1,
      compBuf, null,
    );
    return compute(fn, color.count, [64]);
  });

  // ─── Bend constraints (per-constraint compliance) ──────────────────
  let bend: ComputeNode | null = null;
  if (buffers.bendIdsSBA && buffers.bendRestSBA && buffers.bendComplianceSBA && buffers.numBendConstraints > 0) {
    const bendIdsBuf = storage(buffers.bendIdsSBA, 'uint', buffers.numBendConstraints * 4);
    const bendRestBuf = storage(buffers.bendRestSBA, 'float', buffers.numBendConstraints);
    const bendCompBuf = storage(buffers.bendComplianceSBA, 'float', buffers.numBendConstraints);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, bendIdsBuf, bendRestBuf,
      uniforms.sdt,
      4, 2, 3, // quad stride, opposite vertex indices
      bendCompBuf, null,
    );
    bend = compute(fn, buffers.numBendConstraints, [64]);
  }

  // ─── Seam constraints (uniform compliance) ─────────────────────────
  let seam: ComputeNode | null = null;
  if (buffers.seamIdsSBA && buffers.seamTargetDistSBA && buffers.numSeamConstraints > 0) {
    const seamIdsBuf = storage(buffers.seamIdsSBA, 'uint', buffers.numSeamConstraints * 2);
    const seamRestBuf = storage(buffers.seamTargetDistSBA, 'float', buffers.numSeamConstraints);

    const fn = makeDistanceConstraintFn(
      posBuf, invMassBuf, seamIdsBuf, seamRestBuf,
      uniforms.sdt,
      2, 0, 1,
      null, uniforms.seamStiffness,
    );
    seam = compute(fn, buffers.numSeamConstraints, [64]);
  }

  // ─── Ground clamp (AFTER constraints, BEFORE postSolve) ───────────
  const groundClampFn = makeGroundClampFn(posBuf, invMassBuf, uniforms.groundY);
  const groundClamp = compute(groundClampFn, N, [64]);

  // ─── Post-solve (velocity update + ground friction + NaN guard) ────
  const postSolveFn = makePostSolveFn(posBuf, prevPosBuf, velBuf, invMassBuf, uniforms);
  const postSolve = compute(postSolveFn, N, [64]);

  // ─── GPU smooth normals (atomic accumulation) ─────────────────────
  const normalBuf = storage(buffers.normalSBA, 'vec3', N);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalAccumBuf = storage(buffers.normalAccumSBA, 'int' as any, N * 3);
  const triIdsBuf = storage(buffers.triangleIdsSBA, 'uint', buffers.numTriangles * 3);

  const normalZeroFn = makeNormalZeroFn(normalAccumBuf);
  const normalZero = compute(normalZeroFn, N, [64]);

  const normalAccumFn = makeNormalAccumFn(posBuf, triIdsBuf, normalAccumBuf);
  const normalAccum = compute(normalAccumFn, buffers.numTriangles, [64]);

  const normalNormalizeFn = makeNormalNormalizeFn(normalBuf, normalAccumBuf);
  const normalNormalize = compute(normalNormalizeFn, N, [64]);

  // ─── Collision body management ──────────────────────────────────────
  const collisionBodies: TslCollisionBody[] = [];

  function setCollisionBody(body: TslCollisionBody): void {
    const idx = collisionBodies.findIndex(b => b.id === body.id);
    if (idx >= 0) {
      collisionBodies[idx] = body;
    } else {
      collisionBodies.push(body);
    }
  }

  function removeCollisionBody(id: string): void {
    const idx = collisionBodies.findIndex(b => b.id === id);
    if (idx >= 0) collisionBodies.splice(idx, 1);
  }

  // ─── Self-collision (optional) ─────────────────────────────────────
  let selfCollisionNodes: SelfCollisionComputeNodes | null = null;
  if (config.selfCollision && buffers.scBuffers) {
    selfCollisionNodes = makeSelfCollisionComputeNodes(
      posBuf,
      invMassBuf,
      buffers.scBuffers,
      config.thickness ?? 0.002,
    );
  }

  // ─── Wind force ────────────────────────────────────────────────────────
  // Always create wind nodes so wind can be toggled on mid-simulation.
  // When windForce is [0,0,0] the compute is essentially a no-op.
  const windForce = config.windForce ?? [0, 0, 0];
  const dragCoeff = config.dragCoefficient ?? 1.0;
  const wb = buffers.windBuffers ?? createWindBuffers(N);
  if (!buffers.windBuffers) buffers.windBuffers = wb;
  const windTriIdsBuf = storage(buffers.triangleIdsSBA, 'uint', buffers.numTriangles * 3);
  const windNodes: WindComputeNodes = makeWindComputeNode(
    posBuf,
    velBuf,
    invMassBuf,
    uniforms.sdt,
    windTriIdsBuf,
    wb,
    buffers.numTriangles,
    windForce as [number, number, number],
    dragCoeff,
  );

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
    if (partial.internalDamping !== undefined) {
      config.internalDamping = partial.internalDamping;
      uniforms.internalDamping.value = partial.internalDamping;
    }
    if (partial.seamStiffness !== undefined) {
      config.seamStiffness = partial.seamStiffness;
      uniforms.seamStiffness.value = partial.seamStiffness;
    }
    if (partial.groundY !== undefined) {
      config.groundY = partial.groundY;
      uniforms.groundY.value = partial.groundY;
    }
    if (partial.windForce !== undefined) {
      config.windForce = partial.windForce;
      windNodes.windX.value = partial.windForce[0];
      windNodes.windY.value = partial.windForce[1];
      windNodes.windZ.value = partial.windForce[2];
    }
    if (partial.dragCoefficient !== undefined) {
      config.dragCoefficient = partial.dragCoefficient;
      windNodes.dragCoeff.value = partial.dragCoefficient;
    }
  }

  return {
    preSolve,
    stretchColors,
    bend,
    seam,
    groundClamp,
    postSolve,
    positionSBA: buffers.positionSBA,
    positionBufNode: posBuf,
    prevPosBufNode: prevPosBuf,
    invMassBufNode: invMassBuf,
    normalBufNode: normalBuf,
    normalSBA: buffers.normalSBA,
    normalZero,
    normalAccum,
    normalNormalize,
    numParticles: N,
    numTriangles: buffers.numTriangles,
    triangles: buffers.triangles,
    selfCollisionNodes,
    windNodes,
    collisionBodies,
    setCollisionBody,
    removeCollisionBody,
    updateConfig,
  };
}

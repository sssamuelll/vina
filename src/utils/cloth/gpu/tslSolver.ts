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
 *   4. seam         — graph-colored decaying-target constraints closing seam pairs
 *   5. groundClamp  — clamp positions to ground plane (AFTER constraints)
 *   6. snapshotPreCollision — pos → preCollisionPos (tras grab, ANTES de
 *      colisión de cuerpo; espejo de preCollisionBuf en wasmSolverWorker)
 *   7. postSolve    — velocity from preCollisionPos (collision push excluded),
 *      inelastic response, ground friction, NaN guard, speed clamp
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
  atomicLoad,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import type { TslBufferSet } from './tslBuffers';
import { makeAtomicStorage } from './atomicStorage';
import type { TslCollisionBody } from './tslCollision';
import type { SelfCollisionComputeNodes } from './tslSelfCollision';
import { makeSelfCollisionComputeNodes } from './tslSelfCollision';
import type { WindComputeNodes } from './tslWind';
import { makeWindComputeNode, createWindBuffers } from './tslWind';
import { makeBrushComputeNode, type BrushComputeNodes } from './tslBrush';
import { makeGrabComputeNode, type GrabComputeNodes } from './tslGrab';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface TslSolverConfig {
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  internalDamping: number;
  /**
   * Per-substep seam target decay factor (target ×= shrink each substep).
   * Init-only — espejo de WASM, donde `set_seam_shrink_params` se cablea en
   * init; updateConfig no tiene rama para este campo.
   */
  seamShrinkFactor: number;
  /**
   * Seam target floor: below it the target snaps to 0 ("sewed"). Init-only,
   * same rationale as seamShrinkFactor.
   */
  seamSewedThreshold: number;
  groundY: number;
  dt: number;
  selfCollision?: boolean;
  thickness?: number;
  windForce?: [number, number, number];
  dragCoefficient?: number;
  /**
   * Hard strain limit (#gummy STEP 4): max fractional edge elongation past rest
   * before a rigid one-sided clamp pulls it back. εmax=0.02 (2%, woven default).
   * Kills the residual rubberiness the compliant stretch solve can't (Jacobi
   * under-convergence). 0 disables. GPU-ahead vs WASM/CPU (A7 divergence).
   */
  maxStrain?: number;
}

// ─── Solver interface ────────────────────────────────────────────────────────

export interface TslSolver {
  /** Pre-solve compute node (gravity + Verlet integration) */
  preSolve: ComputeNode;
  /** Per-color stretch constraint compute nodes */
  stretchColors: ComputeNode[];
  /**
   * Per-color strain-limit compute nodes (#gummy STEP 4). Hard one-sided edge
   * clamp to restLen*(1+maxStrain); reuses the stretch graph coloring 1:1
   * (race-free). Dispatch AFTER stretch/bend/seam/self-collision, BEFORE
   * groundClamp/snapshot. Empty if no stretch constraints.
   */
  strainLimitColors: ComputeNode[];
  /** Bend constraint compute node (null if no bend constraints) */
  bend: ComputeNode | null;
  /**
   * Per-color seam constraint compute nodes (empty if no seam constraints).
   * F1.4 (#897): dedicated kernel (`makeSeamConstraintFn`) with in-kernel
   * per-substep target decay + per-constraint compliance (from SeamPair),
   * espejo behavioral de Rust `solve_seams`.
   */
  seamColors: ComputeNode[];
  /** Ground plane clamping (dispatch AFTER constraints, BEFORE postSolve) */
  groundClamp: ComputeNode;
  /**
   * pos → preCollisionPos snapshot (#897 F2.3). Dispatch tras grab y ANTES
   * de los cuerpos de colisión, en cada substep — incluso con 0 cuerpos
   * (entonces preCollisionPos == pos y postSolve degrada al comportamiento
   * previo exacto). Espejo de `preCollisionBuf.set(posView)` en
   * wasmSolverWorker.ts:352.
   */
  snapshotPreCollision: ComputeNode;
  /**
   * Post-solve compute node: velocity derived from preCollisionPos (collision
   * push excluded), inelastic response, ground friction, NaN guard, clamping.
   */
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
  /** Steam brush velocity damping compute nodes (always created; zero strength is a no-op) */
  brushNodes: BrushComputeNodes;
  /** Mesh grab position displacement compute nodes (always created; grabActive=0 is a no-op) */
  grabNodes: GrabComputeNodes;
  /**
   * Update the TSL grab uniforms (`grabNodes.*`) without reaching into the
   * raw `{value: number}` proxies. Per C4 follow-up #703 — encapsulates the
   * uniform write shape so `toolDispatch.ts` doesn't depend on the per-uniform
   * layout (`.grabNodes.<field>.value`). Refactors of the TSL grab kernel
   * (e.g., bundling fields into a UBO struct) only need to update this method.
   *
   * - `point`: world-space grab center. Always written.
   * - `opts.radius` / `opts.strength`: optional. Skip = preserve previous value
   *   (move dispatches only push the center, leaving radius/strength alone).
   * - `opts.active` / `opts.initPending`: `0 | 1` flags. Skip = preserve
   *   previous value (init writes both `=1`; release writes `active=0`).
   */
  setGrabUniforms(
    point: [number, number, number],
    opts?: {
      radius?: number;
      strength?: number;
      active?: 0 | 1;
      initPending?: 0 | 1;
    },
  ): void;
  /** Active collision bodies (BVH-accelerated) */
  collisionBodies: TslCollisionBody[];
  /**
   * Add or replace a collision body. When `body.id` matches an existing
   * registration, the previous body's `dispose(renderer)` is invoked before
   * the swap so its per-body atomic scratch SBAs are released. `renderer` is
   * best-effort — without it, `dispose` only drops JS references (same
   * semantics as `disposeStorageBufferAttribute`).
   */
  setCollisionBody(body: TslCollisionBody, renderer?: unknown): void;
  /**
   * Remove a collision body by ID, calling `body.dispose(renderer)` before
   * splice. Best-effort without a renderer.
   */
  removeCollisionBody(id: string, renderer?: unknown): void;
  /** Update solver uniforms at runtime */
  updateConfig: (config: Partial<TslSolverConfig>) => void;
  /**
   * Release solver-owned references so GC can reclaim TSL nodes/uniforms,
   * and dispose every registered collision body's per-body atomic scratch
   * SBAs via `body.dispose(renderer)` before clearing the array.
   *
   * GPU buffers backing the SBAs in the `TslBufferSet` are NOT freed here —
   * that is the buffer set owner's responsibility (see `destroyTslBufferSet`
   * in `tslBuffers.ts`). Per-collision-body BVH SBAs are owned by the caller
   * of `setCollisionBody` (see `GpuSolverClient.setTslCollisionBody`) and
   * disposed there.
   */
  dispose(renderer?: unknown): void;
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
  seamShrinkFactor: FloatUniform;
  seamSewedThreshold: FloatUniform;
  groundY: FloatUniform;
  maxStrain: FloatUniform;
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
    seamShrinkFactor: uniform(config.seamShrinkFactor),
    seamSewedThreshold: uniform(config.seamSewedThreshold),
    groundY: uniform(config.groundY),
    maxStrain: uniform(config.maxStrain ?? 0.02),
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
 * Factory for distance constraint solvers (stretch, bend).
 *
 * Compliance is always per-constraint (complianceBuf). The legacy uniform
 * fallback was removed in #897 F1.4 — seams, its last caller, now use the
 * dedicated `makeSeamConstraintFn` with in-kernel target decay.
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
  complianceBuf: TslNode,
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

      // XPBD compliance — per-constraint
      const alpha = complianceBuf.element(ci).div(sdt.mul(sdt));

      const denom = w0.add(w1).add(alpha);
      // Guard 0/0 (espejo de Rust `if w_sum == 0 { continue }` y del solver CPU):
      // pieza congelada (invMass=0 en ambos extremos) + compliance 0 (default
      // warp/weft) producía NaN permanente — postSolve no restaura pinned.
      If(denom.greaterThan(float(0.0)), () => {
        // Correction scalar
        const s = C.negate().div(denom);

        // Normalized gradient
        const n = delta.div(len);

        // Push particle 0 along gradient (toward particle 1 when stretched)
        posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());

        // Push particle 1 in opposite direction
        posBuf.element(id1).addAssign(n.mul(s).mul(w1));
      });
    });
  })();
}

/**
 * Strain-limiting kernel (#gummy STEP 4). A rigid, ONE-SIDED distance clamp:
 * when an edge is stretched past restLen*(1+maxStrain), project both particles
 * back to that cap (mass-weighted, alpha=0 — no compliance). Never compresses.
 * Reuses the stretch ids+restLengths + graph coloring (race-free), so it kills
 * the residual stretch the compliant Jacobi solve under-converges on.
 */
function makeStrainLimitFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  idsBuf: TslNode,
  restLenBuf: TslNode,
  maxStrain: FloatUniform,
  idStride: number,
  idOffset0: number,
  idOffset1: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex;
    const baseIdx = uint(ci).mul(uint(idStride));
    const id0 = idsBuf.element(baseIdx.add(uint(idOffset0)));
    const id1 = idsBuf.element(baseIdx.add(uint(idOffset1)));
    const w0 = invMassBuf.element(id0);
    const w1 = invMassBuf.element(id1);
    const delta = posBuf.element(id1).sub(posBuf.element(id0));
    const len = delta.dot(delta).sqrt();
    If(len.greaterThan(float(1e-7)), () => {
      const maxLen = restLenBuf.element(ci).mul(maxStrain.add(float(1.0)));
      // One-sided: only clamp when over-stretched (never compress the cloth).
      If(len.greaterThan(maxLen), () => {
        const denom = w0.add(w1);
        If(denom.greaterThan(float(0.0)), () => {
          const s = len.sub(maxLen).negate().div(denom); // rigid (alpha=0)
          const n = delta.div(len);
          posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());
          posBuf.element(id1).addAssign(n.mul(s).mul(w1));
        });
      });
    });
  })();
}

// ─── Seam constraint kernel factory ──────────────────────────────────────────

/**
 * Seam kernel — espejo behavioral de Rust `solve_seams` (lib.rs:649-711):
 * decay del target ANTES de resolver (×shrink por substep, snap a 0 bajo
 * threshold), luego proyección XPBD con compliance per-constraint.
 * Race-free: (a) dentro de un color no se comparten vértices; (b) cada
 * constraint posee su slot de target en exclusiva; (c) cada constraint vive
 * en exactamente un color → el decay tickea una vez por substep. Cadencia
 * por frame = 0.97^substeps — igual que WASM en la rama con avatar (la de
 * producción); la rama WASM sin avatar (1 tick/frame a sdt=1/60) es una
 * divergencia preexistente de WASM, no el target de paridad. El
 * write-then-re-read de targetBuf dentro de la invocación es coherente
 * (program order + element nodes frescos emiten load tras el store).
 */
function makeSeamConstraintFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  idsBuf: TslNode,
  targetBuf: TslNode,
  complianceBuf: TslNode,
  sdt: FloatUniform,
  shrink: FloatUniform,
  threshold: FloatUniform,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex; // constraint index

    // ── Decay (shrink-before-solve, espejo lib.rs:656-664) ──
    const tgt = targetBuf.element(ci);
    If(tgt.greaterThan(threshold), () => {
      const shrunk = tgt.mul(shrink);
      If(shrunk.lessThan(threshold), () => {
        targetBuf.element(ci).assign(float(0.0));
      }).Else(() => {
        targetBuf.element(ci).assign(shrunk);
      });
    });

    // ── Proyección XPBD (espejo lib.rs:666-700) ──
    const id0 = idsBuf.element(uint(ci).mul(uint(2)));
    const id1 = idsBuf.element(uint(ci).mul(uint(2)).add(uint(1)));
    const w0 = invMassBuf.element(id0);
    const w1 = invMassBuf.element(id1);
    const delta = posBuf.element(id1).sub(posBuf.element(id0));
    const len = delta.dot(delta).sqrt();

    If(len.greaterThan(float(1e-7)), () => {
      const restLen = targetBuf.element(ci); // re-leído post-decay
      const C = len.sub(restLen);
      const alpha = complianceBuf.element(ci).div(sdt.mul(sdt));
      const denom = w0.add(w1).add(alpha);
      If(denom.greaterThan(float(0.0)), () => {
        const s = C.negate().div(denom);
        const n = delta.div(len);
        posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());
        posBuf.element(id1).addAssign(n.mul(s).mul(w1));
      });
    });
  })();
}

// ─── Pre-collision snapshot kernel ───────────────────────────────────────────

/** pos → preCollisionPos. Tras grab, antes de colisión de cuerpo (espejo de
 *  preCollisionBuf.set(posView) en wasmSolverWorker). Siempre se despacha:
 *  con 0 cuerpos preCollisionPos==pos ⇒ postSolve degrada al comportamiento
 *  actual exacto. */
function makeSnapshotPreCollisionFn(posBuf: TslNode, preColBuf: TslNode) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    preColBuf.element(instanceIndex).assign(posBuf.element(instanceIndex));
  })();
}

// ─── Post-solve kernel ───────────────────────────────────────────────────────

/**
 * Post-solve: compute velocity from PRE-COLLISION position change (#897 F2.3
 * — collision push corrects position but must NOT create velocity), apply
 * inelastic collision response, ground friction, clamp speed, guard NaN.
 *
 * Ground friction uses a simplified Coulomb model matching the CPU solver:
 * - Static friction: zero horizontal velocity when tangent speed < threshold
 * - Kinetic friction: decelerate horizontal velocity proportional to gravity
 * - Vertical velocity: zero out downward component when on ground
 */
function makePostSolveFn(
  posBuf: TslNode,
  prevPosBuf: TslNode,
  preColBuf: TslNode,
  velBuf: TslNode,
  invMassBuf: TslNode,
  uniforms: SolverUniforms,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      // Velocidad NATURAL pre-colisión (espejo wasmSolverWorker.ts:367-375):
      // el push corrige posición pero NO crea velocidad (a 900Hz, 5cm → 45m/s).
      const vNat = preColBuf.element(i).sub(prevPosBuf.element(i)).div(uniforms.sdt).toVar('vNat');

      // Inelástica (espejo :377-399): si hubo push, anular la componente de
      // vNat que apunta HACIA la superficie.
      //
      // Idioma TSL — vNat.subAssign(...) sobre un toVar vec3 dentro de Ifs
      // anidados (sin Loop) compone dos patrones ya establecidos: .assign
      // sobre toVars escalares en Ifs anidados (tslCollision bestSide/
      // bestDist/pushDist) y compound-assign sobre vec3 (preSolve
      // velBuf.addAssign). El pitfall outer-toVar documentado en
      // tslCollision.ts aplica a acumulación desde el interior de un Loop —
      // aquí no hay Loop.
      const push = posBuf.element(i).sub(preColBuf.element(i));
      const pushLen2 = push.dot(push);
      If(pushLen2.greaterThan(float(1e-20)), () => {
        const n = push.div(pushLen2.sqrt());
        const vn = vNat.dot(n);
        If(vn.lessThan(float(0.0)), () => {
          vNat.subAssign(n.mul(vn));
        });
      });

      const v = vNat;

      // Speed squared
      const speed2 = v.dot(v);

      // NaN guard: NaN != NaN, so the self-equal is false when NaN.
      // NaN-check de pos ADEMÁS del de v (review S3): pos puede ser NaN con
      // vNat finita (NaN nacido en los kernels de colisión, post-snapshot) —
      // WASM cubre esa ventana con guardNaN(posView) tras la colisión.
      const posLen2 = posBuf.element(i).dot(posBuf.element(i));
      If(speed2.equal(speed2).and(posLen2.equal(posLen2)), () => {
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

    // atomicLoad required because normalAccumBuf is declared
    // array<atomic<i32>> (post-`.setAtomic(true)` for #554 fix). WGSL
    // spec requires atomicLoad for atomic<T> access even in read-only
    // contexts. Previous note ("TSL doesn't export atomicLoad") was
    // outdated — verified Three.TSL.js:63 exports atomicLoad in three@0.183.2.
    const nx = float(atomicLoad(normalAccumBuf.element(base))).mul(invScale);
    const ny = float(atomicLoad(normalAccumBuf.element(base.add(uint(1))))).mul(invScale);
    const nz = float(atomicLoad(normalAccumBuf.element(base.add(uint(2))))).mul(invScale);

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
 * Execution order per substep (espejo WASM — ver GarmentSimulation.tsx):
 *   preSolve → stretch(per-color) → bend → seam(per-color) → groundClamp →
 *   [grab] → snapshotPreCollision → collision bodies → postSolve
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
  const preColBuf = storage(buffers.preCollisionPosSBA, 'vec3', N);
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
      compBuf,
    );
    return compute(fn, color.count, [64]);
  });

  // ─── Strain limiting (#gummy STEP 4) — rigid one-sided cap. Reuses the ─
  // stretch ids+restLengths + graph coloring (race-free); no compliance buffer.
  const strainLimitColors = buffers.stretchColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 2);
    const restBuf = storage(color.restLengthsSBA, 'float', color.count);
    const fn = makeStrainLimitFn(
      posBuf, invMassBuf, idsBuf, restBuf,
      uniforms.maxStrain,
      2, 0, 1,
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
      bendCompBuf,
    );
    bend = compute(fn, buffers.numBendConstraints, [64]);
  }

  // ─── Seam constraints (per-color, decaying target + compliance) ────
  // F1.4 (#897): dedicated kernel — per-substep target decay in-kernel
  // (espejo de Rust solve_seams) + compliance per-constraint from the
  // group's SBA. One dispatch per color group; each constraint owns its
  // targetDist slot exclusively, so the decay tick is race-free.
  const seamColors = buffers.seamColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 2);
    const targetBuf = storage(color.targetDistSBA, 'float', color.count);
    const compBuf = storage(color.complianceSBA, 'float', color.count);

    const fn = makeSeamConstraintFn(
      posBuf, invMassBuf, idsBuf, targetBuf, compBuf,
      uniforms.sdt,
      uniforms.seamShrinkFactor,
      uniforms.seamSewedThreshold,
    );
    return compute(fn, color.count, [64]);
  });

  // ─── Ground clamp (AFTER constraints, BEFORE postSolve) ───────────
  const groundClampFn = makeGroundClampFn(posBuf, invMassBuf, uniforms.groundY);
  const groundClamp = compute(groundClampFn, N, [64]);

  // ─── Pre-collision snapshot (tras grab, ANTES de colisión — #897 F2.3) ──
  const snapshotPreCollisionFn = makeSnapshotPreCollisionFn(posBuf, preColBuf);
  const snapshotPreCollision = compute(snapshotPreCollisionFn, N, [64]);

  // ─── Post-solve (velocity from preCollisionPos + friction + NaN guard) ──
  const postSolveFn = makePostSolveFn(posBuf, prevPosBuf, preColBuf, velBuf, invMassBuf, uniforms);
  const postSolve = compute(postSolveFn, N, [64]);

  // ─── GPU smooth normals (atomic accumulation) ─────────────────────
  const normalBuf = storage(buffers.normalSBA, 'vec3', N);
  const normalAccumBuf = makeAtomicStorage(buffers.normalAccumSBA, 'int', N * 3);
  const triIdsBuf = storage(buffers.triangleIdsSBA, 'uint', buffers.numTriangles * 3);

  const normalZeroFn = makeNormalZeroFn(normalAccumBuf);
  const normalZero = compute(normalZeroFn, N, [64]);

  const normalAccumFn = makeNormalAccumFn(posBuf, triIdsBuf, normalAccumBuf);
  const normalAccum = compute(normalAccumFn, buffers.numTriangles, [64]);

  const normalNormalizeFn = makeNormalNormalizeFn(normalBuf, normalAccumBuf);
  const normalNormalize = compute(normalNormalizeFn, N, [64]);

  // ─── Collision body management ──────────────────────────────────────
  const collisionBodies: TslCollisionBody[] = [];

  function setCollisionBody(body: TslCollisionBody, renderer?: unknown): void {
    const idx = collisionBodies.findIndex(b => b.id === body.id);
    if (idx >= 0) {
      // Release the previous body's per-body atomic scratch SBAs before swap.
      collisionBodies[idx].dispose(renderer);
      collisionBodies[idx] = body;
    } else {
      collisionBodies.push(body);
    }
  }

  function removeCollisionBody(id: string, renderer?: unknown): void {
    const idx = collisionBodies.findIndex(b => b.id === id);
    if (idx >= 0) {
      collisionBodies[idx].dispose(renderer);
      collisionBodies.splice(idx, 1);
    }
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

  // ─── Steam brush (per-particle velocity damping) ──────────────────
  const brushNodes = makeBrushComputeNode(posBuf, velBuf, invMassBuf, N);

  // ─── Mesh grab (GPU-only init + per-substep position lerp) ────────
  const grabMaskBuf = storage(buffers.grabMaskSBA, 'float', N);
  const grabOffsetBuf = storage(buffers.grabOffsetSBA, 'vec3', N);
  const grabNodes = makeGrabComputeNode(posBuf, invMassBuf, grabMaskBuf, grabOffsetBuf, N);
  grabNodes.grabNumSubsteps.value = config.substeps;

  /**
   * Update grab uniforms in one call (C4 follow-up #703). Encapsulates the
   * `.grabNodes.<field>.value` write shape so consumers don't depend on the
   * per-uniform layout. See interface JSDoc for the partial-update semantics.
   */
  function setGrabUniforms(
    point: [number, number, number],
    opts?: {
      radius?: number;
      strength?: number;
      active?: 0 | 1;
      initPending?: 0 | 1;
    },
  ): void {
    grabNodes.grabCenterX.value = point[0];
    grabNodes.grabCenterY.value = point[1];
    grabNodes.grabCenterZ.value = point[2];
    if (opts?.radius !== undefined) grabNodes.grabRadius.value = opts.radius;
    if (opts?.strength !== undefined) grabNodes.grabStrength.value = opts.strength;
    if (opts?.active !== undefined) grabNodes.grabActive.value = opts.active;
    if (opts?.initPending !== undefined) grabNodes.grabInitPending.value = opts.initPending;
  }

  // ─── Config updater ────────────────────────────────────────────────
  function updateConfig(partial: Partial<TslSolverConfig>): void {
    if (partial.dt !== undefined || partial.substeps !== undefined) {
      const dt = partial.dt ?? config.dt;
      const substeps = partial.substeps ?? config.substeps;
      config.dt = dt;
      config.substeps = substeps;
      uniforms.sdt.value = dt / substeps;
      grabNodes.grabNumSubsteps.value = substeps;
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
    // seamShrinkFactor / seamSewedThreshold: init-only a propósito — espejo
    // de WASM, donde set_seam_shrink_params se cablea en init (sin rama
    // runtime). No branches here.
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
    if (partial.maxStrain !== undefined) {
      config.maxStrain = partial.maxStrain;
      uniforms.maxStrain.value = partial.maxStrain;
    }
  }

  function dispose(renderer?: unknown): void {
    // Dispose each registered body's per-body atomic scratch SBAs (#771
    // follow-up), then drop tracked collision bodies so their compute nodes
    // (findBest/applyPush) become GC-eligible. The BVH SBAs that back these
    // bodies are owned by the caller (GpuSolverClient.setTslCollisionBody)
    // and disposed there per body id.
    for (const body of collisionBodies) {
      body.dispose(renderer);
    }
    collisionBodies.length = 0;
  }

  return {
    preSolve,
    stretchColors,
    strainLimitColors,
    bend,
    seamColors,
    groundClamp,
    snapshotPreCollision,
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
    brushNodes,
    grabNodes,
    setGrabUniforms,
    collisionBodies,
    setCollisionBody,
    removeCollisionBody,
    updateConfig,
    dispose,
  };
}

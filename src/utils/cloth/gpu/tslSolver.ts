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
 *   3. bend         — graph-colored distance constraint on opposite verts (per-color dispatch)
 *   4. seam         — graph-colored decaying-target constraints closing seam pairs
 *   5. groundClamp  — clamp positions to ground plane (AFTER constraints),
 *      then the stretch colors again ×REPASOS_DE_ESTIRAMIENTO (IA 1b-2)
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
  Loop,
  compute,
  uniform,
  float,
  uint,
  int,
  vec3,
  instanceIndex,
  atomicStore,
  atomicAdd,
  atomicMax,
  atomicLoad,
  cross,
  clamp,
  mix,
  floor,
  distance,
  atan,
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
   * Sewn-detection epsilon (m). Lower-bounds the effective rest-length floor
   * (a floor of 0 degrades to the legacy near-zero snap). Init-only,
   * same rationale as seamShrinkFactor.
   */
  seamSewedThreshold: number;
  /**
   * Terminal seam rest length (m) — borrow-plan A3. El decay clampa AQUÍ, no
   * en 0: snap-a-0 arrastraba el punto medio del seam de la sisa a través del
   * hombro convexo (mecanismo 2 del diagnóstico de parches de piel). Default
   * 0.002 (2mm) — canónico cross-tier con `DEFAULT_SEAM_CONFIG.restLengthFloor`
   * (CPU) y `XpbdSolver::seam_rest_length_floor` (Rust). Init-only.
   */
  seamRestLengthFloor?: number;
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
   * under-convergence). 0 disables. WASM y CPU llevan el mismo tope (backport
   * A7 STEP-4); lo que solo tiene el tier GPU son los repasos del estiramiento
   * antes de la colisión (`nodosDelSubpaso.ts`, IA 1b-2).
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
   * Body-tether compute node (frente#2). Max-distance cling kernel: projects
   * cloth vertices back onto their per-vertex radius sphere around the static
   * body target when the vertex drifts too far. Race-free (per-particle).
   * Dispatch AFTER strain-limit, BEFORE groundClamp.
   */
  tether: ComputeNode | null;
  /** Bend constraint compute nodes, one per color group (P4-1: race-free) */
  bendColors: ComputeNode[];
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
  /**
   * Normal-weld cross-seam (acta consejo costura-real 2026-07-05): re-escribe
   * la normal de cada vértice de costura como la normalización de la SUMA de
   * acumuladores (el suyo + sus parejas del otro lado) — la superficie se lee
   * CONTINUA a través de la unión y el slit de 2mm pasa de grieta de luz a
   * surco de costura natural. Dispatch: count de vértices soldados, DESPUÉS
   * de normalNormalize. Determinista y race-free: cada vértice escribe SOLO
   * su slot y lee el buffer de ACUMULACIÓN (estable en ese punto). `null`
   * sin costuras.
   */
  normalWeld: ComputeNode | null;
  /**
   * Face-poke Generate/Solve nodes (A4, GPU-only). Built + assigned by
   * `GpuSolverClient.setTslCollisionBody` when the avatar body is set (the
   * generate kernel needs that body's BVH). `null` until then. Dispatch
   * (`GarmentSimulation.tsx`): `generate` BEFORE the substep loop at
   * FACE_POKE_GENERATE_CADENCE; `solve` INSIDE the substep loop after the
   * body-collision pair (velocity-excluded via preCollisionPos, like the
   * body push). See `tslFacePoke.ts`.
   */
  facePokeNodes: { generate: ComputeNode; solve: ComputeNode } | null;
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
   * Fit-map overlay (#1010 slice 2): strain por vértice acumulado en GPU cada
   * frame (fixed-point i32, escala 1e6, atomicMax) y colorizado a
   * fitColorSBA (consumido por material.colorNode). zero/colorize dispatchean
   * numParticles; accum = UN kernel por stretch color group (reusa
   * idsSBA/restLengthsSBA del mismo grupo). uniforms: mode 0=none..4=pressure,
   * p0/p1 rango o thresholds, p2 escala precomputada (stress → E/1000,
   * fit → 1/maxStretch), p3 reservado.
   */
  fitMapNodes: {
    zero: ComputeNode;
    accum: ComputeNode[];
    colorize: ComputeNode;
    uniforms: {
      mode: FloatUniform;
      p0: FloatUniform;
      p1: FloatUniform;
      p2: FloatUniform;
      p3: FloatUniform;
    };
  };
  /** Storage node sobre fitColorSBA — consumido por material.colorNode */
  fitColorBufNode: TslNode;
  /** Passthrough de buffers.fitColorSBA (readback readFitColorsToCPU) */
  fitColorSBA: StorageBufferAttribute;
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
  /** Piso EFECTIVO del decay: max(seamRestLengthFloor, seamSewedThreshold). */
  seamRestLengthFloor: FloatUniform;
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
    // max host-side (A3): el threshold acota el piso por abajo para que un
    // floor test-only de 0 degrade al snap near-zero legacy, nunca a decay
    // infinito. Espejo de solveSeamConstraints (CPU) y solve_seams (Rust).
    seamRestLengthFloor: uniform(
      Math.max(config.seamRestLengthFloor ?? 0.002, config.seamSewedThreshold),
    ),
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
  // FUSION strainLimit->stretch (consejo 2026-07-02, Richter §7b / Halberg
  // precondición A4): con el uniform presente, el cap rígido one-sided
  // (#gummy STEP 4) corre DENTRO del mismo kernel tras el solve compliant —
  // mismos ids, mismo color group => misma race-safety; releer posBuf tras
  // el addAssign es coherente dentro de la invocación (orden de programa
  // WGSL). Elimina ~150 dispatches/frame (~1ms medido). Semántica que
  // CAMBIA: el cap ya no corre al FINAL del substep — el estiramiento que
  // bend/seams/self-collision introduzcan después se capea con 1 substep de
  // lag. Ese lag NO era de µm: con 15 substeps dejaba el 17,9 % de las
  // aristas de la camisa de María sobre el 8 %; por eso el subpaso repasa
  // el stretch antes de la colisión (`nodosDelSubpaso.ts`, IA 1b-2).
  maxStrainUniform?: FloatUniform,
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
      // P1-A (B5): ONE-SIDED — corrige solo en tensión (C>0); compresión
      // libre = la membrana puede juntarse y el dihedral gobierna el pandeo.
      // Esta factory es stretch-only (el bend usa makeDihedralConstraintFn);
      // seams (makeSeamConstraintFn) y strain-limit intactos.
      // Guard 0/0 (espejo de Rust `if w_sum == 0 { continue }` y del solver CPU):
      // pieza congelada (invMass=0 en ambos extremos) + compliance 0 (default
      // warp/weft) producía NaN permanente — postSolve no restaura pinned.
      If(C.greaterThan(float(0.0)).and(denom.greaterThan(float(0.0))), () => {
        // Correction scalar
        const s = C.negate().div(denom);

        // Normalized gradient
        const n = delta.div(len);

        // Push particle 0 along gradient (toward particle 1 when stretched)
        posBuf.element(id0).addAssign(n.mul(s).mul(w0).negate());

        // Push particle 1 in opposite direction
        posBuf.element(id1).addAssign(n.mul(s).mul(w1));
      });

      if (maxStrainUniform) {
        // Cap rígido one-sided fusionado (era makeStrainLimitFn): relee las
        // posiciones ya corregidas por ESTE hilo y clampea a rest*(1+max).
        const delta2 = posBuf.element(id1).sub(posBuf.element(id0));
        const len2 = delta2.dot(delta2).sqrt();
        const maxLen = restLenBuf.element(ci).mul(maxStrainUniform.add(float(1.0)));
        If(len2.greaterThan(maxLen).and(len2.greaterThan(float(1e-7))), () => {
          const wSum = w0.add(w1);
          If(wSum.greaterThan(float(0.0)), () => {
            const sCap = len2.sub(maxLen).negate().div(wSum); // rígido (alpha=0)
            const n2 = delta2.div(len2);
            posBuf.element(id0).addAssign(n2.mul(sCap).mul(w0).negate());
            posBuf.element(id1).addAssign(n2.mul(sCap).mul(w1));
          });
        });
      }
    });
  })();
}

/**
 * Kernel dihedral (P1, spec 2026-07-02-dihedral-bend-design.md §4).
 *
 * Transcripción línea-a-línea de `dihedral.ts:solveDihedralQuad` — ESA es la
 * verdad compartida (el CPU la llama directo, Rust la transcribe igual); si
 * esto diverge, la paridad cross-tier se rompe. Proyección XPBD angular
 * C = φ − φ* sobre el quad [a,b,c,d] (arista a-b, alas c,d): gradientes PBD
 * (n/|n|² baka 1/(2·área)), ángulo por atan(sin, cos) = atan2 (Tissu, estable
 * cerca de plano donde vive el drape). Corrección = +w·λ·d (el flip de signo
 * del acos de PBD queda absorbido por el φ SIGNED — verificado a mano +
 * pinneado por dihedral.test.ts en ambas direcciones de pliegue).
 *
 * Race-safety: dentro de un color ningún constraint comparte NINGUNO de sus
 * 4 vértices (coloring stride-4 en tslBuffers) → el addAssign no-atómico a
 * los 4 es race-free. Guards load-bearing (one-sided stretch hace slivers más
 * probables): |e|², |n|², denom.
 */
function makeDihedralConstraintFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  idsBuf: TslNode,
  restAngleBuf: TslNode,
  complianceBuf: TslNode,
  sdt: FloatUniform,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex; // constraint index

    const baseIdx = uint(ci).mul(uint(4));
    const ia = idsBuf.element(baseIdx);
    const ib = idsBuf.element(baseIdx.add(uint(1)));
    const ic = idsBuf.element(baseIdx.add(uint(2)));
    const id = idsBuf.element(baseIdx.add(uint(3)));

    const wa = invMassBuf.element(ia);
    const wb = invMassBuf.element(ib);
    const wc = invMassBuf.element(ic);
    const wd = invMassBuf.element(id);

    const pa = posBuf.element(ia).toVar();
    const pb = posBuf.element(ib).toVar();
    const pc = posBuf.element(ic).toVar();
    const pd = posBuf.element(id).toVar();

    const e = pb.sub(pa).toVar();
    const elenSq = e.dot(e);

    If(elenSq.greaterThan(float(1e-12)), () => {
      const elen = elenSq.sqrt().toVar();
      const invElen = float(1.0).div(elen).toVar();

      // n1 = (a−c)×(b−c), n2 = (b−d)×(a−d)
      const n1raw = cross(pa.sub(pc), pb.sub(pc)).toVar();
      const n2raw = cross(pb.sub(pd), pa.sub(pd)).toVar();
      const n1sq = n1raw.dot(n1raw).toVar();
      const n2sq = n2raw.dot(n2raw).toVar();

      If(n1sq.greaterThan(float(1e-12)).and(n2sq.greaterThan(float(1e-12))), () => {
        // Ángulo con normales unitarias
        const u1 = n1raw.div(n1sq.sqrt()).toVar();
        const u2 = n2raw.div(n2sq.sqrt()).toVar();
        const cosT = clamp(u1.dot(u2), float(-1.0), float(1.0));
        const sinT = cross(u1, u2).dot(e).mul(invElen);
        const phi = atan(sinT, cosT); // atan(y, x) = atan2 en TSL

        // Gradientes con n/|n|²
        const g1 = n1raw.div(n1sq).toVar();
        const g2 = n2raw.div(n2sq).toVar();

        const dC = g1.mul(elen).toVar();
        const dD = g2.mul(elen).toVar();
        const cbDotE = pc.sub(pb).dot(e).mul(invElen);
        const dbDotE = pd.sub(pb).dot(e).mul(invElen);
        const dA = g1.mul(cbDotE).add(g2.mul(dbDotE)).toVar();
        const acDotE = pa.sub(pc).dot(e).mul(invElen);
        const adDotE = pa.sub(pd).dot(e).mul(invElen);
        const dB = g1.mul(acDotE).add(g2.mul(adDotE)).toVar();

        const alpha = complianceBuf.element(ci).div(sdt.mul(sdt));
        const denom = wa.mul(dA.dot(dA))
          .add(wb.mul(dB.dot(dB)))
          .add(wc.mul(dC.dot(dC)))
          .add(wd.mul(dD.dot(dD)))
          .add(alpha);

        If(denom.greaterThan(float(1e-12)), () => {
          const lambda = phi.sub(restAngleBuf.element(ci)).div(denom);

          // Δpᵢ = +wᵢ·λ·dᵢ (convención signed — ver header)
          posBuf.element(ia).addAssign(dA.mul(lambda.mul(wa)));
          posBuf.element(ib).addAssign(dB.mul(lambda.mul(wb)));
          posBuf.element(ic).addAssign(dC.mul(lambda.mul(wc)));
          posBuf.element(id).addAssign(dD.mul(lambda.mul(wd)));
        });
      });
    });
  })();
}


// ─── Body-tether kernel ───────────────────────────────────────────────────────

/**
 * Body-tether kernel (frente#2). Max-distance cling: if a cloth vertex is farther
 * than its per-vertex radius from its static body target, project it back onto the
 * radius sphere. One-sided (target is fixed; only the vertex moves), respects invMass.
 * Race-free: each particle is independent (no shared particles).
 */
function makeTetherFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  targetBuf: TslNode,
  maxDistBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);
    If(w.greaterThan(float(0.0)), () => {
      const d = posBuf.element(i).sub(targetBuf.element(i));
      const dist = d.length();
      const maxD = maxDistBuf.element(i);
      If(dist.greaterThan(maxD), () => {
        // project onto the radius sphere around the target
        posBuf.element(i).assign(targetBuf.element(i).add(d.mul(maxD.div(dist.max(float(1e-7))))));
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
  floor: FloatUniform,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const ci = instanceIndex; // constraint index

    // ── Decay (shrink-before-solve, espejo lib.rs solve_seams) ──
    // A3: clamp al rest-length floor (spacing de grosor de tela), NO snap a 0
    // — el snap-a-0 arrastraba el punto medio del seam a través del cuerpo.
    const tgt = targetBuf.element(ci);
    If(tgt.greaterThan(floor), () => {
      const shrunk = tgt.mul(shrink);
      If(shrunk.lessThan(floor), () => {
        targetBuf.element(ci).assign(floor);
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
 * Fixed-point scale for fit-map strain accumulation (#1010).
 * Per-vertex strain ratio (len/restLen, 1.0 = no deformation) is multiplied
 * by this before conversion to int32; colorize divides back. Same 1e-6
 * precision rationale as NORMAL_SCALE.
 */
const FIT_SCALE = 1000000.0;

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

/**
 * Normal-weld cross-seam: normal[self] = normalize(accum[self] + Σ accum[partner]).
 *
 * Lee el buffer de ACUMULACIÓN (estable tras normalAccum — nadie lo escribe
 * durante este pase) y escribe SOLO el slot propio del normalBuf → cero
 * razas, determinista (P4). El invScale del fixed-point se cancela en la
 * normalización, así que se suma en crudo. Degenerado (suma ~0, normales
 * opuestas): conserva lo que normalNormalize dejó — no escribe.
 */
function makeNormalWeldFn(
  normalBuf: TslNode,
  normalAccumBuf: TslNode,
  vertsBuf: TslNode,
  offsetsBuf: TslNode,
  partnersBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const w = instanceIndex;
    const self = uint(vertsBuf.element(w)).toVar('selfV');
    const base = self.mul(uint(3));
    const sum = vec3(
      float(atomicLoad(normalAccumBuf.element(base))),
      float(atomicLoad(normalAccumBuf.element(base.add(uint(1))))),
      float(atomicLoad(normalAccumBuf.element(base.add(uint(2))))),
    ).toVar('sum');

    const pStart = int(offsetsBuf.element(w)).toVar('pStart');
    const pEnd = int(offsetsBuf.element(uint(w).add(uint(1)))).toVar('pEnd');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Loop({ start: pStart, end: pEnd, type: 'int', condition: '<' }, ({ i }: { i: any }) => {
      const p = uint(partnersBuf.element(uint(i)));
      const pb = p.mul(uint(3));
      sum.addAssign(vec3(
        float(atomicLoad(normalAccumBuf.element(pb))),
        float(atomicLoad(normalAccumBuf.element(pb.add(uint(1))))),
        float(atomicLoad(normalAccumBuf.element(pb.add(uint(2))))),
      ));
    });

    const len = sum.dot(sum).sqrt();
    If(len.greaterThan(float(1e-3)), () => {
      normalBuf.element(self).assign(sum.div(len));
    });
  })();
}

// ─── Fit-map kernels (#1010 slice 2 — overlay GPU-nativo 60 Hz) ─────────────

/**
 * Zero the fit strain accumulation buffer: seed each vertex with the
 * fixed-point encoding of ratio 1.0 (no deformation) so isolated vertices
 * (sin constraints incidentes) leen "rest" en colorize. atomicStore — el
 * buffer está declarado atómico (para el atomicMax del pase accum).
 */
function makeFitZeroFn(fitAccumBuf: TslNode) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    // toVar() fuerza i32 explícito en WGSL (AbstractInt — mismo rationale
    // que makeNormalZeroFn).
    atomicStore(fitAccumBuf.element(i), int(FIT_SCALE).toVar());
  })();
}

/**
 * Accumulate per-vertex strain via atomicMax sobre fixed-point i32.
 * UN compute node por stretch color group (dispatch = count del grupo). El
 * constraint e lee su par (a,b) de idsBuf y su rest length de restBuf, y
 * escribe el strain max (len/restLen) en ambos extremos — strain por
 * vértice conservador = max sobre aristas incidentes (espejo de
 * computePerVertexStrain en fitMaps.ts).
 */
function makeFitAccumFn(
  posBuf: TslNode,
  idsBuf: TslNode,
  restBuf: TslNode,
  fitAccumBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const e = instanceIndex;
    const base = uint(e).mul(uint(2));
    const a = idsBuf.element(base);
    const b = idsBuf.element(base.add(uint(1)));
    const rest = restBuf.element(e);
    // restLen 0 → constraint degenerado: saltar (espejo del
    // `if (restLen === 0) continue` de fitMaps.ts).
    If(rest.greaterThan(float(0.0)), () => {
      const len = distance(posBuf.element(a), posBuf.element(b));
      // Clamp anti-overflow: ratio×FIT_SCALE debe caber en i32 (2^31 ≈
      // 2147×1e6). Edges degenerados (restLen≈0 en mallas DXF reales) daban
      // ratios de 10^4+ que desbordaban y ensuciaban el atomicMax. 2000 está
      // MUY por encima de cualquier strain físico; el colorize clampa t a 1
      // mucho antes, así que el color no cambia.
      const ratio = clamp(len.div(rest), float(0.0), float(2000.0));
      const v = int(ratio.mul(float(FIT_SCALE)));
      atomicMax(fitAccumBuf.element(a), v);
      atomicMax(fitAccumBuf.element(b), v);
    });
  })();
}

/**
 * 8-stop CLO3D blue→red gradient — espejo de STRESS_STRAIN_COLORS +
 * sampleColorScale de fitMaps.ts: t∈[0,1] → idx = t·7, segmento floor(idx),
 * lerp entre stops adyacentes (hi clamps a 7). Compartido por stress
 * (t = stress normalizado) y strain (t = ratio normalizado).
 */
function assignStressStrainColor(target: TslNode, t: TslNode): void {
  // Composición inline dentro del kernel llamante — NO un Fn anidado: el
  // callback de Fn recibe sus args como ARRAY, y pasarle nodos directos
  // rompía en runtime con "this.aNode.getNodeType is not a function".
  const stops = [
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.4, 1.0),
    vec3(0.0, 0.8, 0.8),
    vec3(0.0, 1.0, 0.4),
    vec3(0.4, 1.0, 0.0),
    vec3(1.0, 1.0, 0.0),
    vec3(1.0, 0.5, 0.0),
    vec3(1.0, 0.0, 0.0),
  ];
  const tc = clamp(t, float(0.0), float(1.0));
  const idx = tc.mul(float(7.0));
  const lo = floor(idx);
  const frac = idx.sub(lo);
  let chain = If(lo.equal(float(0.0)), () => { target.assign(mix(stops[0], stops[1], frac)); });
  for (let s = 1; s < 7; s++) {
    chain = chain.ElseIf(lo.equal(float(s)), () => { target.assign(mix(stops[s], stops[s + 1], frac)); });
  }
  chain.Else(() => { target.assign(stops[7]); });
}

/**
 * Colorize fitColorSBA per-vertex — replica los ramps CPU de fitMaps.ts
 * (paridad validada por e2e @gpu-local; aquí se pinnea el plumbing).
 * uniforms.mode: 0=none (base blanca — el kernel no se despacha en none),
 * 1=stress, 2=strain, 3=fit, 4=pressure. p0/p1/p2 los precomputa
 * GpuSolverClient.setFitMapParams (ver fitMaps.ts para el detalle CPU).
 */
function makeFitColorizeFn(
  fitAccumBuf: TslNode,
  fitColorBuf: TslNode,
  uniforms: { mode: TslNode; p0: TslNode; p1: TslNode; p2: TslNode; p3: TslNode },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const ratio = float(atomicLoad(fitAccumBuf.element(i))).div(float(FIT_SCALE));
    const { mode, p0, p1, p2 } = uniforms;
    If(mode.equal(float(0.0)), () => {
      // none — base blanca (defensivo; no se despacha en modo none).
      fitColorBuf.element(i).assign(vec3(1.0, 1.0, 1.0));
    }).ElseIf(mode.equal(float(1.0)), () => {
      // stress: stress = elongación × p2 (p2 = E/1000, kPa por unidad de
      // elongación — formula de computeStressMap); t = (stress-p0)/(p1-p0);
      // gradiente CLO3D idéntico al CPU.
      const stress: TslNode = ratio.sub(float(1.0)).max(float(0.0)).mul(p2);
      const t: TslNode = clamp(stress.sub(p0).div(p1.sub(p0)), float(0.0), float(1.0));
      assignStressStrainColor(fitColorBuf.element(i), t);
    }).ElseIf(mode.equal(float(2.0)), () => {
      // strain: ratio YA es el strain (1.0 = sin deformar); t =
      // (ratio-p0)/(p1-p0); gradiente CLO3D (el CPU usa pct = ratio·100).
      const t: TslNode = clamp(ratio.sub(p0).div(p1.sub(p0)), float(0.0), float(1.0));
      assignStressStrainColor(fitColorBuf.element(i), t);
    }).ElseIf(mode.equal(float(3.0)), () => {
      // fit con avatarPositions null → contactMask todo 1 (espejo de
      // computeFitMap): fitRatio = max(0, ratio-1) × p2 (p2 = 1/maxStretch).
      // Zonas: >p1 rojo; >p0 amarillo→rojo lerp; ≤p0 blanco→amarillo lerp.
      const fitRatio: TslNode = ratio.sub(float(1.0)).max(float(0.0)).mul(p2);
      If(fitRatio.greaterThan(p1), () => {
        fitColorBuf.element(i).assign(vec3(1.0, 0.0, 0.0));
      }).ElseIf(fitRatio.greaterThan(p0), () => {
        const t: TslNode = clamp(fitRatio.sub(p0).div(p1.sub(p0)), float(0.0), float(1.0));
        fitColorBuf.element(i).assign(mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t));
      }).Else(() => {
        const t: TslNode = clamp(fitRatio.div(p0), float(0.0), float(1.0));
        fitColorBuf.element(i).assign(mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 1.0, 0.0), t));
      });
    }).ElseIf(mode.equal(float(4.0)), () => {
      // pressure con avatar null → todo no-contact (espejo de
      // computePressurePoints): NO_PRESSURE_COLOR [0.3, 0.3, 0.3].
      fitColorBuf.element(i).assign(vec3(0.3, 0.3, 0.3));
    }).Else(() => {
      fitColorBuf.element(i).assign(vec3(1.0, 1.0, 1.0));
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
 * Execution order per substep (la lista vive en `nodosDelSubpaso.ts`):
 *   preSolve → stretch(per-color) → bend(per-color) → seam(per-color) → groundClamp →
 *   stretch ×REPASOS_DE_ESTIRAMIENTO → [grab] → snapshotPreCollision →
 *   collision bodies → postSolve
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
      uniforms.maxStrain, // cap fusionado (ver factory) — era un pase aparte
    );
    return compute(fn, color.count, [64]);
  });

  // ─── Body-tether (frente#2) — max-distance cling, per-particle ───────
  const tetherTargetBuf = storage(buffers.tetherTargetSBA, 'vec3', N);
  const tetherMaxDistBuf = storage(buffers.tetherMaxDistSBA, 'float', N);
  const tether = compute(
    makeTetherFn(posBuf, invMassBuf, tetherTargetBuf, tetherMaxDistBuf),
    N,
    [64],
  );

  // ─── Bend constraints (per-color, race-free — P4-1 + P1 dihedral) ──
  // Kernel DIHEDRAL sobre el quad [a,b,c,d] completo (P1, spec 2026-07-02):
  // reemplaza el surrogate de distancia (c,d) que confundía bend con stretch
  // y des-plegaba cada substep. Un dispatch por color; el coloring stride-4
  // (tslBuffers) garantiza que ningún constraint del color comparte vértices
  // → addAssign a los 4 race-free. 5 storage buffers ≤ 8 ✓.
  const bendColors = buffers.bendColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 4);
    const restBuf = storage(color.restAnglesSBA, 'float', color.count);
    const compBuf = storage(color.complianceSBA, 'float', color.count);

    const fn = makeDihedralConstraintFn(
      posBuf, invMassBuf, idsBuf, restBuf, compBuf,
      uniforms.sdt,
    );
    return compute(fn, color.count, [64]);
  });

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
      uniforms.seamRestLengthFloor,
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

  // ─── Normal-weld cross-seam (acta costura-real 2026-07-05) ────────
  let normalWeld: ComputeNode | null = null;
  if (buffers.weldBuffers && buffers.weldBuffers.count > 0) {
    const wb = buffers.weldBuffers;
    const weldVertsBuf = storage(wb.vertsSBA, 'uint', wb.count);
    const weldOffsetsBuf = storage(wb.offsetsSBA, 'uint', wb.count + 1);
    const weldPartnersBuf = storage(wb.partnersSBA, 'uint', wb.partnersSBA.count);
    normalWeld = compute(
      makeNormalWeldFn(normalBuf, normalAccumBuf, weldVertsBuf, weldOffsetsBuf, weldPartnersBuf),
      wb.count,
      [64],
    );
  }

  // ─── Fit-map overlay (#1010 slice 2 — GPU-native fit maps) ─────────
  // Strain por vértice en fixed-point i32 (FIT_SCALE 1e6) acumulado con
  // atomicMax; colorize escribe RGB a fitColorSBA, que el material consume
  // vía fitColorBufNode (material.colorNode — wiring en GarmentSimulation).
  const fitAccumBuf = makeAtomicStorage(buffers.fitStrainAccumSBA, 'int', N);
  const fitColorBuf = storage(buffers.fitColorSBA, 'vec3', N);
  const fitUniforms = {
    mode: uniform(0), // 0=none (el kernel no se despacha en none)
    p0: uniform(0),
    p1: uniform(0),
    p2: uniform(0),
    p3: uniform(0),
  };
  const fitZero = compute(makeFitZeroFn(fitAccumBuf), N, [64]);
  // UN kernel de acumulación por stretch color group — re-wrap de los MISMOS
  // idsSBA/restLengthsSBA que el solver de distancia (mismo SBA, nodo
  // independiente).
  const fitAccum = buffers.stretchColors.map((color) => {
    const idsBuf = storage(color.idsSBA, 'uint', color.count * 2);
    const restBuf = storage(color.restLengthsSBA, 'float', color.count);
    return compute(makeFitAccumFn(posBuf, idsBuf, restBuf, fitAccumBuf), color.count, [64]);
  });
  const fitColorize = compute(
    makeFitColorizeFn(fitAccumBuf, fitColorBuf, fitUniforms),
    N,
    [64],
  );
  const fitMapNodes = {
    zero: fitZero,
    accum: fitAccum,
    colorize: fitColorize,
    uniforms: fitUniforms,
  };

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
    bendColors,
    tether,
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
    normalWeld,
    // Assigned by GpuSolverClient.setTslCollisionBody once the avatar body
    // (with its BVH) exists — the correction kernel needs it. Null until then.
    facePokeNodes: null,
    numParticles: N,
    numTriangles: buffers.numTriangles,
    triangles: buffers.triangles,
    selfCollisionNodes,
    windNodes,
    brushNodes,
    grabNodes,
    // #1010 fit-map overlay (zero/accum per color group/colorize + uniforms)
    fitMapNodes,
    fitColorBufNode: fitColorBuf,
    fitColorSBA: buffers.fitColorSBA,
    setGrabUniforms,
    collisionBodies,
    setCollisionBody,
    removeCollisionBody,
    updateConfig,
    dispose,
  };
}

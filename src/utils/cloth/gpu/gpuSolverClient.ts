/**
 * GPU Solver Client — bridges GpuClothSolver with React components.
 *
 * Manages the solver lifecycle, handles init/start/stop/dispose,
 * and provides per-frame position updates via callback.
 *
 * Drop-in replacement for ClothWorkerClient when WebGPU is available.
 *
 * @module gpuSolverClient
 */

import { GpuClothSolver, type GpuSolverConfig } from './gpuSolver';
import { extractStretchConstraints, extractBendConstraints, buildCrossSeamBendQuads, colorConstraints, type SeamConstraintData } from './gpuBuffers';
import { createPositionStorageAttribute, createNormalStorageAttribute } from './gpuStorageAttributes';
import {
  createTslBuffers,
  createSBA,
  destroyTslBufferSet,
  disposeStorageBufferAttribute,
  type TslBufferSet,
  type TslSeamConstraintData,
  type FabricComplianceConfig,
} from './tslBuffers';
import { createTslSolver, type TslSolver, type TslSolverConfig } from './tslSolver';
import { makeFacePokeGenerateNode, makeFacePokeSolveNode, packFacePokeBodyGeom } from './tslFacePoke';
import { createSelfCollisionBuffers } from './tslSelfCollision';
import { buildAdjacency, nextPrime } from '../selfCollision';
import { buildAdjacencyCSR } from '../wasm/adjacencyCSR';
import { buildLinearBVH } from './bvh';
import { createTslCollisionBody } from './tslCollision';
import { type SolverCapabilities, GPU_CAPABILITIES } from '../solverCapabilities';
import { DEFAULT_SEAM_CONFIG } from '../seamAssembly';
import { dihedralAngle } from '../dihedral';
import { fabricInvMassScale } from '../physicalFabric';
import type { FitMapMode, FitMapConfig, FabricFitParams } from '../fitMaps';
import type { ClothSolverClient } from '../solverProtocol';
import type { LocalVertexIndex, SeamPair } from '../seamPairs';
import type { StorageBufferAttribute } from 'three/webgpu';
import * as THREE from 'three';
import { EdgeType } from './gpuBuffers';
import { withErrorScope, attachUncapturedErrorListener, instrumentShaderCapture } from './webgpuDebug';
import { buildTetherRadii } from './tetherRadii';

// ─── CPU helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the closest point on a triangle to point (px,py,pz).
 * The triangle is given as 9 consecutive floats in `triVerts` starting at
 * `vOff` (A=vOff..+2, B=vOff+3..+5, C=vOff+6..+8).
 * The triangle normal (unit) is in `triNormals` at `nOff` (3 floats).
 *
 * Algorithm: project onto the triangle's plane, test if inside via barycentric
 * coordinates, otherwise clamp to the nearest edge. Mirrors the math in
 * triangleCollision.ts `pointToTriangleDist` but returns XYZ rather than dist.
 */
function closestPointOnTriangle(
  px: number, py: number, pz: number,
  triVerts: Float32Array, vOff: number,
  triNormals: Float32Array, nOff: number,
): [number, number, number] {
  const ax = triVerts[vOff],     ay = triVerts[vOff + 1], az = triVerts[vOff + 2];
  const bx = triVerts[vOff + 3], by = triVerts[vOff + 4], bz = triVerts[vOff + 5];
  const cx = triVerts[vOff + 6], cy = triVerts[vOff + 7], cz = triVerts[vOff + 8];

  const nnx = triNormals[nOff], nny = triNormals[nOff + 1], nnz = triNormals[nOff + 2];

  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;

  // Signed distance to the plane
  const dot = apx * nnx + apy * nny + apz * nnz;

  // Projection onto the plane
  const projx = px - dot * nnx;
  const projy = py - dot * nny;
  const projz = pz - dot * nnz;

  // Barycentric coords of the projection
  const v0x = projx - ax, v0y = projy - ay, v0z = projz - az;
  const d00 = abx * abx + aby * aby + abz * abz;
  const d01 = abx * acx + aby * acy + abz * acz;
  const d02 = abx * v0x + aby * v0y + abz * v0z;
  const d11 = acx * acx + acy * acy + acz * acz;
  const d12 = acx * v0x + acy * v0y + acz * v0z;
  const denom = d00 * d11 - d01 * d01;

  if (Math.abs(denom) > 1e-12) {
    const invD = 1.0 / denom;
    const u = (d11 * d02 - d01 * d12) * invD;
    const v = (d00 * d12 - d01 * d02) * invD;

    if (u >= 0 && v >= 0 && u + v <= 1) {
      // Projection is inside the triangle — closest point is the projection.
      return [projx, projy, projz];
    }
  }

  // Outside: find nearest edge point (3-edge clamp, same as triangleCollision.ts lines 58–92).
  let minDsq = Infinity;
  let cpx = ax, cpy = ay, cpz = az;

  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
    const ex = ax + t * abx, ey = ay + t * aby, ez = az + t * abz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  const acLenSq = acx * acx + acy * acy + acz * acz;
  if (acLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * acx + apy * acy + apz * acz) / acLenSq));
    const ex = ax + t * acx, ey = ay + t * acy, ez = az + t * acz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const bcLenSq = bcx * bcx + bcy * bcy + bcz * bcz;
  if (bcLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (bpx * bcx + bpy * bcy + bpz * bcz) / bcLenSq));
    const ex = bx + t * bcx, ey = by + t * bcy, ez = bz + t * bcz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  return [cpx, cpy, cpz];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Calibración M4-D del avatar (espejo wasmSolverWorker.ts setCollisionMesh):
 *  0.4 ≈ algodón sobre piel; 8mm anti z-fight (#897 F2 — GPU no la había recibido). */
const AVATAR_FRICTION = 0.4;
const AVATAR_MARGIN = 0.008;

/** Default de FabricFitParams para el tier GPU (#1010) — espejo del fallback
 *  de GarmentSimulation cuando la tela activa no está en la librería. */
const DEFAULT_FIT_FABRIC: FabricFitParams = {
  maxStretchRatio: 0.08,
  weight: 150,
  thickness: 0.4,
  avgStretch: 0.025,
};

/**
 * Escala de stress del fit map (#1010) — replica la fórmula de
 * computeStressMap (fitMaps.ts): E ≈ (weight·50)/maxStretch Pa (crossSection
 * = thickness(m)·0.05), stressKPa = (E·elongación)/1000. Devuelve E/1000:
 * kPa por unidad de elongación, el p2 del kernel colorize.
 */
function fitStressScaleKPa(fabric?: FabricFitParams): number {
  const f = fabric ?? DEFAULT_FIT_FABRIC;
  const thicknessM = f.thickness / 1000; // mmToM
  const crossSection = thicknessM * 0.05;
  const maxStretch = Math.max(f.maxStretchRatio, 0.01);
  const E = crossSection > 0 ? (f.weight * 50) / maxStretch : 10000;
  return E / 1000;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PieceMeshData {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  uvs?: Float32Array;
  /** BodyRegion string (e.g. 'front-torso', 'left-sleeve'). Used to seed
   *  per-region tether radii (frente#2). Optional — falls back to default
   *  0.06 m when absent. */
  region?: string;
}

export interface GpuSolverClientCallbacks {
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class GpuSolverClient implements ClothSolverClient {
  private device: GPUDevice;
  private solver: GpuClothSolver;
  private running: boolean = false;
  private animFrameId: number | null = null;

  /** Called each frame with updated positions */
  onFrame: ((positions: Float32Array) => void) | null = null;

  /** Whether to skip CPU readback (zero-copy mode).
   *  Disabled by default: StorageBufferAttribute patching doesn't work
   *  with Three.js WebGPURenderer's internal attribute management.
   *  The renderer creates its own GPU buffers and ignores the patched
   *  gpuBuffer field, so positions never update on screen. */
  private zeroCopy: boolean = false;

  /** Guard against concurrent readback requests (mapAsync throws if pending). */
  private readbackPending: boolean = false;

  /** Face-poke: interleaved body geom (triVerts+vertexPseudo, 18 floats/tri) — a packed
   *  duplicate of the body geometry so the correct kernel binds ≤8 storage buffers. */
  private facePokeBodyGeomSBA: StorageBufferAttribute | null = null;

  /** Margin the face-poke correct kernel was built with (retained for the debug probe). */

  /** Prevents operations after dispose (readback promises may still resolve). */
  private disposed: boolean = false;

  /** Count frames for NaN diagnostic sampling. */
  private frameCount: number = 0;

  /** Cached StorageBufferAttributes for rendering. */
  private positionAttr: StorageBufferAttribute | null = null;
  private normalAttr: StorageBufferAttribute | null = null;

  /** TSL solver (when using renderer.compute() path) */
  private tslSolver: TslSolver | null = null;
  private tslBuffers: TslBufferSet | null = null;
  private pieceVertexRanges: Map<string, { start: number; count: number }> | null = null;
  private originalInvMass: Float32Array | null = null;

  /** Edge data retenida en init (#1010): ids globales [a,b,...] (Int32Array,
   *  contrato SolverEdgeData/fitMaps.ts) + restLengths. La entrega
   *  requestEdgeData(); dispose la limpia para que nunca dispare después. */
  private edgeData: { ids: Int32Array; lengths: Float32Array } | null = null;

  /**
   * F1 planchado (acta costura-proceso-real 2026-07-05): metadata de los
   * quads cross-seam que SOBREVIVIERON la barrera Halberg, stasheada en
   * init para el press en settle. Llave = `${a},${b},${c},${d}` de los ids
   * del quad (el layout GPU se recolorea y parte en SBAs por-color — no hay
   * región contigua cross que escribir por offset; el press escanea los
   * grupos y matchea por llave). Valor = partners de costura [b0,b1] del
   * hinge, para el gate sewn. Null = sin quads cross (barrera / kill-switch
   * / sin costuras).
   */
  private crossQuadPartners: Map<string, [number, number]> | null = null;
  /** Compliance angular objetivo del press (la del fabric — el planchado
   *  fija el ángulo CON rigidez real; 1e5 era la bisagra floja pre-F1). */
  private pressedBendCompliance = 1e4;

  /**
   * Cached WebGPURenderer reference, captured the first time a render-coupled
   * method (`readbackPositionsToGeometry`) sees one. Required by the disposal
   * path in `dispose()` / `initMultiPieceTsl` / `setTslCollisionBody`: Three.js
   * 0.183 `StorageBufferAttribute` has no public `dispose()` so the
   * canonical GPU-buffer release route is `renderer._attributes.delete(attr)`.
   * Null until first use; disposal degrades to ref-drop without it.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rendererRef: any = null;

  /**
   * Body triangle data retained from the last `setTslCollisionBody('__avatar__', …)` call.
   * Stored so `captureTetherTargets()` can re-query the body after init and on
   * every pose-update rebuild.  Null until the avatar body is first set.
   */
  private tetherBodyTris: {
    vertices: Float32Array;
    normals: Float32Array;
    triCount: number;
  } | null = null;

  /**
   * Tracks BVH SBAs per collision body id so `setTslCollisionBody` can free
   * the previous allocation when called again for the same id (avatar pose
   * updates re-allocate 4 SBAs each call, see #753; the 4th — escape
   * pointers for the threaded traversal — joined in #897 F4.3b).
   */
  private collisionBodySBAs: Map<
    string,
    {
      bvhNodesSBA: StorageBufferAttribute;
      bvhSkipSBA: StorageBufferAttribute;
      triVertsSBA: StorageBufferAttribute;
      triNormalsSBA: StorageBufferAttribute;
      edgePseudoSBA: StorageBufferAttribute;
      vertexPseudoSBA: StorageBufferAttribute;
    }
  > = new Map();

  constructor(device: GPUDevice, config?: Partial<GpuSolverConfig>) {
    this.device = device;
    // Install debug instrumentation BEFORE solver/pipeline construction so every
    // shader module created during init is captured into window.__VINA_SHADERS__
    // and `[WebGPU shader] compile error` diagnostics are surfaced.
    //
    // instrumentShaderCapture is dev-only (no-op in production).
    // attachUncapturedErrorListener stays active in prod — an idle listener is
    // zero-cost and surfaces validation failures that would otherwise be silently
    // swallowed. Both helpers are idempotent.
    instrumentShaderCapture(device);
    attachUncapturedErrorListener(device);
    this.solver = new GpuClothSolver(device, config);
  }

  /**
   * Solver capability surface — declares which physics features and
   * execution modes this tier supports. Per A6 § 3.4 Option A
   * (capability extension to GPU + Neural).
   *
   * `bodyCollision` (#897 F2), `seams` + `selfCollision` (#897 F4) are
   * `true` — parity status and ratified divergences live in the
   * `GPU_CAPABILITIES` JSDoc. `frameDriven: true` signals consumers to
   * dispatch frames via `useFrame` rather than calling `start()`.
   */
  get capabilities(): SolverCapabilities {
    return GPU_CAPABILITIES;
  }

  /**
   * Initialize with multiple pieces (merged into one solver).
   */
  async initMultiPiece(
    pieces: PieceMeshData[],
    seamPairs?: Array<{ pieceAId: string; pieceBId: string; vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]> }>,
  ): Promise<void> {
    // Merge all pieces into a single mesh
    let totalVerts = 0;
    let totalTris = 0;
    const vertexOffsets = new Map<string, number>();

    for (const p of pieces) {
      vertexOffsets.set(p.pieceId, totalVerts);
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
    }

    const positions = new Float32Array(totalVerts * 3);
    const invMass = new Float32Array(totalVerts);
    const triangles = new Uint32Array(totalTris);

    let vOff = 0;
    let tOff = 0;

    for (const p of pieces) {
      const numV = p.vertices.length / 3;

      // Copy positions efficiently
      positions.set(p.vertices, vOff * 3);

      // All particles have equal mass (invMass = 1.0)
      for (let i = 0; i < numV; i++) {
        invMass[vOff + i] = 1.0;
      }

      // Copy triangles with offset
      for (let i = 0; i < p.triIds.length; i++) {
        triangles[tOff + i] = p.triIds[i] + vOff;
      }

      vOff += numV;
      tOff += p.triIds.length;
    }

    // Validate input data for NaN before sending to GPU
    let inputNaN = 0;
    for (let i = 0; i < positions.length; i++) {
      if (!isFinite(positions[i])) inputNaN++;
    }
    if (inputNaN > 0) {
      console.error(`[GpuSolverClient] ❌ Input mesh has ${inputNaN} NaN/Infinity values in positions!`);
    }

    // Extract constraints from merged mesh
    const stretch = extractStretchConstraints(positions, triangles);
    const bend = extractBendConstraints(positions, triangles);

    // Validate constraint rest lengths
    let zeroRestLen = 0;
    for (let i = 0; i < stretch.restLengths.length; i++) {
      if (stretch.restLengths[i] <= 0 || !isFinite(stretch.restLengths[i])) zeroRestLen++;
    }
    if (zeroRestLen > 0) {
      console.warn(`[GpuSolverClient] ⚠️ ${zeroRestLen}/${stretch.restLengths.length} stretch constraints have invalid rest lengths`);
    }

    // Build seam constraints
    let seam: SeamConstraintData | null = null;
    if (seamPairs && seamPairs.length > 0) {
      const seamIds: number[] = [];
      const seamDist: number[] = [];
      for (const sp of seamPairs) {
        const offA = vertexOffsets.get(sp.pieceAId);
        const offB = vertexOffsets.get(sp.pieceBId);
        if (offA === undefined || offB === undefined) {
          console.warn(
            `[GpuSolverClient.initMultiPiece] seam pair refs unknown piece ` +
            `(A=${sp.pieceAId}${offA === undefined ? ' [missing]' : ''}, ` +
            `B=${sp.pieceBId}${offB === undefined ? ' [missing]' : ''}); skipping`
          );
          continue;
        }
        for (const [a, b] of sp.vertexPairs) {
          seamIds.push(a + offA, b + offB);
          seamDist.push(0); // target: pull together
        }
      }
      if (seamIds.length > 0) {
        seam = {
          ids: new Uint32Array(seamIds),
          targetDist: new Float32Array(seamDist),
        };
      }
    }

    await withErrorScope(this.device, 'GpuSolverClient.initMultiPiece', async () => {
      await this.solver.init(
        { positions, triangles, invMass },
        stretch,
        bend,
        seam,
        triangles,
      );

      // Validate GPU-side positions after init (verifies buffer upload)
      try {
        const initPositions = await this.solver.readPositions();
        if (initPositions) {
          let nanCount = 0;
          for (let i = 0; i < Math.min(initPositions.length, 300); i++) {
            if (!isFinite(initPositions[i])) nanCount++;
          }
          if (nanCount > 0) {
            console.error(`[GpuSolverClient] ❌ GPU positions contain ${nanCount} NaN after init (sampled first 100 particles)`);
          } else {
            console.log(`[GpuSolverClient] ✅ GPU positions validated after init: ${totalVerts} particles, first 100 all finite`);
          }
        }
      } catch (e) {
        console.warn('[GpuSolverClient] Init validation readback failed:', e);
      }
    });
  }

  /**
   * Initialize with TSL solver (for zero-copy rendering via positionNode).
   * Call this instead of initMultiPiece() when using MeshStandardNodeMaterial.
   *
   * @param fabricCompliance — per-edge-type compliance from toXPBDParams().
   *   When provided, each stretch/bend constraint gets its own compliance
   *   value based on UV-classified edge direction (warp/weft/shear).
   */
  async initMultiPieceTsl(
    pieces: PieceMeshData[],
    seamPairs?: SeamPair[],
    solverConfig?: Partial<TslSolverConfig>,
    fabricCompliance?: FabricComplianceConfig,
  ): Promise<void> {
    // Merge pieces (same logic as initMultiPiece)
    let totalVerts = 0;
    let totalTris = 0;
    const vertexOffsets = new Map<string, number>();

    for (const p of pieces) {
      vertexOffsets.set(p.pieceId, totalVerts);
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
    }

    // Store piece vertex ranges for freeze/unfreeze support
    this.pieceVertexRanges = new Map();
    for (const p of pieces) {
      const start = vertexOffsets.get(p.pieceId);
      if (start === undefined) {
        // Unreachable by construction (the offsets map is built from this
        // same `pieces` array above) — fail loudly instead of silently
        // mapping the piece onto offset 0, which would corrupt
        // freeze/unfreeze ranges and any seam packing keyed off them
        // (parity plan Fase 4: no silent vertex-offset defaults). The init
        // throw is caught by the tier cascade, which falls through to WASM.
        throw new Error(`[GpuSolverClient] missing vertex offset for piece ${p.pieceId}`);
      }
      const count = p.vertices.length / 3;
      this.pieceVertexRanges.set(p.pieceId, { start, count });
    }

    const positions = new Float32Array(totalVerts * 3);
    const invMass = new Float32Array(totalVerts);
    const triangles = new Uint32Array(totalTris);
    // P7-density: masa relativa a la referencia (150 GSM) — a la densidad de
    // referencia esto es 1.0 exacto (comportamiento pre-P7). Espejo del
    // worker WASM y del scale del CPU initPhysics.
    const invMassFill = fabricInvMassScale(fabricCompliance?.density);
    // Merge UVs for anisotropic edge classification
    let mergedUvs: Float32Array | undefined;
    let hasUvs = false;

    let vOff = 0;
    let tOff = 0;

    for (const p of pieces) {
      const numV = p.vertices.length / 3;
      positions.set(p.vertices, vOff * 3);
      for (let i = 0; i < numV; i++) invMass[vOff + i] = invMassFill;
      for (let i = 0; i < p.triIds.length; i++) triangles[tOff + i] = p.triIds[i] + vOff;

      // Merge UVs
      if (p.uvs && p.uvs.length >= numV * 2) {
        if (!mergedUvs) {
          mergedUvs = new Float32Array(totalVerts * 2);
        }
        mergedUvs.set(p.uvs.subarray(0, numV * 2), vOff * 2);
        hasUvs = true;
      }

      vOff += numV;
      tOff += p.triIds.length;
    }

    // NOTA: el snapshot originalInvMass se toma DESPUÉS de aplicar la masa
    // de banda F3 (más abajo) — freeze/unfreeze debe restaurar la nervadura,
    // no la masa uniforme (corrección mnCheck; el comentario viejo de "after
    // pins" pedía exactamente esto).

    // F3 nervadura: adyacencia de malla hoisted — la consumen la banda de
    // margen (BFS) y el CSR de self-collision (antes se construía allá abajo;
    // una sola construcción, corrección mnCheck).
    const adjSets = buildAdjacency(new Int32Array(triangles), totalVerts); // firma pide Int32Array (S8)

    // Extract constraints with UV-based edge classification
    const uvArg = hasUvs ? mergedUvs : undefined;
    const stretch = extractStretchConstraints(positions, triangles, uvArg);
    // Bridge edge data (#1010): retener copia (ids Uint32→Int32, contrato
    // SolverEdgeData/fitMaps.ts) para requestEdgeData() — el tier GPU publica
    // el MISMO contrato que WasmSolverClient/ClothWorkerClient.
    this.edgeData = { ids: new Int32Array(stretch.ids), lengths: stretch.restLengths };
    const bend = extractBendConstraints(positions, triangles, uvArg);

    // Compute per-constraint compliance from edge types + fabric config
    const fabric: FabricComplianceConfig = fabricCompliance ?? {
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.0,
      shearCompliance: 0.001,
      // P1 dihedral: default ANGULAR 1e4 — banda [6e2,1e5] calibrada contra
      // el gate Cusick 2026-07-02 (la teórica [6e-2,10] era bend rígido).
      // PARITY: WASM (lib.rs) + CPU (xpbdSolver) llevan el MISMO default.
      bendComplianceWarp: 1e4,
      bendComplianceWeft: 1e4,
    };

    const numStretch = stretch.ids.length / 2;
    const stretchCompliance = new Float32Array(numStretch);
    for (let i = 0; i < numStretch; i++) {
      const et = stretch.edgeTypes[i];
      if (et === EdgeType.WARP) stretchCompliance[i] = fabric.stretchComplianceWarp;
      else if (et === EdgeType.WEFT) stretchCompliance[i] = fabric.stretchComplianceWeft;
      else stretchCompliance[i] = fabric.shearCompliance;
    }

    const colored = colorConstraints(stretch.ids, stretch.restLengths, numStretch, stretchCompliance);

    // Seam packing (#897 F1) — espejo del seeding CPU/WASM: target inicial =
    // distancia mundial actual × tension/100 (decae en GPU), compliance
    // per-constraint, coloreado para dispatch paralelo race-free.
    let seam: TslSeamConstraintData | null = null;
    // Pares globales POR COSTURA en orden t — alimentan los quads dihedral
    // cross-seam (acta consejo costura-real 2026-07-05).
    const seamGlobalPairs: number[][] = [];
    if (seamPairs && seamPairs.length > 0) {
      const seamIds: number[] = [];
      const seamDist: number[] = [];
      const seamCompliance: number[] = [];
      for (const sp of seamPairs) {
        const offA = vertexOffsets.get(sp.pieceAId);
        const offB = vertexOffsets.get(sp.pieceBId);
        if (offA === undefined || offB === undefined) {
          console.warn(
            `[GpuSolverClient.initMultiPieceTsl] seam pair refs unknown piece ` +
            `(A=${sp.pieceAId}${offA === undefined ? ' [missing]' : ''}, ` +
            `B=${sp.pieceBId}${offB === undefined ? ' [missing]' : ''}); skipping`
          );
          continue;
        }
        const globals: number[] = [];
        for (const [a, b] of sp.vertexPairs) {
          const ga = a + offA;
          const gb = b + offB;
          const dx = positions[ga * 3] - positions[gb * 3];
          const dy = positions[ga * 3 + 1] - positions[gb * 3 + 1];
          const dz = positions[ga * 3 + 2] - positions[gb * 3 + 2];
          seamIds.push(ga, gb);
          seamDist.push(Math.sqrt(dx * dx + dy * dy + dz * dz) * sp.tensionFactor);
          seamCompliance.push(sp.compliance);
          globals.push(ga, gb);
        }
        if (globals.length > 0) seamGlobalPairs.push(globals);
      }
      if (seamIds.length > 0) {
        const seamColored = colorConstraints(
          new Uint32Array(seamIds),
          new Float32Array(seamDist),
          seamIds.length / 2,
          new Float32Array(seamCompliance),
        );
        seam = {
          ids: seamColored.ids,
          targetDist: seamColored.restLengths,
          // compliance! safe: always passed above, and the length>0 guard
          // skips colorConstraints' compliance-less zero-constraint early return.
          compliance: seamColored.compliance!,
          colorRanges: seamColored.colorRanges,
        };
      }
    }

    // ── F3 NERVADURA (acta consejo costura-proceso-real 2026-07-05) ─────────
    //
    // La banda de margen real tiene 2-4 capas de tela: flexión ~8-27× (cúbica
    // con el grosor) y 2-3× la masa — es la nervadura que desvía los pliegues
    // del drapeado y hace que la costura cuelgue estable en vez de flotar.
    // Banda = BFS 2 anillos (~1cm a malla de 5mm) desde los vértices de
    // costura, sobre la adyacencia de malla PURA (sin partners cross-seam —
    // la banda ya cubre ambos lados porque los pares aportan a y b).
    // Masa ×2 (invMass ×0.5) + flexión ×3 (÷3 compliance) — empezamos ×3 y
    // no el 8-27× idealizado porque la escala cúbica sobre malla gruesa
    // sobre-rigidiza (calibrar en A/B visual).
    const bandVerts = new Set<number>();
    if (seamGlobalPairs.length > 0) {
      const SEAM_BAND_RINGS = 2;
      for (const pairs of seamGlobalPairs) for (const v of pairs) bandVerts.add(v);
      let frontier = [...bandVerts];
      for (let ring = 0; ring < SEAM_BAND_RINGS; ring++) {
        const next: number[] = [];
        for (const v of frontier) {
          for (const nb of adjSets[v]) {
            if (!bandVerts.has(nb)) {
              bandVerts.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
      for (const v of bandVerts) invMass[v] *= 0.5;

      // Flexión de banda: quads intra-pieza con los 4 vértices en banda →
      // fabric/3 vía el override per-quad (NaN = mapping normal). El branch
      // cross-seam de abajo PRESERVA este array al construir el conjunto.
      const numBendQuads = bend.ids.length / 4;
      if (numBendQuads > 0) {
        const bandCompliance = new Float32Array(numBendQuads).fill(Number.NaN);
        let bandQuads = 0;
        for (let i = 0; i < numBendQuads; i++) {
          const o = i * 4;
          if (
            bandVerts.has(bend.ids[o]) && bandVerts.has(bend.ids[o + 1]) &&
            bandVerts.has(bend.ids[o + 2]) && bandVerts.has(bend.ids[o + 3])
          ) {
            const et = bend.edgeTypes[i];
            const base = et === EdgeType.WARP
              ? fabric.bendComplianceWarp
              : fabric.bendComplianceWeft;
            bandCompliance[i] = base / 3;
            bandQuads++;
          }
        }
        if (bandQuads > 0) bend.compliance = bandCompliance;
      }
    }

    // Snapshot invMass para freeze/unfreeze — DESPUÉS de la masa de banda F3
    // (restore preserva la nervadura) y antes de que createTslBuffers copie.
    this.originalInvMass = new Float32Array(invMass);

    // ── Bend cross-seam (acta consejo costura-real 2026-07-05) ──────────────
    //
    // El término que convierte la unión de BISAGRA en costura de fábrica: la
    // curvatura fluye a través de la costura. Quads dihedral cross-pieza
    // concatenados al set de bend ANTES del coloring (mismo kernel P1, cero
    // dispatch nuevo — viajan dentro de bendColors). Rest 0, compliance =
    // bendComplianceWeft del fabric (EdgeType.WEFT en el builder). GPU-only:
    // divergencia A7 deliberada (precedente self-seams, Epic-746) — el
    // fallback WASM/CPU drapea con bisagras, documentado.
    //
    // BARRERA HALBERG (automática, ratificada): los quads cross-seam tocan
    // vértices de alta valencia; si el coloring conjunto infla los grupos de
    // bend en más de 4 colores vs el baseline intra-pieza, el costo son
    // cientos de encodes extra por frame → los quads se EXCLUYEN con warn
    // (la feature no se shipea rota, degrada a bisagra).
    //
    // Kill-switch dev: localStorage 'vina-crossbend' = 'off'.
    let bendAll = bend;
    let crossQuadCount = 0;
    let bendColorDelta = 0;
    // Re-init: el stash del press pertenece a los buffers viejos — un
    // proyecto nuevo con otro layout de quads lo envenenaría.
    this.crossQuadPartners = null;
    const crossBendEnabled = typeof window === 'undefined'
      || window.localStorage?.getItem('vina-crossbend') !== 'off';
    if (crossBendEnabled && seamGlobalPairs.length > 0) {
      const cross = buildCrossSeamBendQuads(triangles, seamGlobalPairs);
      if (cross.ids.length > 0) {
        const numBase = bend.ids.length / 4;
        const baseColors = numBase > 0
          ? colorConstraints(bend.ids, bend.restAngles, numBase, undefined, 4).colorRanges.length
          : 0;
        const jointIds = new Uint32Array(bend.ids.length + cross.ids.length);
        jointIds.set(bend.ids, 0);
        jointIds.set(cross.ids, bend.ids.length);
        const jointAngles = new Float32Array(bend.restAngles.length + cross.restAngles.length);
        jointAngles.set(bend.restAngles, 0);
        jointAngles.set(cross.restAngles, bend.restAngles.length);
        const jointTypes = new Uint8Array(bend.edgeTypes.length + cross.edgeTypes.length);
        jointTypes.set(bend.edgeTypes, 0);
        jointTypes.set(cross.edgeTypes, bend.edgeTypes.length);
        const jointColors = colorConstraints(
          jointIds, jointAngles, jointIds.length / 4, undefined, 4,
        ).colorRanges.length;
        bendColorDelta = jointColors - baseColors;
        if (bendColorDelta <= 4) {
          // Compliance per-quad: intra = NaN (createTslBuffers mapea
          // edgeType→fabric como siempre); cross = TOPE BLANDO de la banda
          // angular calibrada [6e2, 1e5] MIENTRAS la costura se cierra.
          // MEDIDO 2026-07-05 (A/B con el kill-switch): a rigidez del
          // fabric + rest 0, los quads planchaban costuras con ángulo real
          // (la sisa envuelve por diseño) → grieta con piel + tela
          // explotada. El bug era el REST (0 = "prefiere plano"), no la
          // rigidez: en settle el press F1 captura el ángulo ensamblado
          // real y ENTONCES endurece a fabric (pressCrossSeamAngles) — el
          // planchado del proceso real, por fases como en fábrica.
          const CROSS_SEAM_BEND_COMPLIANCE = 1e5;
          const numCross = cross.ids.length / 4;
          const jointCompliance = new Float32Array(jointIds.length / 4).fill(Number.NaN);
          // Preserva los overrides de banda F3 en la región intra.
          if (bend.compliance) jointCompliance.set(bend.compliance, 0);
          jointCompliance.fill(CROSS_SEAM_BEND_COMPLIANCE, numBase, numBase + numCross);
          bendAll = {
            ids: jointIds,
            restAngles: jointAngles,
            edgeTypes: jointTypes,
            compliance: jointCompliance,
          };
          crossQuadCount = numCross;
          // F1: stash para el press en settle (llave del quad → partners B
          // del hinge). El fabric weft es la rigidez destino del planchado.
          this.crossQuadPartners = new Map();
          for (let q = 0; q < numCross; q++) {
            const o = q * 4;
            const key = `${cross.ids[o]},${cross.ids[o + 1]},${cross.ids[o + 2]},${cross.ids[o + 3]}`;
            this.crossQuadPartners.set(key, [
              cross.seamPartners![q * 2],
              cross.seamPartners![q * 2 + 1],
            ]);
          }
          this.pressedBendCompliance = fabric.bendComplianceWeft;
        } else {
          console.warn(
            `[GpuSolverClient] cross-seam bend EXCLUIDO: coloring conjunto ` +
            `infla bendColors en ${bendColorDelta} (>4) — barrera Halberg`,
          );
        }
      }
    }

    await withErrorScope(this.device, 'GpuSolverClient.initMultiPieceTsl', () => {
      // Re-init: free any previously-allocated TSL resources so re-init cycles
      // (load project → simulate → load different project) don't leak GPUBuffers
      // (#753). When the renderer hasn't been captured yet (first init), this
      // degrades to a ref-drop — see `disposeStorageBufferAttribute`.
      this.disposeTslResources();

      // Create TSL buffers with per-constraint compliance and per-region
      // tether radii (frente#2). Each piece contributes its region string
      // (threaded via PieceMeshData.region); missing region → default 0.06 m.
      const tetherRadii = buildTetherRadii(
        pieces.map((p) => ({ region: p.region ?? 'unknown', vertexCount: p.vertices.length / 3 })),
      );
      this.tslBuffers = createTslBuffers(
        { positions, triangles, invMass },
        colored,
        bendAll, // bend intra-pieza + quads cross-seam (acta costura-real)
        seam,
        fabric,
        tetherRadii,
      );

      // Self-collision (#897 F3): SIEMPRE activo en el tier GPU. RATIFICADO:
      // diverge del preset 'normal' (selfCollision false) — esa es una
      // decisión de perf MEDIDA EN WASM (#608/#892, kernel a 1FPS) que no
      // aplica a compute GPU (buckets K=8, 4 pases). El kill-switch es el
      // gate de dispatch en GarmentSimulation. La adyacencia se construye
      // sobre los triángulos MERGED (offsets de pieza ya horneados) y el
      // tamaño de tabla espeja SpatialHashGrid.build: nextPrime(2N).
      // scBuffers DEBE asignarse antes de createTslSolver — su gate
      // (`config.selfCollision && buffers.scBuffers`) lee el campo en init.
      //
      // F4a (acta costura-proceso-real): las parejas COSIDAS entran a la
      // adyacencia (hoisted arriba) antes del CSR — dos plies cosidos están
      // en contacto POR DISEÑO, no en colisión. floor==thickness==2mm es
      // equilibrio exacto y F2 densifica pares justo en ese umbral (el
      // escéptico runtime lo subió de condicional a listo-en-el-PR).
      // Kill-switch dev: localStorage 'vina-seamscx' = 'off'.
      const seamScExclEnabled = typeof window === 'undefined'
        || window.localStorage?.getItem('vina-seamscx') !== 'off';
      if (seamScExclEnabled) {
        for (const pairs of seamGlobalPairs) {
          for (let k = 0; k + 1 < pairs.length; k += 2) {
            const a = pairs[k], b = pairs[k + 1];
            if (a === b) continue;
            adjSets[a].add(b);
            adjSets[b].add(a);
          }
        }
      }
      const csr = buildAdjacencyCSR(adjSets, totalVerts);
      this.tslBuffers.scBuffers = createSelfCollisionBuffers(
        totalVerts,
        nextPrime(totalVerts * 2),
        csr.offsets,
        csr.neighbors,
      );

      // Normal-weld cross-seam (acta consejo costura-real 2026-07-05): CSR
      // vértice→parejas construido de los MISMOS pares globales del seam
      // packing — las normales se sueldan a través de la unión en el kernel
      // normalWeld (post-normalNormalize) y la superficie se lee continua.
      // Orden determinista (verts y parejas sorted) — P4.
      if (seamGlobalPairs.length > 0) {
        const partnersByVert = new Map<number, Set<number>>();
        for (const pairs of seamGlobalPairs) {
          for (let k = 0; k + 1 < pairs.length; k += 2) {
            const a = pairs[k], b = pairs[k + 1];
            if (a === b) continue;
            let sa = partnersByVert.get(a);
            if (!sa) { sa = new Set(); partnersByVert.set(a, sa); }
            sa.add(b);
            let sb = partnersByVert.get(b);
            if (!sb) { sb = new Set(); partnersByVert.set(b, sb); }
            sb.add(a);
          }
        }
        const weldVerts = [...partnersByVert.keys()].sort((x, y) => x - y);
        if (weldVerts.length > 0) {
          const weldOffsets = new Uint32Array(weldVerts.length + 1);
          const weldPartners: number[] = [];
          weldVerts.forEach((v, i) => {
            const ps = [...partnersByVert.get(v)!].sort((x, y) => x - y);
            weldPartners.push(...ps);
            weldOffsets[i + 1] = weldPartners.length;
          });
          this.tslBuffers.weldBuffers = {
            vertsSBA: createSBA(new Uint32Array(weldVerts), 1),
            offsetsSBA: createSBA(weldOffsets, 1),
            partnersSBA: createSBA(new Uint32Array(weldPartners), 1),
            count: weldVerts.length,
          };
        }
      }

      const defaultConfig: TslSolverConfig = {
        substeps: 15,
        gravity: [0, -9.81, 0],
        // 0.99, NO 0.9603: el kernel preSolve multiplica
        // damping × (1 − internalDamping×0.1) igual que Rust pre_solve, así
        // que 0.99 × 0.97 = 0.9603 efectivo = paridad WASM. El valor viejo
        // re-aplicaba el factor (efectivo 0.9315/substep → momentum ×0.34
        // por frame vs ×0.54 en WASM) y deprimía el asentamiento (#897 F2).
        damping: 0.99,
        internalDamping: 0.3,
        seamShrinkFactor: DEFAULT_SEAM_CONFIG.shrinkFactor,
        seamSewedThreshold: DEFAULT_SEAM_CONFIG.sewedThreshold,
        // A3: piso terminal del decay (2mm) — canónico cross-tier con CPU
        // DEFAULT_SEAM_CONFIG.restLengthFloor y Rust seam_rest_length_floor.
        seamRestLengthFloor: DEFAULT_SEAM_CONFIG.restLengthFloor,
        groundY: 0.0,
        dt: 1 / 60,
        // Always-on en GPU (#897 F3, ver bloque scBuffers arriba); thickness
        // = clothThickness, paridad con los defaults CPU/WASM (2mm).
        selfCollision: true,
        thickness: 0.002,
        ...solverConfig,
      };

      this.tslSolver = createTslSolver(this.tslBuffers, defaultConfig);
      this.zeroCopy = true; // TSL mode = zero-copy

      // Dev-only: el handle del probe apunta SIEMPRE al ultimo cliente vivo
      // que inicializo (el avatar-set tambien lo re-escribe; dispose lo limpia
      // solo si le pertenece — StrictMode double-mount).
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__VINA_GPU_CLIENT__ = this;
      }
      console.log('[GpuSolverClient] TSL solver initialized:', {
        particles: totalVerts,
        stretchColors: colored.colorRanges.length,
        bendConstraints: bendAll.ids.length / 4,
        crossSeamBendQuads: crossQuadCount,
        bendColorDelta,
        seamConstraints: seam ? seam.ids.length / 2 : 0,
        seamColors: seam ? seam.colorRanges.length : 0,
        hasUvs,
        fabric: fabricCompliance ? 'custom' : 'defaults',
      });
    });
  }

  /**
   * Get the TSL solver (for renderer.compute() dispatch in useFrame).
   */
  getTslSolver(): TslSolver | null {
    return this.tslSolver;
  }

  /**
   * Get vertex ranges for each piece in the merged mesh.
   * Returns null if solver not initialized.
   */
  getPieceVertexRanges(): Map<string, { start: number; count: number }> | null {
    return this.pieceVertexRanges;
  }

  /**
   * Update fabric properties.
   */
  setFabricConfig(config: Partial<GpuSolverConfig>): void {
    this.solver.updateConfig(config);
  }

  /**
   * Update wind force on the TSL solver.
   */
  setWind(force: [number, number, number], dragCoefficient?: number): void {
    if (this.tslSolver) {
      this.tslSolver.updateConfig({
        windForce: force,
        ...(dragCoefficient !== undefined ? { dragCoefficient } : {}),
      });
    }
  }

  /**
   * Freeze/unfreeze pieces by setting invMass=0 for frozen vertices.
   * Restores original invMass for unfrozen vertices.
   * Bumps SBA version to trigger GPU buffer re-upload.
   */
  freezePieces(frozenPieceIds: string[]): void {
    if (!this.tslBuffers || !this.originalInvMass || !this.pieceVertexRanges) return;

    const invMassArr = this.tslBuffers.invMassSBA.array as Float32Array;
    // Restore all to original values first
    invMassArr.set(this.originalInvMass);

    // Zero out invMass for frozen pieces
    const frozenSet = new Set(frozenPieceIds);
    for (const [pieceId, range] of this.pieceVertexRanges) {
      if (frozenSet.has(pieceId)) {
        for (let i = range.start; i < range.start + range.count; i++) {
          invMassArr[i] = 0;
        }
      }
    }

    // Bump version to trigger GPU buffer re-upload on next render
    this.tslBuffers.invMassSBA.version++;
  }

  /**
   * Update steam brush parameters for the GPU compute kernel.
   * The brush kernel runs once per frame after substeps.
   * Set strength to 0 to deactivate (kernel early-exits).
   *
   * @param center - Brush world-space position [x, y, z]
   * @param radius - Brush sphere radius
   * @param strength - Damping strength 0-1 (0 = inactive, 1 = full damp)
   */
  setBrushParams(center: [number, number, number], radius: number, strength: number): void {
    if (!this.tslSolver) return;
    const b = this.tslSolver.brushNodes;
    b.centerX.value = center[0];
    b.centerY.value = center[1];
    b.centerZ.value = center[2];
    b.radius.value = radius;
    b.strength.value = strength;
  }

  /**
   * Fit-map GPU params (#1010 slice 2): traduce (FitMapMode, FitMapConfig)
   * → uniforms del kernel fitMapNodes (patrón setBrushParams — mutación
   * directa de uniform().value). Mapping de modo: none=0, stress=1, strain=2,
   * fit=3, pressure=4. p0/p1 = rango/thresholds del modo; p2 = escala
   * precomputada (stress → E/1000 de computeStressMap, fit → 1/maxStretch).
   * No-op silencioso antes de init.
   */
  setFitMapParams(mode: FitMapMode, config: FitMapConfig, fabric?: FabricFitParams): void {
    if (!this.tslSolver) return;
    const u = this.tslSolver.fitMapNodes.uniforms;
    const MODE: Record<FitMapMode, number> = { none: 0, stress: 1, strain: 2, fit: 3, pressure: 4 };
    u.mode.value = MODE[mode];
    switch (mode) {
      case 'stress':
        u.p0.value = config.stressRange[0];
        u.p1.value = config.stressRange[1];
        u.p2.value = fitStressScaleKPa(fabric);
        break;
      case 'strain':
        u.p0.value = config.strainRange[0];
        u.p1.value = config.strainRange[1];
        break;
      case 'fit':
        u.p0.value = config.fitThresholds[0];
        u.p1.value = config.fitThresholds[1];
        u.p2.value = 1 / Math.max(fabric?.maxStretchRatio ?? DEFAULT_FIT_FABRIC.maxStretchRatio, 0.001);
        break;
      case 'pressure':
        // Sin avatar (camino GPU actual) el colorize escribe el color
        // no-contact constante; p0 queda como presión de contacto de referencia.
        u.p0.value = config.pressureDistance;
        break;
      case 'none':
        break;
    }
  }

  /**
   * Start grab at the given center position.
   * Sets uniforms and flags grabInitPending so the next useFrame dispatches
   * the one-shot GPU init kernel (fills mask + offset on GPU, no CPU upload).
   */
  grabStart(center: [number, number, number], radius: number, strength: number): void {
    if (!this.tslSolver) return;
    const g = this.tslSolver.grabNodes;
    g.grabCenterX.value = center[0];
    g.grabCenterY.value = center[1];
    g.grabCenterZ.value = center[2];
    g.grabRadius.value = radius;
    g.grabStrength.value = strength;
    g.grabActive.value = 1;
    g.grabInitPending.value = 1; // triggers one-shot init kernel on next frame
  }

  /** Update grab center (called on pointer move). */
  grabMove(center: [number, number, number]): void {
    if (!this.tslSolver) return;
    const g = this.tslSolver.grabNodes;
    g.grabCenterX.value = center[0];
    g.grabCenterY.value = center[1];
    g.grabCenterZ.value = center[2];
  }

  /** Release grab. */
  grabRelease(): void {
    if (!this.tslSolver) return;
    this.tslSolver.grabNodes.grabActive.value = 0;
  }

  /**
   * Read GPU positions back to CPU and update a BufferGeometry's position attribute.
   * Uses renderer.getArrayBufferAsync() for GPU→CPU readback.
   * Returns the position Float32Array for reuse (e.g. by grabStartWithPositions).
   *
   * @param renderer - Three.js WebGPURenderer (passed as `gl` from useFrame)
   * @param geometry - The BufferGeometry whose position attribute should be updated
   */
  async readbackPositionsToGeometry(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any,
    geometry: THREE.BufferGeometry,
  ): Promise<Float32Array | null> {
    if (!this.tslSolver) return null;
    // Capture the renderer the first time we see one so dispose() can route
    // GPU-buffer destruction through `renderer._attributes.delete(attr)`.
    // The renderer is stable for the lifetime of the WebGPU context, so
    // first-write-wins is sufficient.
    if (!this.rendererRef) this.rendererRef = renderer;
    const sba = this.tslSolver.positionSBA;
    try {
      const ab: ArrayBuffer = await renderer.getArrayBufferAsync(sba);
      const gpuPositions = new Float32Array(ab);
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return gpuPositions;
      const dst = posAttr.array as Float32Array;
      const vertCount = posAttr.count;

      if (gpuPositions.length === dst.length) {
        // vec3 → vec3: direct copy
        dst.set(gpuPositions);
      } else if (gpuPositions.length === vertCount * 4) {
        // vec4 (XYZW) → vec3 (XYZ): strip W component
        for (let i = 0; i < vertCount; i++) {
          dst[i * 3] = gpuPositions[i * 4];
          dst[i * 3 + 1] = gpuPositions[i * 4 + 1];
          dst[i * 3 + 2] = gpuPositions[i * 4 + 2];
        }
      } else {
        return gpuPositions;
      }

      posAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
      return gpuPositions;
    } catch (e) {
      console.warn('[GpuSolverClient] Position readback failed:', e);
      return null;
    }
  }

  /**
   * Start the simulation loop.
   */
  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.frameCount = 0;
    this.loop();
  }

  /**
   * Stop the simulation loop.
   */
  stop(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Enable or disable zero-copy mode.
   * When enabled, the loop skips CPU readback and the renderer
   * should consume StorageBufferAttributes directly.
   */
  setZeroCopy(enabled: boolean): void {
    this.zeroCopy = enabled;
  }

  /**
   * Get a StorageBufferAttribute wrapping the solver's GPU position buffer.
   * Lazily created and cached.
   */
  getPositionStorageAttribute(): StorageBufferAttribute | null {
    if (!this.positionAttr) {
      this.positionAttr = createPositionStorageAttribute(
        this.solver.getPositionBuffer(),
        this.solver.numParticles,
      );
    }
    return this.positionAttr;
  }

  /**
   * Get a StorageBufferAttribute wrapping the solver's GPU normal buffer.
   * Lazily created and cached.
   */
  getNormalStorageAttribute(): StorageBufferAttribute | null {
    if (!this.normalAttr) {
      this.normalAttr = createNormalStorageAttribute(
        this.solver.getNormalBuffer(),
        this.solver.numParticles,
      );
    }
    return this.normalAttr;
  }

  /**
   * Explicit CPU readback for export/fit-maps.
   * For TSL mode: reads back from the StorageBufferAttribute's GPU buffer via
   * `renderer.getArrayBufferAsync`. Falls back to the renderer cached by the
   * first `readbackPositionsToGeometry` call when no `renderer` is passed.
   * For WGSL mode: delegates to solver.readPositions().
   *
   * Returns a fresh, flat `numParticles * 3` Float32Array (vec3 layout) to
   * mirror the WGSL contract. The GPU buffer may be padded to vec4 for
   * alignment; the W component is stripped here so callers get a uniform
   * shape regardless of tier.
   */
  async readPositionsToCPU(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer?: any,
  ): Promise<Float32Array | null> {
    if (this.tslSolver) {
      const r = renderer ?? this.rendererRef;
      if (!r) {
        throw new Error(
          '[GpuSolverClient] readPositionsToCPU (TSL) requires a WebGPURenderer. ' +
            'Pass one explicitly or call readbackPositionsToGeometry first to cache one.',
        );
      }
      if (!this.rendererRef) this.rendererRef = r;
      const sba = this.tslSolver.positionSBA;
      const ab: ArrayBuffer = await r.getArrayBufferAsync(sba);
      const raw = new Float32Array(ab);
      const numParticles = this.tslBuffers?.numParticles ?? Math.floor(raw.length / 3);
      if (raw.length === numParticles * 4) {
        // vec4 (XYZW padded) → vec3 (XYZ)
        const out = new Float32Array(numParticles * 3);
        for (let i = 0; i < numParticles; i++) {
          out[i * 3] = raw[i * 4];
          out[i * 3 + 1] = raw[i * 4 + 1];
          out[i * 3 + 2] = raw[i * 4 + 2];
        }
        return out;
      }
      return raw;
    }
    return this.solver.readPositions();
  }

  /**
   * Readback GPU→CPU de los colores del fit map (#1010 slice 2) — espejo de
   * readPositionsToCPU: `renderer.getArrayBufferAsync(fitColorSBA)` → copia
   * Float32Array (itemSize 3, RGB 0..1; sin W-strip: es un storage 'vec3'
   * declarado con count N, no el stride-4 de posiciones). Throw si no hay
   * renderer disponible (mismo patrón de error que readPositionsToCPU).
   */
  async readFitColorsToCPU(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer?: any,
  ): Promise<Float32Array> {
    if (!this.tslSolver) {
      throw new Error(
        '[GpuSolverClient] readFitColorsToCPU requires an initialized TSL solver.',
      );
    }
    const r = renderer ?? this.rendererRef;
    if (!r) {
      throw new Error(
        '[GpuSolverClient] readFitColorsToCPU (TSL) requires a WebGPURenderer. ' +
          'Pass one explicitly or call readbackPositionsToGeometry first to cache one.',
      );
    }
    if (!this.rendererRef) this.rendererRef = r;
    const ab: ArrayBuffer = await r.getArrayBufferAsync(this.tslSolver.fitColorSBA);
    const raw = new Float32Array(ab);
    const n = this.tslSolver.fitColorSBA.count;
    // W-strip vec4→vec3 (espejo de readPositionsToCPU): el storage buffer
    // vec3 viene paddeado a vec4 en GPU — sin strip el stream se desfasa
    // ([r,g,b,W,...] leído como tripletas).
    if (raw.length === n * 4) {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        out[i * 3] = raw[i * 4];
        out[i * 3 + 1] = raw[i * 4 + 1];
        out[i * 3 + 2] = raw[i * 4 + 2];
      }
      return out;
    }
    return raw;
  }

  /** Callback de edge data (#1010) — mismo contrato que ClothWorkerClient:
   *  (Int32Array ids [a,b,...], Float32Array restLengths). Null por defecto. */
  onEdgeData: ((stretchingIds: Int32Array, stretchingLengths: Float32Array) => void) | null = null;

  /**
   * Request edge constraint data (for fit map computation). Síncrono: entrega
   * los arrays retenidos en init. No-op silencioso antes de init o tras
   * dispose (#1010).
   */
  requestEdgeData(): void {
    if (!this.edgeData) return;
    this.onEdgeData?.(this.edgeData.ids, this.edgeData.lengths);
  }

  /**
   * Clean up all resources.
   *
   * Order matters: TSL GPU buffers must be released BEFORE `solver.destroy()`
   * because the cached `rendererRef` may share the device with the WGSL
   * solver, and once `device` is destroyed the renderer's backend can't
   * service `_attributes.delete()` calls.
   */
  dispose(): void {
    this.disposed = true;
    // Dev-only: no dejar el handle del probe apuntando a un cliente muerto —
    // el double-mount de StrictMode dispone el cliente del primer mount
    // DESPUES de que el segundo ya corrio (async), y el probe del face-poke
    // agarraba la instancia disposed (getTslSolver()=null). Solo se limpia
    // si el handle es NUESTRO; el cliente vivo lo re-puebla en su avatar-set.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      if (w.__VINA_GPU_CLIENT__ === this) delete w.__VINA_GPU_CLIENT__;
    }
    this.stop();
    this.positionAttr = null;
    this.normalAttr = null;
    this.disposeTslResources();
    this.pieceVertexRanges = null;
    this.originalInvMass = null;
    this.edgeData = null; // #1010: sin edge data tras dispose → requestEdgeData no-op
    this.rendererRef = null;
    this.solver.destroy();
  }

  /**
   * Get the GPU position buffer (for future zero-copy WebGPU rendering).
   */
  getPositionBuffer(): GPUBuffer | null {
    return this.solver.getPositionBuffer();
  }

  /**
   * Get the GPU normal buffer (for future zero-copy WebGPU rendering).
   */
  getNormalBuffer(): GPUBuffer | null {
    return this.solver.getNormalBuffer();
  }

  /**
   * Set triangle collision mesh for body collision.
   * Vertices should be expanded: 9 floats per triangle (3 verts × 3 components).
   * Normals: 3 floats per triangle.
   */
  setCollisionMesh(
    mesh: { vertices: Float32Array; normals: Float32Array; triCount: number },
    friction: number = AVATAR_FRICTION,
  ): void {
    if (this.tslSolver) {
      // TSL mode: build BVH and create TSL collision body. `friction` carries the
      // active fabric's frictionBody (F0 — was dead data); AVATAR_FRICTION (0.4
      // cotton-on-skin) stays the fallback when no fabric friction is provided.
      this.setTslCollisionBody('__avatar__', mesh, friction, AVATAR_MARGIN);
      return;
    }
    this.solver.setCollisionMesh(mesh);
  }

  /**
   * Update collision mesh vertices/normals (same triangle count, reuses buffers).
   */
  updateCollisionMesh(
    vertices: Float32Array,
    normals: Float32Array,
    friction: number = AVATAR_FRICTION,
  ): void {
    if (this.tslSolver) {
      // TSL mode: rebuild BVH (topology may differ, so full rebuild). `friction`
      // carries the active fabric's frictionBody (F0); AVATAR_FRICTION fallback.
      const triCount = vertices.length / 9;
      this.setTslCollisionBody('__avatar__', { vertices, normals, triCount }, friction, AVATAR_MARGIN);
      return;
    }
    this.solver.updateCollisionMesh(vertices, normals);
  }

  /**
   * Add/update a custom collision body (non-avatar props like mannequin stands).
   */
  updateCollisionBody(data: { id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }): void {
    if (this.tslSolver) {
      this.setTslCollisionBody(data.id, data.mesh, data.friction, data.margin);
      return;
    }
    // WGSL path — delegate to underlying solver
    this.solver.setCollisionMesh(data.mesh);
  }

  /**
   * Set a TSL collision body from collision mesh data.
   * Builds a BVH on CPU, uploads to GPU as StorageBufferAttributes,
   * creates a TSL collision compute node, and registers it on the solver.
   */
  setTslCollisionBody(
    id: string,
    mesh: { vertices: Float32Array; normals: Float32Array; triCount: number },
    friction: number = 0.3,
    margin: number = 0.005,
  ): void {
    if (!this.tslSolver || !this.tslBuffers) {
      console.warn('[GpuSolverClient] setTslCollisionBody called but no TSL solver active');
      return;
    }
    if (mesh.triCount === 0) {
      console.warn(
        `[GpuSolverClient] setTslCollisionBody '${id}': input mesh has triCount=0, skipping. ` +
          `Avatar collision is not degradable — particles will fall through any region this body would have covered.`,
      );
      return;
    }

    // Build BVH on CPU
    const bvh = buildLinearBVH(mesh);
    if (bvh.nodeCount === 0) {
      console.warn(
        `[GpuSolverClient] setTslCollisionBody '${id}': BVH build produced 0 nodes from ${mesh.triCount} triangles, skipping. ` +
          `Likely a degenerate mesh; avatar collision will be absent for this body.`,
      );
      return;
    }

    // Re-allocation cleanup: avatar pose updates call this method repeatedly
    // for the same body id. Without this, each call leaks 4 SBAs worth of
    // GPUBuffer (BVH nodes, skip pointers, tri verts, tri normals) — #753.
    const previous = this.collisionBodySBAs.get(id);
    if (previous) {
      disposeStorageBufferAttribute(previous.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.bvhSkipSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.triNormalsSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.edgePseudoSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.vertexPseudoSBA, this.rendererRef);
    }

    // Create StorageBufferAttributes for GPU upload
    const bvhNodesSBA = createSBA(bvh.nodes, 1);
    const bvhSkipSBA = createSBA(bvh.skip, 1);
    const triVertsSBA = createSBA(bvh.triVerts, 1);
    const triNormalsSBA = createSBA(bvh.triNormals, 1);
    const edgePseudoSBA = createSBA(bvh.edgePseudonormals, 1);
    const vertexPseudoSBA = createSBA(bvh.vertexPseudonormals, 1);
    this.collisionBodySBAs.set(id, { bvhNodesSBA, bvhSkipSBA, triVertsSBA, triNormalsSBA, edgePseudoSBA, vertexPseudoSBA });

    // Use shared buffer nodes from the solver
    const N = this.tslSolver.numParticles;
    const posBuf = this.tslSolver.positionBufNode;
    const prevPosBuf = this.tslSolver.prevPosBufNode;
    const invMassBuf = this.tslSolver.invMassBufNode;

    const body = createTslCollisionBody(
      posBuf,
      prevPosBuf,
      invMassBuf,
      bvhNodesSBA,
      bvhSkipSBA,
      triVertsSBA,
      triNormalsSBA,
      edgePseudoSBA,
      vertexPseudoSBA,
      N,
      bvh.nodeCount,
      bvh.triCount,
      id,
      margin,
      friction,
    );

    this.tslSolver.setCollisionBody(body, this.rendererRef);

    // ─── Face-poke pass (face-poke v1, GPU-only) ──────────────────────────────
    // The correction kernel queries THIS body's BVH for body vertices poking
    // through cloth faces, so it is built here (where the BVH SBAs exist) and
    // exposed on the solver. v1 = avatar only (the motivating case — María's
    // body showing through the front drape); other collision bodies don't get a
    // face-poke pass. Re-built on every avatar pose update (fresh BVH); the old
    // compute nodes become GC-eligible (they own no GPU buffers — the SBAs are
    // owned by tslBuffers + collisionBodySBAs and disposed there).
    if (id === '__avatar__') {
      // Pack triVerts + vertexPseudonormals into ONE interleaved buffer (18
      // floats/tri) so the correct kernel binds ≤8 storage buffers (WebGPU
      // maxStorageBuffersPerShaderStage=8; the un-packed kernel bound 11 →
      // invalid pipeline → silent no-op). Dispose the previous avatar's packed
      // geom on rebuild — it owns a GPU buffer.
      if (this.facePokeBodyGeomSBA) {
        disposeStorageBufferAttribute(this.facePokeBodyGeomSBA, this.rendererRef);
      }
      this.facePokeBodyGeomSBA = createSBA(
        packFacePokeBodyGeom(bvh.triVerts, bvh.vertexPseudonormals, bvh.triCount),
        1,
      );
      this.tslSolver.facePokeNodes = {
        generate: makeFacePokeGenerateNode({
          posBuf: this.tslSolver.positionBufNode,
          csrSBA: this.tslBuffers.facePokeCsrSBA,
          bvhNodesSBA,
          bvhSkipSBA,
          bodyGeomSBA: this.facePokeBodyGeomSBA,
          contactSBA: this.tslBuffers.facePokeContactSBA,
          numParticles: N,
          numClothTriangles: this.tslBuffers.numTriangles,
          numBvhNodes: bvh.nodeCount,
          numBodyTris: bvh.triCount,
          margin,
        }),
        solve: makeFacePokeSolveNode({
          posBuf: this.tslSolver.positionBufNode,
          prevPosBuf: this.tslSolver.prevPosBufNode,
          invMassBuf: this.tslSolver.invMassBufNode,
          preCollisionSBA: this.tslBuffers.preCollisionPosSBA,
          csrSBA: this.tslBuffers.facePokeCsrSBA,
          bodyGeomSBA: this.facePokeBodyGeomSBA,
          contactSBA: this.tslBuffers.facePokeContactSBA,
          numParticles: N,
          numClothTriangles: this.tslBuffers.numTriangles,
          numBodyTris: bvh.triCount,
          margin,
          friction,
        }),
      };
      // Dev-only console handle (freeze-frame flag, ad-hoc @gpu-local probes):
      // the client instance is otherwise unreachable from the browser console.
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__VINA_GPU_CLIENT__ = this;
      }
    }

    // Retain the avatar body tris for captureTetherTargets (body-surface query).
    // NOTE: the body-surface capture is NOT auto-run here — it is an O(N×tris)
    // brute force (~26 s for an 18 k-tri avatar) that froze Start, and the tether
    // now targets each vertex's SETTLED position instead (recaptureTetherTargetsFromGpu,
    // O(N), fired once the drape settles). tetherBodyTris is kept so
    // captureTetherTargets remains callable (e.g. a future active body-pull mode).
    if (id === '__avatar__') {
      this.tetherBodyTris = mesh;
    }

    console.log(`[GpuSolverClient] TSL collision body '${id}':`, {
      bvhNodes: bvh.nodeCount,
      triangles: bvh.triCount,
      margin,
      friction,
    });
  }

  /**
   * Capture per-vertex body-surface targets for the tether kernel.
   *
   * For each cloth particle i, queries the retained body triangles
   * (`this.tetherBodyTris`) for the closest surface point and writes it into
   * `tetherTargetSBA.array[i*3 .. i*3+2]`.  Brute-force over all triangles is
   * acceptable here: this runs ONCE per init/rebuild (not per frame), and the
   * avatar mesh is O(few thousand) tris.
   *
   * Called automatically at the end of `setTslCollisionBody` for id
   * `'__avatar__'` and is a public no-op so callers can trigger it manually.
   *
   * Guard: no-op if no TSL solver, no buffers, or no body captured yet.
   */
  captureTetherTargets(): void {
    if (!this.tslBuffers || !this.tslSolver) return;
    if (!this.tetherBodyTris) return;

    const { vertices: bv, normals: bn, triCount } = this.tetherBodyTris;
    // Read particle positions from positionSBA (the canonical cloth positions,
    // stable across repeated captureTetherTargets calls).  tetherTargetSBA
    // holds the RESULTS of this function — using it as the query source would
    // corrupt the targets on the second call (body-surface point ≠ cloth pos).
    const pArr = this.tslBuffers.positionSBA.array as Float32Array;
    const tArr = this.tslBuffers.tetherTargetSBA.array as Float32Array;
    const N = this.tslBuffers.numParticles;

    for (let i = 0; i < N; i++) {
      const px = pArr[i * 3];
      const py = pArr[i * 3 + 1];
      const pz = pArr[i * 3 + 2];

      let bestDist = Infinity;
      let bestX = px, bestY = py, bestZ = pz;

      for (let t = 0; t < triCount; t++) {
        const vOff = t * 9;
        const nOff = t * 3;
        const [cx, cy, cz] = closestPointOnTriangle(px, py, pz, bv, vOff, bn, nOff);
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const dsq = dx * dx + dy * dy + dz * dz;
        if (dsq < bestDist) {
          bestDist = dsq;
          bestX = cx; bestY = cy; bestZ = cz;
        }
      }

      tArr[i * 3]     = bestX;
      tArr[i * 3 + 1] = bestY;
      tArr[i * 3 + 2] = bestZ;
    }

    this.tslBuffers.tetherTargetSBA.needsUpdate = true;
  }

  /**
   * Recapture tether targets from the CURRENT (settled) drape, then return true
   * so the caller can enable the tether kernel.
   *
   * Why this exists: the init `captureTetherTargets` runs at body-set time, when
   * the cloth is still in its pre-wrap spread-out layout (~0.6 m mean from the
   * body) — those targets are meaningless once the cloth actually drapes, and a
   * tether toward them collapses the garment (belowHip 72%, root-caused
   * 2026-06-25). This reads back the live GPU positions (the cloth as settled on
   * the body) and uses EACH vertex's own settled position as its tether target.
   * That makes the max-distance clamp a gentle "stay within `radius` of where you
   * draped" anti-slide (not an over-constraint), preserves the natural drape
   * folds, and is O(N) — deliberately NOT the per-vertex body-surface search,
   * which is ~26 s for an 18 k-tri avatar and would freeze the frame loop mid-sim.
   *
   * Returns false (caller keeps the tether disabled) if buffers are absent, no
   * renderer is cached yet, or the readback fails / short-reads.
   */
  async recaptureTetherTargetsFromGpu(): Promise<boolean> {
    if (!this.tslBuffers || !this.tslSolver) return false;
    const N = this.tslBuffers.numParticles;
    let settled: Float32Array | null = null;
    try {
      settled = await this.readPositionsToCPU();
    } catch (e) {
      console.warn('[GpuSolverClient] tether settle-recapture readback failed:', e);
      return false;
    }
    if (!settled || settled.length < N * 3) return false;

    const tArr = this.tslBuffers.tetherTargetSBA.array as Float32Array;
    tArr.set(settled.subarray(0, N * 3));
    this.tslBuffers.tetherTargetSBA.needsUpdate = true;

    // F1 planchado: el MISMO readback del settle alimenta el press de los
    // quads cross-seam — cero readbacks extra (corrección mnCheck).
    this.pressCrossSeamAngles(settled);
    // Puntadas bloqueadas: mismo readback — el hilo no atraviesa el brazo.
    this.releaseBlockedSeamPairs(settled);
    return true;
  }

  /**
   * PUNTADAS BLOQUEADAS (fotos de Samuel desde dentro del avatar,
   * 2026-07-06): en la almendra dorso-hombro los pares de costura unen un
   * punto DETRÁS del brazo con uno DELANTE — no pueden cerrar porque el
   * brazo está en el medio. La constraint rígida (compliance 1e-6) se queda
   * halando eternamente y la tela tensada CORTA el brazo como cuerda ("la
   * tela como un hacha desmembrando al avatar"): la colisión del tier GPU
   * es por vértices (face-poke no disponible), así que las CARAS tensas
   * cortan el interior aunque los vértices queden fuera.
   *
   * En el mundo real esto es imposible: el hilo no atraviesa el cuerpo —
   * una puntada que no puede cerrar NO SE COSE (queda saltada). Simular el
   * proceso real = soltarla: en el settle (frame 150, mismo readback del
   * tether/planchado), todo par con gap > BLOCKED_SEAM_GAP_M se libera
   * (compliance → 1.0, α ≈ 8e5 con sdt 1/900 → corrección ~0). La colisión
   * empuja la tela fuera del brazo y la almendra queda como hueco honesto
   * hasta el fix de la junction (colocación/alcance del cap).
   *
   * Umbral 2cm: bien por encima del típico cosido en settle (0.2-0.4cm,
   * perfil de la sonda seam-gap) y por debajo del run de la almendra
   * (3-13cm). Los pares que iban a cerrar YA cerraron (curvas planas desde
   * 0.5s). Coherente con el gate del press (≤5mm) y el filtro del seam
   * fill: bloqueado → ni planchado ni puente.
   *
   * GPU-only (divergencia A7, precedente press/normal-weld). Limitación
   * heredada del tether: no refresca en re-pose.
   */
  private releaseBlockedSeamPairs(settled: Float32Array): void {
    if (!this.tslBuffers) return;
    const BLOCKED_SEAM_GAP_M = 0.02;
    const RELEASED_SEAM_COMPLIANCE = 1.0;

    let released = 0;
    let total = 0;
    for (const group of this.tslBuffers.seamColors) {
      const ids = group.idsSBA.array as Uint32Array;
      const compliance = group.complianceSBA.array as Float32Array;
      let dirty = false;
      for (let slot = 0; slot < group.count; slot++) {
        total++;
        const a = ids[slot * 2], b = ids[slot * 2 + 1];
        const gap = Math.hypot(
          settled[a * 3] - settled[b * 3],
          settled[a * 3 + 1] - settled[b * 3 + 1],
          settled[a * 3 + 2] - settled[b * 3 + 2],
        );
        if (gap > BLOCKED_SEAM_GAP_M) {
          compliance[slot] = RELEASED_SEAM_COMPLIANCE;
          dirty = true;
          released++;
        }
      }
      if (dirty) group.complianceSBA.version++;
    }
    if (released > 0) {
      console.log(
        `[GpuSolverClient] puntadas bloqueadas: ${released}/${total} pares ` +
        `liberados (gap > ${BLOCKED_SEAM_GAP_M * 100}cm — el hilo no atraviesa el brazo)`,
      );
    }
  }

  /**
   * F1 — PLANCHADO (acta consejo costura-proceso-real 2026-07-05).
   *
   * El proceso real: la costura se cierra PRIMERO (arrastre + decay al piso)
   * y luego la plancha fija el ángulo que la geometría ensamblada tiene, con
   * rigidez alta. Rest 0 decía "prefiere plano" — por eso endurecer los
   * quads cross-seam planchaba la sisa que envuelve por diseño (bug de REST,
   * no de rigidez, medido 2026-07-05).
   *
   * Sobre las posiciones asentadas del readback del tether (frame 150):
   * por cada quad cross-seam superviviente (stash `crossQuadPartners`),
   * si sus dos pares de costura están COSIDOS (|pa−pb| ≤ floor+ε en el mismo
   * readback — no el targetDist GPU, que vive decaído), captura el ángulo
   * dihedral real con `dihedralAngle` (misma convención signed/atan2 del
   * kernel TSL) y lo escribe como rest angle + endurece a compliance del
   * fabric. Los no cosidos conservan rest 0 / 1e5 (sugerencia blanda).
   *
   * Escritura: escanea `bendColors[]` (el layout GPU está recoloreado y
   * partido en SBAs por color — no hay región cross contigua), matchea por
   * llave de quad, muta `SBA.array` + `needsUpdate` (patrón tether).
   * Limitación heredada del tether: no refresca en re-pose.
   */
  private pressCrossSeamAngles(settled: Float32Array): void {
    if (!this.tslBuffers || !this.crossQuadPartners || this.crossQuadPartners.size === 0) return;

    // Gate sewn: piso terminal del decay (2mm) + ε de asentamiento. A 5mm el
    // par está cosido de verdad; una almendra abierta (3-10cm) NO se hornea.
    const SEWN_EPS = 0.003;
    const sewnThreshold = DEFAULT_SEAM_CONFIG.restLengthFloor + SEWN_EPS;
    const gap = (u: number, v: number) => Math.hypot(
      settled[u * 3] - settled[v * 3],
      settled[u * 3 + 1] - settled[v * 3 + 1],
      settled[u * 3 + 2] - settled[v * 3 + 2],
    );

    let pressed = 0;
    let openSkipped = 0;
    for (const group of this.tslBuffers.bendColors) {
      const ids = group.idsSBA.array as Uint32Array;
      const rest = group.restAnglesSBA.array as Float32Array;
      const compliance = group.complianceSBA.array as Float32Array;
      let dirty = false;
      for (let slot = 0; slot < group.count; slot++) {
        const o = slot * 4;
        const a0 = ids[o], a1 = ids[o + 1], c = ids[o + 2], d = ids[o + 3];
        const partners = this.crossQuadPartners.get(`${a0},${a1},${c},${d}`);
        if (!partners) continue; // quad intra-pieza
        if (gap(a0, partners[0]) > sewnThreshold || gap(a1, partners[1]) > sewnThreshold) {
          openSkipped++;
          continue; // costura abierta aquí — no hornear el ángulo del hueco
        }
        const phi = dihedralAngle(settled, a0, a1, c, d);
        if (phi === null) continue; // degenerado — dihedral.ts guards
        rest[slot] = phi;
        compliance[slot] = this.pressedBendCompliance;
        dirty = true;
        pressed++;
      }
      if (dirty) {
        // version++ directo (convención freezePieces / Epic-746) — equivale
        // al setter needsUpdate de three y es lo que el contrato #17 pinnea.
        group.restAnglesSBA.version++;
        group.complianceSBA.version++;
      }
    }
    console.log(
      `[GpuSolverClient] planchado F1: ${pressed}/${this.crossQuadPartners.size} quads ` +
      `cross-seam presseados (${openSkipped} abiertos conservan sugerencia blanda)`,
    );
  }

  /**
   * Thin test accessor — returns `tetherTargetSBA.array` (Float32Array of N×3
   * target positions, after captureTetherTargets has run).
   * Returns null when the TSL buffers are not initialized.
   */
  getTetherTargets(): Float32Array | null {
    if (!this.tslBuffers) return null;
    return this.tslBuffers.tetherTargetSBA.array as Float32Array;
  }

  /**
   * Remove a TSL collision body by ID.
   */
  removeTslCollisionBody(id: string): void {
    this.tslSolver?.removeCollisionBody(id, this.rendererRef);
    // Drop the face-poke nodes when the avatar goes away — the correction
    // kernel references this body's BVH SBAs (freed below), so a later dispatch
    // would read freed buffers.
    if (id === '__avatar__' && this.tslSolver) {
      this.tslSolver.facePokeNodes = null;
      if (this.facePokeBodyGeomSBA) {
        disposeStorageBufferAttribute(this.facePokeBodyGeomSBA, this.rendererRef);
        this.facePokeBodyGeomSBA = null;
      }
    }
    const tracked = this.collisionBodySBAs.get(id);
    if (tracked) {
      disposeStorageBufferAttribute(tracked.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.bvhSkipSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triNormalsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.edgePseudoSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.vertexPseudoSBA, this.rendererRef);
      this.collisionBodySBAs.delete(id);
    }
  }

  /**
   * Free all TSL-side GPU resources (buffer set + per-body BVH SBAs + solver
   * compute-node refs). Idempotent. Used by both `dispose()` and the re-init
   * path in `initMultiPieceTsl`.
   */
  private disposeTslResources(): void {
    for (const tracked of this.collisionBodySBAs.values()) {
      disposeStorageBufferAttribute(tracked.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.bvhSkipSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triNormalsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.edgePseudoSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.vertexPseudoSBA, this.rendererRef);
    }
    this.collisionBodySBAs.clear();
    if (this.tslBuffers) {
      destroyTslBufferSet(this.tslBuffers, this.rendererRef);
      this.tslBuffers = null;
    }
    if (this.tslSolver) {
      this.tslSolver.dispose(this.rendererRef);
      this.tslSolver = null;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Check a position array for NaN/Infinity values. Returns true if valid.
   */
  private validatePositions(positions: Float32Array): boolean {
    // Sample-check (every 100th particle) for performance; full check on first 3 frames
    const stride = this.frameCount < 3 ? 1 : 300;
    for (let i = 0; i < positions.length; i += stride) {
      if (!isFinite(positions[i])) {
        const particleIdx = Math.floor(i / 3);
        const component = ['x', 'y', 'z'][i % 3];
        console.error(
          `[GpuSolverClient] ❌ NaN/Inf at particle ${particleIdx}.${component} (frame ${this.frameCount}, positions[${i}] = ${positions[i]})`,
        );
        return false;
      }
    }
    return true;
  }

  private loop = (): void => {
    if (!this.running || this.disposed) return;

    if (this.readbackPending) {
      // Previous readback still in flight — don't submit more GPU work.
      // Submitting step() while mapAsync is pending causes queue saturation:
      // each step adds ~900 compute passes, and mapAsync can't resolve
      // until ALL queued work drains, creating an ever-growing backlog.
      this.animFrameId = requestAnimationFrame(this.loop);
      return;
    }

    this.solver.step();

    if (this.zeroCopy) {
      this.onFrame?.(new Float32Array(0));
    } else {
      this.readbackPending = true;
      this.solver.readPositions().then(positions => {
        this.readbackPending = false;
        if (this.disposed) return; // Client was disposed during readback

        if (positions) {
          // NaN validation (intensive on first 3 frames, sampled thereafter)
          if (!this.validatePositions(positions)) {
            console.error('[GpuSolverClient] Stopping solver due to NaN positions');
            this.stop();
            return;
          }

          this.frameCount++;
          if (this.onFrame) {
            this.onFrame(positions);
          }
        }
      }).catch((e) => {
        this.readbackPending = false;
        if (this.disposed) return; // Expected: buffer destroyed during dispose
        console.warn('[GpuSolverClient] Readback failed:', e);
      });
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}

/**
 * TSL Buffer Setup — creates StorageBufferAttribute instances for the TSL compute solver.
 *
 * These SBAs are the single source of truth: written by renderer.compute() (solver)
 * and read by the vertex shader via material.positionNode / material.normalNode.
 *
 * @module tslBuffers
 */

import { StorageBufferAttribute } from 'three/webgpu';
import { colorConstraints } from './gpuBuffers';
import type { ClothMeshData, BendConstraints, ColoredConstraints } from './gpuBuffers';
import type { SelfCollisionBufferSet } from './tslSelfCollision';
import { destroySelfCollisionBuffers } from './tslSelfCollision';
import type { WindBufferSet } from './tslWind';
import { destroyWindBuffers } from './tslWind';
import { buildClothVertexFaces } from '../clothVertexFaces';
import { packFacePokeCsr } from './tslFacePoke';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-constraint compliance config derived from fabric properties */
export interface FabricComplianceConfig {
  stretchComplianceWarp: number;
  stretchComplianceWeft: number;
  shearCompliance: number;
  bendComplianceWarp: number;
  bendComplianceWeft: number;
  /** P7-density: kg/m² (GSM/1000). undefined → escala de masa 1 (150 GSM). */
  density?: number;
}

/** Seam constraints del path TSL (#897 F1) — coloreadas, con compliance.
 *  Distinto de SeamConstraintData (legacy WGSL, intocable). */
export interface TslSeamConstraintData {
  ids: Uint32Array;                 // GLOBAL, reordenados por color
  targetDist: Float32Array;         // seed = distancia mundial × tension (decae en GPU)
  compliance: Float32Array;         // per-constraint
  colorRanges: Array<{ offset: number; count: number }>;
}

export interface StretchColorGroup {
  /** Pairs of particle indices for this color [a,b, a,b, ...] */
  idsSBA: StorageBufferAttribute;
  /** Rest lengths for this color */
  restLengthsSBA: StorageBufferAttribute;
  /** Per-constraint compliance values for this color */
  complianceSBA: StorageBufferAttribute;
  /** Number of constraints in this color group */
  count: number;
}

export interface SeamColorGroup {
  /** Pares de índices GLOBALES [a,b, ...] de este color */
  idsSBA: StorageBufferAttribute;
  /** Target per-constraint — el kernel lo DECAE in-place cada substep */
  targetDistSBA: StorageBufferAttribute;
  /** Compliance per-constraint */
  complianceSBA: StorageBufferAttribute;
  count: number;
}

export interface BendColorGroup {
  /** Quads [a,b,c,d, ...] de este color — arista a-b, alas c,d (itemSize 4).
   *  P1 dihedral: el kernel escribe los 4 vértices; el coloring es sobre los
   *  4 ids (stride-4), NO sobre pares (c,d) — eso reabriría la race P4-1. */
  idsSBA: StorageBufferAttribute;
  /** Ángulos dihedral rest (radianes, signed, flat=0 — dihedral.ts) */
  restAnglesSBA: StorageBufferAttribute;
  /** Compliance ANGULAR per-constraint (banda ~[6e-2,10], no la de distancia) */
  complianceSBA: StorageBufferAttribute;
  count: number;
}

/** CSR de soldadura de normales: vértices de costura + sus parejas
 *  (acta consejo costura-real 2026-07-05). */
export interface NormalWeldBufferSet {
  /** uint — vértices únicos de costura (ordenados, determinista). */
  vertsSBA: StorageBufferAttribute;
  /** uint, count+1 — offsets CSR sobre partnersSBA. */
  offsetsSBA: StorageBufferAttribute;
  /** uint — parejas aplanadas (ordenadas por vértice, determinista). */
  partnersSBA: StorageBufferAttribute;
  /** Número de vértices soldados (dispatch del kernel normalWeld). */
  count: number;
}

export interface TslBufferSet {
  // Core particle buffers
  positionSBA: StorageBufferAttribute;
  prevPosSBA: StorageBufferAttribute;
  /**
   * Snapshot de pos tomado tras grab y ANTES de la colisión de cuerpo
   * (#897 F2.3) — espejo de `preCollisionBuf` en wasmSolverWorker.ts.
   * postSolve deriva la velocidad de aquí: el push de colisión corrige
   * posición pero NO crea velocidad.
   */
  preCollisionPosSBA: StorageBufferAttribute;
  velocitySBA: StorageBufferAttribute;
  invMassSBA: StorageBufferAttribute;

  // Stretch constraints (per-color for race-free dispatch)
  stretchColors: StretchColorGroup[];

  // Bend constraints (per-color for race-free dispatch — P4-1 determinism;
  // P1: quads dihedral stride-4, coloreados sobre los 4 ids)
  bendColors: BendColorGroup[];
  numBendConstraints: number;

  // Seam constraints (per-color for race-free dispatch — #897 F1.3)
  seamColors: SeamColorGroup[];
  numSeamConstraints: number;

  // Triangle index buffer
  triangles: Uint32Array;

  // Normal computation (GPU smooth normals)
  normalSBA: StorageBufferAttribute;        // vec3 float — final vertex normals
  normalAccumSBA: StorageBufferAttribute;   // flat int32 — atomic accumulation buffer
  triangleIdsSBA: StorageBufferAttribute;   // flat uint32 — triangle vertex indices

  // Grab tool buffers (GPU-only: written by grabInitNode, read by grabNode)
  grabMaskSBA: StorageBufferAttribute;     // float — per-particle falloff mask
  grabOffsetSBA: StorageBufferAttribute;   // vec3 — per-particle offset from grab center

  // Self-collision buffers (null if disabled)
  scBuffers: SelfCollisionBufferSet | null;

  // Normal-weld cross-seam (acta costura-real): la superficie se lee
  // continua a través de la unión. Asignado por GpuSolverClient antes de
  // createTslSolver (patrón scBuffers); null sin costuras.
  weldBuffers: NormalWeldBufferSet | null;

  // Wind accumulation buffers (null if no wind)
  windBuffers: WindBufferSet | null;

  // Body-tether buffers (frente#2: cloth clings to body, UE max-distance)
  tetherTargetSBA: StorageBufferAttribute;  // vec3 — anchor point on body (seeded to positions)
  tetherMaxDistSBA: StorageBufferAttribute; // float — per-vertex cling radius

  // Face-poke (v1): packed cloth CSR + snapshot (packing keeps the correct kernel ≤8 storage buffers)
  facePokeCsrSBA: StorageBufferAttribute;         // uint — [offsets(N+1), list(numTri*3), triIds(numTri*3)] (packFacePokeCsr)
  facePokeContactSBA: StorageBufferAttribute;     // uint, numTriangles — per-face contact slot (soupIdx+1, 0=none; A4 Pass A writes, Pass B reads)

  // Counts
  numParticles: number;
  numTriangles: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map bend edge type to compliance (SHEAR falls back to WEFT) */
function bendEdgeTypeToCompliance(
  edgeType: number,
  fabric: FabricComplianceConfig,
): number {
  // EdgeType: 0=WARP, 1=WEFT, 2=SHEAR (SHEAR→WEFT for bending)
  switch (edgeType) {
    case 0: return fabric.bendComplianceWarp;
    case 1: return fabric.bendComplianceWeft;
    default: return fabric.bendComplianceWeft;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create all TSL storage buffer attributes for the cloth solver.
 *
 * Initial data is copied into the SBAs. When renderer.compute() first runs,
 * Three.js will upload these to GPU storage buffers automatically.
 */
export function createTslBuffers(
  mesh: ClothMeshData,
  coloredStretch: ColoredConstraints,
  bend: BendConstraints,
  seam: TslSeamConstraintData | null,
  fabricCompliance?: FabricComplianceConfig,
  tetherRadii?: Float32Array | Float64Array,
): TslBufferSet {
  const N = mesh.positions.length / 3;
  const numTri = mesh.triangles.length / 3;

  const fabric: FabricComplianceConfig = fabricCompliance ?? {
    stretchComplianceWarp: 0.0,
    stretchComplianceWeft: 0.0,
    shearCompliance: 0.001,
    bendComplianceWarp: 1.0,
    bendComplianceWeft: 1.0,
  };

  // ─── Core particle buffers ──────────────────────────────────────────
  const positionSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const prevPosSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  // #897 F2.3: snapshot pre-colisión (espejo de preCollisionBuf en
  // wasmSolverWorker). Seed = positions, igual que prevPos: si postSolve
  // corriera antes del primer snapshot, vNat = preCol - prev = 0 (benigno).
  const preCollisionPosSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const velocitySBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const invMassSBA = new StorageBufferAttribute(new Float32Array(mesh.invMass), 1);

  // ─── Body-tether (frente#2): target seeded to positions (filled in init via
  // captureTetherTargets); maxDist per-vertex from region radii. ─────────────
  const tetherTargetSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const tetherMaxDistSBA = new StorageBufferAttribute(
    tetherRadii && tetherRadii.length === N
      ? new Float32Array(tetherRadii)            // copy/convert Float64→Float32 for GPU
      : new Float32Array(N).fill(0.06),
    1,
  );

  // ─── Per-color stretch constraints with per-constraint compliance ───
  const stretchColors: StretchColorGroup[] = [];
  for (const range of coloredStretch.colorRanges) {
    const colorIds = coloredStretch.ids.slice(range.offset * 2, (range.offset + range.count) * 2);
    const colorRest = coloredStretch.restLengths.slice(range.offset, range.offset + range.count);

    // Per-constraint compliance from reordered edge types
    let colorCompliance: Float32Array;
    if (coloredStretch.compliance) {
      colorCompliance = new Float32Array(
        coloredStretch.compliance.slice(range.offset, range.offset + range.count),
      );
    } else {
      // Fallback: use shear compliance for all constraints
      colorCompliance = new Float32Array(range.count).fill(fabric.shearCompliance);
    }

    stretchColors.push({
      idsSBA: new StorageBufferAttribute(new Uint32Array(colorIds), 2),
      restLengthsSBA: new StorageBufferAttribute(new Float32Array(colorRest), 1),
      complianceSBA: new StorageBufferAttribute(colorCompliance, 1),
      count: range.count,
    });
  }

  // ─── Bend constraints (per-color, race-free — P4-1 + P1 dihedral) ────
  // P1 (spec 2026-07-02): el bend es un constraint DIHEDRAL sobre el quad
  // completo [a,b,c,d] — los rest angles del extractor (que este path antes
  // DESCARTABA para reconstruir distancias c-d) ahora son la data del kernel.
  // Coloring sobre los 4 ids (stride-4): el kernel escribe los 4 vértices;
  // colorear solo (c,d) dejaría dos hinges del mismo color compartiendo la
  // arista a,b = la race P4-1 reabierta.
  const numBend = bend.ids.length / 4;
  const bendColors: BendColorGroup[] = [];
  if (numBend > 0) {
    const bendCompliance = new Float32Array(numBend);
    for (let i = 0; i < numBend; i++) {
      // Per-constraint bend compliance: override per-quad (cross-seam,
      // acta costura-real; NaN = sin override) o mapping edge type→fabric.
      const override = bend.compliance?.[i];
      if (override !== undefined && Number.isFinite(override)) {
        bendCompliance[i] = override;
      } else {
        const edgeType = bend.edgeTypes ? bend.edgeTypes[i] : 1; // default WEFT
        bendCompliance[i] = bendEdgeTypeToCompliance(edgeType, fabric);
      }
    }

    const coloredBend = colorConstraints(bend.ids, bend.restAngles, numBend, bendCompliance, 4);
    for (const range of coloredBend.colorRanges) {
      const colorIds = coloredBend.ids.slice(range.offset * 4, (range.offset + range.count) * 4);
      const colorRest = coloredBend.restLengths.slice(range.offset, range.offset + range.count);
      const colorCompliance = coloredBend.compliance!.slice(range.offset, range.offset + range.count);
      bendColors.push({
        idsSBA: new StorageBufferAttribute(new Uint32Array(colorIds), 4),
        restAnglesSBA: new StorageBufferAttribute(new Float32Array(colorRest), 1),
        complianceSBA: new StorageBufferAttribute(new Float32Array(colorCompliance), 1),
        count: range.count,
      });
    }
  }

  // ─── Per-color seam constraints with per-constraint compliance ─────
  // Mirrors the stretchColors slicing: seam.{ids, targetDist, compliance}
  // arrive reordered by color (colorConstraints output), so each colorRange
  // is a contiguous slice (#897 F1.3).
  const seamColors: SeamColorGroup[] = [];
  const numSeam = seam ? seam.ids.length / 2 : 0;
  if (seam && numSeam > 0) {
    for (const range of seam.colorRanges) {
      const colorIds = seam.ids.slice(range.offset * 2, (range.offset + range.count) * 2);
      const colorTarget = seam.targetDist.slice(range.offset, range.offset + range.count);
      const colorCompliance = seam.compliance.slice(range.offset, range.offset + range.count);

      seamColors.push({
        idsSBA: new StorageBufferAttribute(new Uint32Array(colorIds), 2),
        targetDistSBA: new StorageBufferAttribute(new Float32Array(colorTarget), 1),
        complianceSBA: new StorageBufferAttribute(new Float32Array(colorCompliance), 1),
        count: range.count,
      });
    }
  }

  // ─── Grab tool buffers (GPU-only: init kernel writes, grab kernel reads) ──
  const grabMaskSBA = new StorageBufferAttribute(new Float32Array(N), 1);
  const grabOffsetSBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);

  // ─── Normal computation buffers ─────────────────────────────────────
  // GPU smooth normals via atomic accumulation (replaces flatShading).
  const normalSBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const normalAccumSBA = new StorageBufferAttribute(new Int32Array(N * 3), 1);
  const triangleIdsSBA = new StorageBufferAttribute(new Uint32Array(mesh.triangles), 1);

  // ─── Incident-face CSR + face-poke snapshot (face-poke v1) ────────────────
  // Build CSR from the same cloth triangle indices already uploaded as
  // triangleIdsSBA; no extra data source needed.
  const { offsets: ifOffsets, faces: ifFaces } = buildClothVertexFaces(mesh.triangles, N);
  const facePokeCsrSBA = createSBA(packFacePokeCsr(ifOffsets, ifFaces, mesh.triangles, N), 1);
  const facePokeContactSBA = createSBA(new Uint32Array(numTri), 1);

  return {
    positionSBA,
    prevPosSBA,
    preCollisionPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendColors,
    numBendConstraints: numBend,
    seamColors,
    numSeamConstraints: numSeam,
    triangles: mesh.triangles,
    grabMaskSBA,
    grabOffsetSBA,
    normalSBA,
    normalAccumSBA,
    triangleIdsSBA,
    tetherTargetSBA,
    tetherMaxDistSBA,
    facePokeCsrSBA,
    facePokeContactSBA,
    scBuffers: null,
    weldBuffers: null,
    windBuffers: null,
    numParticles: N,
    numTriangles: numTri,
  };
}

// ─── Standalone SBA factory ────────────────────────────────────────────────

/**
 * Create a StorageBufferAttribute without importing the class at the call site.
 * Centralises the `three/webgpu` value import here so that other modules
 * (e.g. gpuSolverClient) can use a type-only import and avoid the TDZ that
 * Vite's chunk splitting creates when the same specifier is imported as both
 * type and value from different chunks.
 */
export function createSBA(
  array: Float32Array | Int32Array | Uint32Array,
  itemSize: number,
): StorageBufferAttribute {
  return new StorageBufferAttribute(array, itemSize);
}

// ─── Disposal ──────────────────────────────────────────────────────────────

/**
 * Best-effort GPU buffer release for a single StorageBufferAttribute.
 *
 * Three.js 0.183 does not expose `dispose()` on `StorageBufferAttribute`; the
 * underlying `GPUBuffer` is owned by the WebGPURenderer's backend and lives
 * on `renderer.backend.get(attr).buffer`. The canonical release path is
 * `renderer._attributes.delete(attr)` → `backend.destroyAttribute(attr)`
 * → `data.buffer.destroy()` (Three.js `Attributes.js` + `WebGPUAttributeUtils.js`).
 *
 * When `renderer` is unavailable (e.g. the SBA was created but never consumed
 * by a frame, so dispose() runs without a cached renderer), this is a no-op:
 * the SBA reference is simply dropped by the caller and the WeakMap-keyed
 * backend entry becomes GC-eligible. Without an explicit `destroy()` call the
 * GPUBuffer leaks until WebGPU's own GC reclaims it (not guaranteed).
 */
export function disposeStorageBufferAttribute(
  sba: StorageBufferAttribute | null | undefined,
  renderer: unknown,
): void {
  if (!sba || !renderer) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = (renderer as any)?._attributes;
  if (!attrs || typeof attrs.delete !== 'function') return;
  try {
    attrs.delete(sba);
  } catch {
    // best-effort: dispose paths must not throw
  }
}

/**
 * Release every GPU buffer owned by a TslBufferSet.
 *
 * Iterates the 14 fixed SBA fields plus per-color bend, stretch and seam SBAs,
 * then delegates self-collision and wind buffer disposal to their owning modules.
 * See `disposeStorageBufferAttribute` for the renderer-routing rationale.
 */
export function destroyTslBufferSet(
  set: TslBufferSet,
  renderer?: unknown,
): void {
  const sbas: Array<StorageBufferAttribute | null> = [
    set.positionSBA,
    set.prevPosSBA,
    set.preCollisionPosSBA,
    set.velocitySBA,
    set.invMassSBA,
    set.normalSBA,
    set.normalAccumSBA,
    set.triangleIdsSBA,
    set.grabMaskSBA,
    set.grabOffsetSBA,
    set.tetherTargetSBA,
    set.tetherMaxDistSBA,
    set.facePokeCsrSBA,
    set.facePokeContactSBA,
  ];
  for (const color of set.bendColors) {
    sbas.push(color.idsSBA, color.restAnglesSBA, color.complianceSBA);
  }
  for (const color of set.stretchColors) {
    sbas.push(color.idsSBA, color.restLengthsSBA, color.complianceSBA);
  }
  for (const color of set.seamColors) {
    sbas.push(color.idsSBA, color.targetDistSBA, color.complianceSBA);
  }
  if (set.weldBuffers) {
    sbas.push(set.weldBuffers.vertsSBA, set.weldBuffers.offsetsSBA, set.weldBuffers.partnersSBA);
  }
  for (const sba of sbas) {
    disposeStorageBufferAttribute(sba, renderer);
  }
  if (set.scBuffers) destroySelfCollisionBuffers(set.scBuffers, renderer);
  if (set.windBuffers) destroyWindBuffers(set.windBuffers, renderer);
}

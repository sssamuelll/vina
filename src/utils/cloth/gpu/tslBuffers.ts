/**
 * TSL Buffer Setup — creates StorageBufferAttribute instances for the TSL compute solver.
 *
 * These SBAs are the single source of truth: written by renderer.compute() (solver)
 * and read by the vertex shader via material.positionNode / material.normalNode.
 *
 * @module tslBuffers
 */

import { StorageBufferAttribute } from 'three/webgpu';
import type { ClothMeshData, BendConstraints, SeamConstraintData, ColoredConstraints } from './gpuBuffers';
import type { SelfCollisionBufferSet } from './tslSelfCollision';
import { destroySelfCollisionBuffers } from './tslSelfCollision';
import type { WindBufferSet } from './tslWind';
import { destroyWindBuffers } from './tslWind';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-constraint compliance config derived from fabric properties */
export interface FabricComplianceConfig {
  stretchComplianceWarp: number;
  stretchComplianceWeft: number;
  shearCompliance: number;
  bendComplianceWarp: number;
  bendComplianceWeft: number;
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

export interface TslBufferSet {
  // Core particle buffers
  positionSBA: StorageBufferAttribute;
  prevPosSBA: StorageBufferAttribute;
  velocitySBA: StorageBufferAttribute;
  invMassSBA: StorageBufferAttribute;

  // Stretch constraints (per-color for race-free dispatch)
  stretchColors: StretchColorGroup[];

  // Bend constraints
  bendIdsSBA: StorageBufferAttribute | null;
  bendRestSBA: StorageBufferAttribute | null;
  bendComplianceSBA: StorageBufferAttribute | null;
  numBendConstraints: number;

  // Seam constraints
  seamIdsSBA: StorageBufferAttribute | null;
  seamTargetDistSBA: StorageBufferAttribute | null;
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

  // Wind accumulation buffers (null if no wind)
  windBuffers: WindBufferSet | null;

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
  seam: SeamConstraintData | null,
  fabricCompliance?: FabricComplianceConfig,
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
  const velocitySBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const invMassSBA = new StorageBufferAttribute(new Float32Array(mesh.invMass), 1);

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

  // ─── Bend constraints ───────────────────────────────────────────────
  const numBend = bend.ids.length / 4;
  let bendIdsSBA: StorageBufferAttribute | null = null;
  let bendRestSBA: StorageBufferAttribute | null = null;
  let bendComplianceSBA: StorageBufferAttribute | null = null;
  if (numBend > 0) {
    const bendRestDist = new Float32Array(numBend);
    const bendCompliance = new Float32Array(numBend);
    for (let i = 0; i < numBend; i++) {
      const c = bend.ids[i * 4 + 2];
      const d = bend.ids[i * 4 + 3];
      const dx = mesh.positions[d * 3] - mesh.positions[c * 3];
      const dy = mesh.positions[d * 3 + 1] - mesh.positions[c * 3 + 1];
      const dz = mesh.positions[d * 3 + 2] - mesh.positions[c * 3 + 2];
      bendRestDist[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Per-constraint bend compliance from edge type
      const edgeType = bend.edgeTypes ? bend.edgeTypes[i] : 1; // default WEFT
      bendCompliance[i] = bendEdgeTypeToCompliance(edgeType, fabric);
    }
    bendIdsSBA = new StorageBufferAttribute(new Uint32Array(bend.ids), 4);
    bendRestSBA = new StorageBufferAttribute(bendRestDist, 1);
    bendComplianceSBA = new StorageBufferAttribute(bendCompliance, 1);
  }

  // ─── Seam constraints ──────────────────────────────────────────────
  let seamIdsSBA: StorageBufferAttribute | null = null;
  let seamTargetDistSBA: StorageBufferAttribute | null = null;
  const numSeam = seam ? seam.ids.length / 2 : 0;
  if (seam && numSeam > 0) {
    seamIdsSBA = new StorageBufferAttribute(new Uint32Array(seam.ids), 2);
    seamTargetDistSBA = new StorageBufferAttribute(new Float32Array(seam.targetDist), 1);
  }

  // ─── Grab tool buffers (GPU-only: init kernel writes, grab kernel reads) ──
  const grabMaskSBA = new StorageBufferAttribute(new Float32Array(N), 1);
  const grabOffsetSBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);

  // ─── Normal computation buffers ─────────────────────────────────────
  // GPU smooth normals via atomic accumulation (replaces flatShading).
  const normalSBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const normalAccumSBA = new StorageBufferAttribute(new Int32Array(N * 3), 1);
  const triangleIdsSBA = new StorageBufferAttribute(new Uint32Array(mesh.triangles), 1);

  return {
    positionSBA,
    prevPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendIdsSBA,
    bendRestSBA,
    bendComplianceSBA,
    numBendConstraints: numBend,
    seamIdsSBA,
    seamTargetDistSBA,
    numSeamConstraints: numSeam,
    triangles: mesh.triangles,
    grabMaskSBA,
    grabOffsetSBA,
    normalSBA,
    normalAccumSBA,
    triangleIdsSBA,
    scBuffers: null,
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
 * Iterates the 14 fixed SBA fields plus per-color stretch SBAs, then delegates
 * self-collision and wind buffer disposal to their owning modules. See
 * `disposeStorageBufferAttribute` for the renderer-routing rationale.
 */
export function destroyTslBufferSet(
  set: TslBufferSet,
  renderer?: unknown,
): void {
  const sbas: Array<StorageBufferAttribute | null> = [
    set.positionSBA,
    set.prevPosSBA,
    set.velocitySBA,
    set.invMassSBA,
    set.normalSBA,
    set.normalAccumSBA,
    set.triangleIdsSBA,
    set.grabMaskSBA,
    set.grabOffsetSBA,
    set.bendIdsSBA,
    set.bendRestSBA,
    set.bendComplianceSBA,
    set.seamIdsSBA,
    set.seamTargetDistSBA,
  ];
  for (const color of set.stretchColors) {
    sbas.push(color.idsSBA, color.restLengthsSBA, color.complianceSBA);
  }
  for (const sba of sbas) {
    disposeStorageBufferAttribute(sba, renderer);
  }
  if (set.scBuffers) destroySelfCollisionBuffers(set.scBuffers, renderer);
  if (set.windBuffers) destroyWindBuffers(set.windBuffers, renderer);
}

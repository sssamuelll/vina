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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StretchColorGroup {
  /** Pairs of particle indices for this color [a,b, a,b, ...] */
  idsSBA: StorageBufferAttribute;
  /** Rest lengths for this color */
  restLengthsSBA: StorageBufferAttribute;
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
  numBendConstraints: number;

  // Seam constraints
  seamIdsSBA: StorageBufferAttribute | null;
  seamTargetDistSBA: StorageBufferAttribute | null;
  numSeamConstraints: number;

  // Triangle index buffer (for CPU normal computation)
  triangles: Uint32Array;

  // Counts
  numParticles: number;
  numTriangles: number;
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
): TslBufferSet {
  const N = mesh.positions.length / 3;
  const numTri = mesh.triangles.length / 3;

  // ─── Core particle buffers ──────────────────────────────────────────
  const positionSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const prevPosSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const velocitySBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
  const invMassSBA = new StorageBufferAttribute(new Float32Array(mesh.invMass), 1);

  // ─── Per-color stretch constraints ──────────────────────────────────
  const stretchColors: StretchColorGroup[] = [];
  for (const range of coloredStretch.colorRanges) {
    const colorIds = coloredStretch.ids.slice(range.offset * 2, (range.offset + range.count) * 2);
    const colorRest = coloredStretch.restLengths.slice(range.offset, range.offset + range.count);

    stretchColors.push({
      idsSBA: new StorageBufferAttribute(new Uint32Array(colorIds), 2),
      restLengthsSBA: new StorageBufferAttribute(new Float32Array(colorRest), 1),
      count: range.count,
    });
  }

  // ─── Bend constraints ───────────────────────────────────────────────
  const numBend = bend.ids.length / 4;
  let bendIdsSBA: StorageBufferAttribute | null = null;
  let bendRestSBA: StorageBufferAttribute | null = null;
  if (numBend > 0) {
    bendIdsSBA = new StorageBufferAttribute(new Uint32Array(bend.ids), 4);
    bendRestSBA = new StorageBufferAttribute(new Float32Array(bend.restAngles), 1);
  }

  // ─── Seam constraints ──────────────────────────────────────────────
  let seamIdsSBA: StorageBufferAttribute | null = null;
  let seamTargetDistSBA: StorageBufferAttribute | null = null;
  const numSeam = seam ? seam.ids.length / 2 : 0;
  if (seam && numSeam > 0) {
    seamIdsSBA = new StorageBufferAttribute(new Uint32Array(seam.ids), 2);
    seamTargetDistSBA = new StorageBufferAttribute(new Float32Array(seam.targetDist), 1);
  }

  return {
    positionSBA,
    prevPosSBA,
    velocitySBA,
    invMassSBA,
    stretchColors,
    bendIdsSBA,
    bendRestSBA,
    numBendConstraints: numBend,
    seamIdsSBA,
    seamTargetDistSBA,
    numSeamConstraints: numSeam,
    triangles: mesh.triangles,
    numParticles: N,
    numTriangles: numTri,
  };
}

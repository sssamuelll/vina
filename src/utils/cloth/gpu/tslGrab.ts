/**
 * TSL Grab Compute — single-pass per-particle position displacement for mesh grab tool.
 *
 * Dispatched once per frame (after substeps + brush, before normals). Each GPU thread
 * checks if its particle has a non-zero grab mask (set on pointer-down). If so, the
 * particle position is lerped toward the grab target (grabCenter + offset) weighted by
 * the per-particle falloff mask.
 *
 * @module tslGrab
 */

import {
  Fn,
  compute,
  uniform,
  float,
  uint,
  instanceIndex,
  If,
  mix,
} from 'three/tsl';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GrabComputeNodes {
  /** Per-particle grab position displacement compute node */
  grabNode: TslNode;
  /** Grab center X uniform — update .value at runtime */
  grabCenterX: { value: number };
  /** Grab center Y uniform — update .value at runtime */
  grabCenterY: { value: number };
  /** Grab center Z uniform — update .value at runtime */
  grabCenterZ: { value: number };
  /** Grab active flag (0 = inactive, 1 = active) — update .value at runtime */
  grabActive: { value: number };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the TSL compute node for mesh grab position displacement.
 *
 * @param posBufNode        - Cloth particle positions (vec3 storage, shared with solver)
 * @param grabMaskBufNode   - Per-particle falloff mask (float storage, 0 = free, >0 = falloff)
 * @param grabOffsetBufNode - Per-particle vec3 offset from grab center
 * @param numParticles      - Number of particles in the mesh
 */
export function makeGrabComputeNode(
  posBufNode: TslNode,
  grabMaskBufNode: TslNode,
  grabOffsetBufNode: TslNode,
  numParticles: number,
): GrabComputeNodes {
  const N = numParticles;

  // ─── Uniforms (exposed for runtime updates) ─────────────────────
  const uGrabCenterX = uniform(0.0);
  const uGrabCenterY = uniform(0.0);
  const uGrabCenterZ = uniform(0.0);
  const uGrabActive = uniform(0.0); // 0 = inactive, 1 = active

  // ─── Single-pass: per-particle grab displacement ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grabFn = (Fn as any)(() => {
    const i = instanceIndex;

    // Bounds guard: workgroup size (64) may exceed N in the last group.
    If(uint(i).lessThan(uint(N)), () => {
      // Skip if grab is inactive
      If(uGrabActive.greaterThan(float(0.0)), () => {
        const mask = grabMaskBufNode.element(i);

        // Only affect grabbed particles (mask > 0)
        If(mask.greaterThan(float(0.0)), () => {
          // Read offset from grab center
          const offset = grabOffsetBufNode.element(i);

          // Target = grabCenter + offset
          const tx = uGrabCenterX.add(offset.x);
          const ty = uGrabCenterY.add(offset.y);
          const tz = uGrabCenterZ.add(offset.z);

          // Lerp position toward target, weighted by falloff mask
          posBufNode.element(i).x.assign(mix(posBufNode.element(i).x, tx, mask));
          posBufNode.element(i).y.assign(mix(posBufNode.element(i).y, ty, mask));
          posBufNode.element(i).z.assign(mix(posBufNode.element(i).z, tz, mask));
        });
      });
    });
  })();

  const grabNode = compute(grabFn, N, [64]);

  return {
    grabNode,
    grabCenterX: uGrabCenterX,
    grabCenterY: uGrabCenterY,
    grabCenterZ: uGrabCenterZ,
    grabActive: uGrabActive,
  };
}

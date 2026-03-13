/**
 * TSL Grab Compute — GPU-only per-particle position lerp for mesh grab tool.
 *
 * Two-kernel approach:
 * 1. grabInitNode — dispatched ONCE on grab start. Each GPU thread computes its
 *    distance to the grab center and writes per-particle mask + offset to storage
 *    buffers entirely on GPU (no CPU→GPU upload needed).
 * 2. grabNode — dispatched each substep. Lerps grabbed particles toward
 *    grabCenter + offset, weighted by the per-particle falloff mask.
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
  /** One-shot kernel: fills mask + offset on GPU. Dispatch once per grab start. */
  grabInitNode: TslNode;
  /** Per-substep position lerp kernel */
  grabNode: TslNode;
  /** Grab center X uniform — update .value at runtime */
  grabCenterX: { value: number };
  /** Grab center Y uniform — update .value at runtime */
  grabCenterY: { value: number };
  /** Grab center Z uniform — update .value at runtime */
  grabCenterZ: { value: number };
  /** Grab radius uniform — update .value at runtime */
  grabRadius: { value: number };
  /** Grab strength uniform (0-1) — update .value at runtime */
  grabStrength: { value: number };
  /** Grab active flag (0 = inactive, 1 = active) — update .value at runtime */
  grabActive: { value: number };
  /** Init pending flag (1 = dispatch grabInitNode, then set to 0) */
  grabInitPending: { value: number };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create TSL compute nodes for mesh grab.
 *
 * @param posBufNode        - Cloth particle positions (vec3 storage)
 * @param invMassBufNode    - Inverse mass per particle (float storage)
 * @param grabMaskBufNode   - Per-particle falloff mask (float storage, GPU-only)
 * @param grabOffsetBufNode - Per-particle offset from grab center (vec3 storage, GPU-only)
 * @param numParticles      - Number of particles in the mesh
 */
export function makeGrabComputeNode(
  posBufNode: TslNode,
  invMassBufNode: TslNode,
  grabMaskBufNode: TslNode,
  grabOffsetBufNode: TslNode,
  numParticles: number,
): GrabComputeNodes {
  const N = numParticles;

  // ─── Uniforms (exposed for runtime updates) ─────────────────────
  const uGrabCenterX = uniform(0.0);
  const uGrabCenterY = uniform(0.0);
  const uGrabCenterZ = uniform(0.0);
  const uGrabRadius = uniform(0.05);
  const uGrabStrength = uniform(0.8);
  const uGrabActive = uniform(0.0);      // 0 = inactive, 1 = active
  const uGrabInitPending = uniform(0.0); // 1 = needs init dispatch

  // ─── Init kernel: fill mask + offset on GPU ────────────────────────
  // Dispatched ONCE when grab starts. Writes per-particle data that the
  // main grab kernel reads each substep. No CPU→GPU upload needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initFn = (Fn as any)(() => {
    const i = instanceIndex;
    If(uint(i).lessThan(uint(N)), () => {
      // Default: clear mask (not grabbed)
      grabMaskBufNode.element(i).assign(float(0.0));
      grabOffsetBufNode.element(i).x.assign(float(0.0));
      grabOffsetBufNode.element(i).y.assign(float(0.0));
      grabOffsetBufNode.element(i).z.assign(float(0.0));

      // Skip pinned particles
      const invMass = invMassBufNode.element(i);
      If(invMass.greaterThan(float(0.0)), () => {
        const px = posBufNode.element(i).x;
        const py = posBufNode.element(i).y;
        const pz = posBufNode.element(i).z;

        const dx = px.sub(uGrabCenterX);
        const dy = py.sub(uGrabCenterY);
        const dz = pz.sub(uGrabCenterZ);
        const distSq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
        const radiusSq = uGrabRadius.mul(uGrabRadius);

        If(distSq.lessThan(radiusSq), () => {
          const dist = distSq.sqrt();
          // Falloff: 1 at center, 0 at edge, scaled by strength
          const mask = float(1.0).sub(dist.div(uGrabRadius)).mul(uGrabStrength);
          grabMaskBufNode.element(i).assign(mask);

          // Offset = particle position - grab center
          grabOffsetBufNode.element(i).x.assign(dx);
          grabOffsetBufNode.element(i).y.assign(dy);
          grabOffsetBufNode.element(i).z.assign(dz);
        });
      });
    });
  })();

  const grabInitNode = compute(initFn, N, [64]);

  // ─── Main kernel: lerp grabbed particles toward target ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grabFn = (Fn as any)(() => {
    const i = instanceIndex;
    If(uint(i).lessThan(uint(N)), () => {
      If(uGrabActive.greaterThan(float(0.0)), () => {
        const invMass = invMassBufNode.element(i);
        If(invMass.greaterThan(float(0.0)), () => {
          const mask = grabMaskBufNode.element(i);
          If(mask.greaterThan(float(0.0)), () => {
            const offset = grabOffsetBufNode.element(i);

            // Target = grabCenter + offset (preserves cloth shape)
            const tx = uGrabCenterX.add(offset.x);
            const ty = uGrabCenterY.add(offset.y);
            const tz = uGrabCenterZ.add(offset.z);

            // Lerp position toward target weighted by mask
            posBufNode.element(i).x.assign(mix(posBufNode.element(i).x, tx, mask));
            posBufNode.element(i).y.assign(mix(posBufNode.element(i).y, ty, mask));
            posBufNode.element(i).z.assign(mix(posBufNode.element(i).z, tz, mask));
          });
        });
      });
    });
  })();

  const grabNode = compute(grabFn, N, [64]);

  return {
    grabInitNode,
    grabNode,
    grabCenterX: uGrabCenterX,
    grabCenterY: uGrabCenterY,
    grabCenterZ: uGrabCenterZ,
    grabRadius: uGrabRadius,
    grabStrength: uGrabStrength,
    grabActive: uGrabActive,
    grabInitPending: uGrabInitPending,
  };
}

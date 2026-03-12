/**
 * TSL Brush Compute — single-pass per-particle velocity damping for steam brush.
 *
 * Dispatched once per frame (after substeps, before normals). Each GPU thread
 * checks if its particle is within the brush sphere. If so, velocity is damped
 * with linear distance falloff. Pinned particles (invMass=0) are skipped.
 *
 * @module tslBrush
 */

import {
  Fn,
  compute,
  uniform,
  float,
  uint,
  instanceIndex,
  If,
} from 'three/tsl';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrushComputeNodes {
  /** Per-particle brush damping compute node */
  brushNode: TslNode;
  /** Brush center X uniform — update .value at runtime */
  centerX: { value: number };
  /** Brush center Y uniform — update .value at runtime */
  centerY: { value: number };
  /** Brush center Z uniform — update .value at runtime */
  centerZ: { value: number };
  /** Brush radius uniform — update .value at runtime */
  radius: { value: number };
  /** Brush strength uniform (0-1) — update .value at runtime */
  strength: { value: number };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the TSL compute node for steam brush velocity damping.
 *
 * @param posBufNode    - Cloth particle positions (vec3 storage, shared with solver)
 * @param velBufNode    - Cloth particle velocities (vec3 storage, shared with solver)
 * @param invMassBufNode - Inverse mass per particle (float storage, shared with solver)
 * @param numParticles  - Number of particles in the mesh
 */
export function makeBrushComputeNode(
  posBufNode: TslNode,
  velBufNode: TslNode,
  invMassBufNode: TslNode,
  numParticles: number,
): BrushComputeNodes {
  const N = numParticles;

  // ─── Uniforms (exposed for runtime updates) ─────────────────────
  const uCenterX = uniform(0.0);
  const uCenterY = uniform(0.0);
  const uCenterZ = uniform(0.0);
  const uRadius = uniform(0.05);
  const uStrength = uniform(0.0); // 0 = no damping (inactive)

  // ─── Single-pass: per-particle brush damping ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brushFn = (Fn as any)(() => {
    const i = instanceIndex;

    // Bounds guard: workgroup size (64) may exceed N in the last group.
    If(uint(i).lessThan(uint(N)), () => {
      // Skip if brush is inactive (strength == 0)
      If(uStrength.greaterThan(float(0.0)), () => {
        // Skip pinned/frozen particles (invMass == 0)
        const invMass = invMassBufNode.element(i);
        If(invMass.greaterThan(float(0.0)), () => {
          // Distance from particle to brush center
          const pos = posBufNode.element(i);
          const dx = pos.x.sub(uCenterX);
          const dy = pos.y.sub(uCenterY);
          const dz = pos.z.sub(uCenterZ);
          const distSq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
          const radiusSq = uRadius.mul(uRadius);

          If(distSq.lessThan(radiusSq), () => {
            // Linear falloff: full strength at center, zero at edge
            const dist = distSq.sqrt();
            const falloff = float(1.0).sub(dist.div(uRadius));
            const dampFactor = float(1.0).sub(uStrength.mul(falloff));

            // Damp velocity
            velBufNode.element(i).x.mulAssign(dampFactor);
            velBufNode.element(i).y.mulAssign(dampFactor);
            velBufNode.element(i).z.mulAssign(dampFactor);
          });
        });
      });
    });
  })();

  const brushNode = compute(brushFn, N, [64]);

  return {
    brushNode,
    centerX: uCenterX,
    centerY: uCenterY,
    centerZ: uCenterZ,
    radius: uRadius,
    strength: uStrength,
  };
}

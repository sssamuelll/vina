import { wrapPanel, type WrapParams } from './wrapPanel';
import type { SurfaceFrame, V3 } from './surfaceFrame';

/**
 * Apply wrapPanel to every vertex of a flat mesher mesh. Pure.
 *
 * `flip` is the M4-C in-plane 180° correction: real CAD patterns make no
 * orientation promise, so a piece may be drawn anatomy-DOWN. The rigid
 * placement righted it via an Euler flip baked into `placement.rotation`; the
 * wrap replaces that rotation, so the flip must be reapplied here instead.
 * When `flip`, each local vertex `[x, y, z] → [-x, y, -z]` (negate the in-plane
 * width and length axes) BEFORE wrapPanel — wrapPanel itself is unchanged.
 * Default `flip = false` keeps Task-4 callers/tests valid.
 */
export function wrapPlacedMesh(
  localVertices: Float32Array,
  frame: SurfaceFrame,
  params: WrapParams,
  flip: boolean = false,
): Float32Array {
  const out = new Float32Array(localVertices.length);
  const lv: V3 = [0, 0, 0];
  for (let i = 0; i < localVertices.length; i += 3) {
    if (flip) {
      lv[0] = -localVertices[i]; lv[1] = localVertices[i + 1]; lv[2] = -localVertices[i + 2];
    } else {
      lv[0] = localVertices[i]; lv[1] = localVertices[i + 1]; lv[2] = localVertices[i + 2];
    }
    const w = wrapPanel(lv, frame, params);
    out[i] = w[0]; out[i + 1] = w[1]; out[i + 2] = w[2];
  }
  return out;
}

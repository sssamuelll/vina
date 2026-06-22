import { wrapPanel, type WrapParams } from './wrapPanel';
import type { SurfaceFrame, V3 } from './surfaceFrame';

/** Apply wrapPanel to every vertex of a flat mesher mesh. Pure. */
export function wrapPlacedMesh(
  localVertices: Float32Array,
  frame: SurfaceFrame,
  params: WrapParams,
): Float32Array {
  const out = new Float32Array(localVertices.length);
  const lv: V3 = [0, 0, 0];
  for (let i = 0; i < localVertices.length; i += 3) {
    lv[0] = localVertices[i]; lv[1] = localVertices[i + 1]; lv[2] = localVertices[i + 2];
    const w = wrapPanel(lv, frame, params);
    out[i] = w[0]; out[i + 1] = w[1]; out[i + 2] = w[2];
  }
  return out;
}

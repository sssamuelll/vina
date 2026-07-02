import * as THREE from 'three';
import type { SurfaceFrame, V3 } from './surfaceFrame';

export interface WrapParams {
  /** Wrap-angle cap in RADIANS (e.g. 2.618 ≈ 150°). */
  thetaMaxRad: number;
  /** Standoff from the body surface, meters (e.g. 0.03). */
  gap: number;
}

const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Curve a flat mesher-local vertex over the region cylinder, then place it.
 * localVert = [x, yConst, z]: local +X = width (circumference), +Z = length
 * (along axis); yConst (the flat mesher height) is ignored. The result is a
 * world point at distance (frame.radius + gap) from the axis line — outside
 * the body.
 *
 * ISOMETRIC parameterization: φ = w / (R + gap), i.e. the arc is measured at
 * the radius the cloth actually LIVES at, so arc lengths (and therefore rest
 * lengths) are preserved by the wrap. The previous φ = w / R measured the arc
 * on the BODY radius while placing the cloth at R + gap — over-curving the
 * panel ×(R+gap)/R, piling the overshoot onto the ±thetaMax/2 clamp lines and
 * pre-stretching the rest (the sleeve "pillow"/box bug, plan §6bis).
 */
export function wrapPanel(localVert: V3, frame: SurfaceFrame, params: WrapParams): V3 {
  const w = localVert[0]; // width → circumference
  const u = localVert[2]; // length → along axis
  const rCloth = frame.radius + params.gap; // where the cloth lives — measure the arc here too
  const axis = v(frame.axis).normalize();
  const normal = v(frame.normal).normalize();
  // radial binormal in the plane ⊥ axis (axis × normal is non-degenerate per Task 2)
  const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
  const half = params.thetaMaxRad / 2;
  const phi = Math.max(-half, Math.min(half, w / rCloth));
  const radial = normal.clone().multiplyScalar(Math.cos(phi))
    .add(binormal.clone().multiplyScalar(Math.sin(phi)));
  const point = v(frame.point);
  const out = point
    .add(axis.multiplyScalar(u))
    .add(radial.multiplyScalar(rCloth));
  return [out.x, out.y, out.z];
}

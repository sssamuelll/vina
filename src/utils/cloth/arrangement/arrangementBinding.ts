/**
 * resolveArrangement — compose the collision-aware auto pose with a per-piece
 * binding delta, ONCE (frozen) (#887 Phase 1).
 *
 * Grading-safe format: `posDelta` is in the landmark's local frame, `rotDelta`
 * is a quaternion relative to the surface frame, so a graded size re-derives the
 * auto frame (deriveDimensions) and the delta rides along. Legacy `[x,y,z]`
 * overrides are world-space position replacements (back-compat; NOT grading-safe).
 * Skeleton-not-ready resolves with the parametric default axis — never snaps to
 * the world origin (which would seed the avatar with an in-body NaN cascade).
 */
import * as THREE from 'three';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';
import { computeAutoFrame, detectBodyRegion, outlineBBox, type PlacementResult } from '../garmentPlacement';
import type { V3 } from './surfaceFrame';

export interface ArrangementBinding {
  space: 'frame';
  posDelta: V3;                                  // in the auto frame's local basis
  rotDelta: [number, number, number, number];    // quaternion relative to the auto frame
}

export type ArrangementOverride = ArrangementBinding | V3;

function isBinding(o: ArrangementOverride): o is ArrangementBinding {
  return !Array.isArray(o) && (o as ArrangementBinding).space === 'frame';
}

function pieceGeometryOf(p: PatternPiece): { widthMm: number; heightMm: number } {
  const { width, height } = outlineBBox(p.outline); // reuse garmentPlacement helper (no duplication)
  return { widthMm: width, heightMm: height };
}

export function resolveArrangement(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
  overrides: Record<string, ArrangementOverride> | undefined,
  opts?: { skeletonReady?: boolean; axisHints?: Record<string, V3> },
): PlacementResult[] {
  return pieces.map((p) => {
    const region = detectBodyRegion(p);
    // Skeleton not ready → ignore bone axis hints, use the parametric default.
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    const { placement, frame } = computeAutoFrame(region, measurements, pieceGeometryOf(p), axisHint);

    const ov = overrides?.[p.id];
    if (!ov) return placement;

    if (!isBinding(ov)) {
      // Legacy world-space position override (back-compat, position only).
      return { position: ov, rotation: placement.rotation };
    }

    // Frame-delta compose: posDelta in the frame basis, rotDelta relative to the frame.
    const n = new THREE.Vector3(...frame.normal).normalize();
    const t = new THREE.Vector3(...frame.tangent).normalize();
    const b = new THREE.Vector3().crossVectors(n, t).normalize();
    const worldPosDelta = b.clone().multiplyScalar(ov.posDelta[0])
      .add(n.clone().multiplyScalar(ov.posDelta[1]))
      .add(t.clone().multiplyScalar(ov.posDelta[2]));
    const position: V3 = [
      placement.position[0] + worldPosDelta.x,
      placement.position[1] + worldPosDelta.y,
      placement.position[2] + worldPosDelta.z,
    ];
    const autoQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
    );
    const deltaQ = new THREE.Quaternion(ov.rotDelta[0], ov.rotDelta[1], ov.rotDelta[2], ov.rotDelta[3]);
    const e = new THREE.Euler().setFromQuaternion(autoQ.multiply(deltaQ), 'XYZ');
    return { position, rotation: [e.x, e.y, e.z] };
  });
}

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
import { computeAutoFrame, detectBodyRegion, outlineBBox, placeGarmentPieces, type PlacementResult } from '../garmentPlacement';
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
  // Build the normalized, deterministic batch placement in ONE pass.
  // This is the single source of truth for both the arrange view (Viewport3D)
  // and the solver/autoSew path (GarmentSimulation / autoSewThunk), fixing:
  //   Important-1: M4-C anatomy normalization (normalizeInPlaneOrientation) was
  //     skipped, causing arrange-view vs solver orientation split-brain.
  //   Important-2: detectBodyRegion toggle state (_sleeveToggle/_cuffToggle) was
  //     not reset before per-piece calls, producing non-deterministic L/R
  //     assignment for side-less sleeve/cuff pairs across the two paths.
  const autoPlacements = placeGarmentPieces(pieces, measurements);

  return pieces.map((p, i) => {
    const autoPlacement = autoPlacements[i];

    const ov = overrides?.[p.id];
    if (!ov) return autoPlacement;

    if (!isBinding(ov)) {
      // Legacy world-space position override (back-compat, position only).
      return { position: ov, rotation: autoPlacement.rotation };
    }

    // Frame-delta compose: posDelta in the frame basis, rotDelta relative to the frame.
    // NOTE: this branch is Phase-2 territory — no ArrangementBinding deltas are written
    // in Phase 1; only the unit test exercises it. Phase 2 must lock the region used
    // here to the same one placeGarmentPieces assigned (to keep the delta semantically
    // anchored to the normalized auto frame, not a fresh detectBodyRegion call that
    // could diverge due to toggle state or skeleton-hint differences).
    // Skeleton not ready → ignore bone axis hints, use the parametric default.
    const region = detectBodyRegion(p);
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    const { frame } = computeAutoFrame(region, measurements, pieceGeometryOf(p), axisHint);

    const n = new THREE.Vector3(...frame.normal).normalize();
    const t = new THREE.Vector3(...frame.tangent).normalize();
    const b = new THREE.Vector3().crossVectors(n, t).normalize();
    const worldPosDelta = b.clone().multiplyScalar(ov.posDelta[0])
      .add(n.clone().multiplyScalar(ov.posDelta[1]))
      .add(t.clone().multiplyScalar(ov.posDelta[2]));
    const position: V3 = [
      autoPlacement.position[0] + worldPosDelta.x,
      autoPlacement.position[1] + worldPosDelta.y,
      autoPlacement.position[2] + worldPosDelta.z,
    ];
    const autoQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(autoPlacement.rotation[0], autoPlacement.rotation[1], autoPlacement.rotation[2], 'XYZ'),
    );
    const deltaQ = new THREE.Quaternion(ov.rotDelta[0], ov.rotDelta[1], ov.rotDelta[2], ov.rotDelta[3]);
    const e = new THREE.Euler().setFromQuaternion(autoQ.multiply(deltaQ), 'XYZ');
    return { position, rotation: [e.x, e.y, e.z] };
  });
}

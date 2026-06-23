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
import { ANATOMY_BOTTOM_ROOTS, ANATOMY_TOP_ROOTS, anatomyLocalEndpoints, computeAutoFrame, computeEffectiveRegions, deriveDimensions, detectBodyRegion, outlineBBox, placeGarmentPieces, type BodyRegion, type PlacementResult } from '../garmentPlacement';
import { surfaceFrame, type SurfaceFrame, type V3 } from './surfaceFrame';
import { wrapPanel } from './wrapPanel';
import { DEFAULT_WRAP } from './wrapParams';

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

export interface PlacementWithFrame {
  placement: PlacementResult;
  frame: SurfaceFrame;
  /**
   * M4-C in-plane 180° flag for the WRAP: the piece's 2D anatomy is drawn
   * upside-down, so the wrap must pre-flip its local vertices
   * (`wrapPlacedMesh(..., flip)`).
   *
   * IMPORTANT — this is NOT `garmentPlacement.computeFlipFlags` (the rigid-Euler
   * oracle that `normalizeInPlaneOrientation` uses). The rigid placement and the
   * wrap map local→world differently (the rigid path's per-region base Euler vs
   * the wrap's `axis`/`binormal` basis), so the two flips DISAGREE on
   * front-torso and collar for María's real pieces. The flip must be measured in
   * the space it is applied — here, wrap space — or anatomy lands upside-down.
   * `false` for pieces with no anatomical evidence. (wrapOrientation.test.ts is
   * the safety net that caught the rigid-flag-into-wrap mismatch.)
   */
  flip: boolean;
}

/** Mean of `axis·(wrappedPoint − frame.point)` over a region's anatomy edges =
 * mean local-z along the wrap axis (proximal/distal for sleeves, low/high for
 * upright regions). null when the piece carries no matching edge. */
function meanAxisProjection(
  pieceOutlineEndpoints: Array<[number, number, number]>,
  frame: SurfaceFrame,
): number | null {
  if (pieceOutlineEndpoints.length === 0) return null;
  const [ax, ay, az] = frame.axis;
  const al = Math.hypot(ax, ay, az) || 1;
  const [px, py, pz] = frame.point;
  let sum = 0;
  for (const lv of pieceOutlineEndpoints) {
    const w = wrapPanel(lv, frame, DEFAULT_WRAP);
    sum += ((w[0] - px) * ax + (w[1] - py) * ay + (w[2] - pz) * az) / al;
  }
  return sum / pieceOutlineEndpoints.length;
}

/**
 * Per-piece flip flags for the WRAP, measured in wrap space (see PlacementWithFrame.flip).
 * Flip when the anatomical TOP would land on the wrong side of the wrap axis vs
 * the BOTTOM: for sleeves TOP (sleeveCap) must be PROXIMAL (smaller axis
 * projection = closer to the shoulder); for upright regions TOP must be HIGHER
 * along the axis. Pieces without top+bottom anatomical evidence flag `false`.
 */
export function computeWrapFlipFlags(
  pieces: PatternPiece[],
  frames: SurfaceFrame[],
  regions: BodyRegion[],
): boolean[] {
  return pieces.map((p, i) => {
    const frame = frames[i];
    const topProj = meanAxisProjection(anatomyLocalEndpoints(p, ANATOMY_TOP_ROOTS), frame);
    const botProj = meanAxisProjection(anatomyLocalEndpoints(p, ANATOMY_BOTTOM_ROOTS), frame);
    if (topProj == null || botProj == null) return false;
    const isSleeve = regions[i] === 'left-sleeve' || regions[i] === 'right-sleeve'
      || regions[i] === 'cuff-left' || regions[i] === 'cuff-right';
    // Upright when: sleeves → TOP proximal (topProj < botProj);
    //               others → TOP high (topProj > botProj). Flip otherwise.
    return isSleeve ? topProj > botProj : topProj < botProj;
  });
}

/**
 * Sibling of `resolveArrangement` that also returns the per-piece body
 * `SurfaceFrame` (#887 / envelope-wrap Task 4), so the wrap step (Task 5) can
 * curve each piece's vertices over the region cylinder.
 *
 * The placement is `resolveArrangement`'s OWN output (reused verbatim — no
 * divergence: the M4 sonda, GarmentSimulation and autoSewThunk all key off
 * `resolveArrangement`, so this must not re-derive a parallel pose). The frame
 * is `surfaceFrame(region, dims, axisHint)` using the SAME deterministic
 * regions `placeGarmentPieces` assigns (`computeEffectiveRegions`) — NOT a
 * fresh per-piece `detectBodyRegion`, which would re-run the L/R toggles and
 * could curve the left sleeve onto the right arm (the bug arrangementBinding.ts
 * already warns about). `axisHint` is gated identically to `resolveArrangement`.
 */
export function resolveArrangementWithFrames(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
  overrides: Record<string, ArrangementOverride> | undefined,
  opts?: { skeletonReady?: boolean; axisHints?: Record<string, V3> },
): PlacementWithFrame[] {
  const regions = computeEffectiveRegions(pieces);
  const placements = resolveArrangement(pieces, measurements, overrides, opts);
  const dims = deriveDimensions(measurements);

  const frames = pieces.map((p, i) => {
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    return surfaceFrame(regions[i], dims, axisHint);
  });

  // M4-C flip flags measured in WRAP space (NOT the rigid computeFlipFlags —
  // see PlacementWithFrame.flip). The wrap basis differs from the rigid Euler,
  // so the flip must be decided against the actual frame+wrapPanel mapping.
  const flips = computeWrapFlipFlags(pieces, frames, regions);

  return pieces.map((_p, i) => ({ placement: placements[i], frame: frames[i], flip: flips[i] }));
}

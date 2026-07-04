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
import { ANATOMY_BOTTOM_ROOTS, ANATOMY_TOP_ROOTS, anatomyLocalEndpoints, computeAutoFrame, computeEffectiveRegions, deriveDimensions, outlineBBox, placeGarmentPieces, type BodyRegion, type PlacementResult } from '../garmentPlacement';
import { surfaceFrame, type SurfaceFrame, type V3 } from './surfaceFrame';
import { wrapPanel } from './wrapPanel';
import { DEFAULT_WRAP, wrapParamsForRegion } from './wrapParams';
import type { WrapParams } from './wrapPanel';

export interface ArrangementBinding {
  space: 'frame';
  posDelta: V3;                                  // in the auto frame's local basis
  rotDelta: [number, number, number, number];    // quaternion relative to the auto frame
  /** Proveniencia del contrato de colocación (consejo 2026-07-03): el anchor
   *  point elegido (`region.ringN.bearing`), escrito por el click del humano
   *  o el tool del agente. Hoy informativo; la re-resolución contra el mapa
   *  vivo (anchor-tracking) es follow-up con nombre. */
  anchorId?: string;
}

export type ArrangementOverride = ArrangementBinding | V3;

/** Guard del contrato: V3 legacy (array) vs binding frame-delta (objeto). */
export function isBinding(o: ArrangementOverride): o is ArrangementBinding {
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
  return resolveArrangementCore(pieces, measurements, overrides, opts).placements;
}

/**
 * Core compartido: además de los placements resueltos expone los AUTO
 * placements, para que `resolveArrangementWithFrames` pueda componer el DELTA
 * del override dentro del frame del wrap (fix del drag no-op, consejo
 * 2026-07-03 / hallazgo Halberg §4: post-envelope-wrap el solver siembra vía
 * `wrapPlacedMesh(frame, …)` y `placement.position` no se componía nunca —
 * el drag del usuario era un no-op silencioso con costo de recompute).
 */
function resolveArrangementCore(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
  overrides: Record<string, ArrangementOverride> | undefined,
  opts?: { skeletonReady?: boolean; axisHints?: Record<string, V3> },
): { placements: PlacementResult[]; autoPlacements: PlacementResult[] } {
  // Build the normalized, deterministic batch placement in ONE pass.
  // This is the single source of truth for both the arrange view (Viewport3D)
  // and the solver/autoSew path (GarmentSimulation / autoSewThunk), fixing:
  //   Important-1: M4-C anatomy normalization (normalizeInPlaneOrientation) was
  //     skipped, causing arrange-view vs solver orientation split-brain.
  //   Important-2: detectBodyRegion toggle state (_sleeveToggle/_cuffToggle) was
  //     not reset before per-piece calls, producing non-deterministic L/R
  //     assignment for side-less sleeve/cuff pairs across the two paths.
  // axisHints (tilt A-pose): the batch uses the SAME hinted frames the
  // override branch and the wrap already used — sleeve cards lean along the
  // real arm. Same skeleton gating as everywhere else in this file.
  const hints = opts?.skeletonReady === false ? undefined : opts?.axisHints;
  const autoPlacements = placeGarmentPieces(pieces, measurements, { axisHints: hints });
  // Region lock (consejo 2026-07-03, cierre del bug latente que este archivo
  // documentaba): el branch de binding usa las MISMAS regiones deterministas
  // que placeGarmentPieces asignó — nunca un detectBodyRegion fresco cuyo
  // toggle L/R puede divergir.
  const effRegions = computeEffectiveRegions(pieces);

  const placements = pieces.map((p, i) => {
    const autoPlacement = autoPlacements[i];

    const ov = overrides?.[p.id];
    if (!ov) return autoPlacement;

    if (!isBinding(ov)) {
      // Legacy world-space position override (back-compat, position only).
      return { position: ov, rotation: autoPlacement.rotation };
    }

    // Frame-delta compose: posDelta in the frame basis, rotDelta relative to the frame.
    // Skeleton not ready → ignore bone axis hints, use the parametric default.
    const region = effRegions[i];
    const { frame } = computeAutoFrame(region, measurements, pieceGeometryOf(p), hints?.[p.id]);

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
    return { position, rotation: [e.x, e.y, e.z] as [number, number, number] };
  });

  return { placements, autoPlacements };
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
  /** Per-region wrap coverage (sleeves wrap fuller; others = DEFAULT_WRAP).
   *  Render and solver MUST both use this — see the design doc. */
  wrapParams: WrapParams;
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
  const { placements, autoPlacements } = resolveArrangementCore(pieces, measurements, overrides, opts);
  const dims = deriveDimensions(measurements);

  const frames = pieces.map((p, i) => {
    const axisHint = opts?.skeletonReady === false ? undefined : opts?.axisHints?.[p.id];
    // pieceLength keeps this frame in lockstep with computeAutoFrame's (both
    // anchor the sleeve-cap edge at the shoulder — see surfaceFrame).
    const f = surfaceFrame(regions[i], dims, axisHint, pieceGeometryOf(p).heightMm * 0.001);
    // Fix del drag no-op (consejo 2026-07-03, Halberg §4): el delta del
    // override (drag legacy [x,y,z] O binding frame-delta) se compone como
    // traslación rígida del FRAME del wrap — el mismo delta que la vista
    // rígida aplica a placement.position. Sin override, delta = 0 y el frame
    // queda bit-idéntico (los flips M4-C son invariantes a la traslación:
    // comparan proyecciones RELATIVAS al point). Rotación fina del override:
    // POST (triage del consejo).
    const dx = placements[i].position[0] - autoPlacements[i].position[0];
    const dy = placements[i].position[1] - autoPlacements[i].position[1];
    const dz = placements[i].position[2] - autoPlacements[i].position[2];
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      return { ...f, point: [f.point[0] + dx, f.point[1] + dy, f.point[2] + dz] as V3 };
    }
    return f;
  });

  // M4-C flip flags measured in WRAP space (NOT the rigid computeFlipFlags —
  // see PlacementWithFrame.flip). The wrap basis differs from the rigid Euler,
  // so the flip must be decided against the actual frame+wrapPanel mapping.
  const flips = computeWrapFlipFlags(pieces, frames, regions);

  // Per-region wrap coverage: sleeves wrap near-closed (panel width = outline
  // width in metres); the underarm self-seam closes the small remaining gap.
  const wrapParamsList = pieces.map((p, i) =>
    wrapParamsForRegion(regions[i], frames[i], pieceGeometryOf(p).widthMm * 0.001),
  );

  return pieces.map((_p, i) => ({
    placement: placements[i], frame: frames[i], flip: flips[i], wrapParams: wrapParamsList[i],
  }));
}

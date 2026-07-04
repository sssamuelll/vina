import type { WrapParams } from './wrapPanel';
import type { SurfaceFrame } from './surfaceFrame';
import type { BodyRegion } from '../garmentPlacement';

/**
 * Shared wrap configuration for the placement loops (render + solver) and the
 * orientation tests. Single source so render and solver never diverge.
 * 150° wrap cap, 3cm standoff from the body surface.
 */
export const DEFAULT_WRAP: WrapParams = { thetaMaxRad: 2.618, gap: 0.03 }; // 150°, 3cm

/** Sleeve wrap cap — below 2π so the two underarm edges leave a small gap the
 *  underarm seam closes, rather than overshooting 360° and self-intersecting. */
export const MAX_SLEEVE_WRAP = (330 * Math.PI) / 180; // ≈ 5.7596 rad

/** Minimum standoff between the limb surface and the derived sleeve tube. */
export const SLEEVE_CLEARANCE = 0.01; // 1cm

/** Collar wrap cap — the neck band wraps near-closed with the ~30° opening at
 *  center-back (φ is measured from the frame normal = front), where the
 *  band's short-end closure sits. Same 330° rationale as sleeves. */
export const MAX_COLLAR_WRAP = (330 * Math.PI) / 180; // ≈ 5.7596 rad

/** Minimum standoff between the neck surface and the derived collar band. */
export const COLLAR_CLEARANCE = 0.01; // 1cm

const SLEEVE_REGIONS: ReadonlySet<BodyRegion> = new Set<BodyRegion>([
  'left-sleeve', 'right-sleeve', 'cuff-left', 'cuff-right',
]);

/** Panel-derived tube: rWrap = panelWidth / cap (panel spans exactly the cap,
 *  zero clamp-piling), floored at R + clearance for narrow panels (they then
 *  cover < cap — no clamping either way). */
function tubeWrap(panelWidthMeters: number, R: number, cap: number, clearance: number): WrapParams {
  const rWrap = Math.max(panelWidthMeters / cap, R + clearance);
  return { thetaMaxRad: cap, gap: rWrap - R };
}

/**
 * Per-region wrap coverage. Sleeves and the collar wrap as near-closed tubes
 * (a seam closes the remaining gap: underarm self-seam for sleeves, the band's
 * center-back closure for the collar); everything else keeps the 150°
 * DEFAULT_WRAP (partial-torso-panel + side-seam design). `panelWidthMeters` is
 * the flat panel's circumference-direction width (outline width × 0.001) —
 * verified against María's real collar (2026-07-04): bbox 456×40.9mm, the
 * long dimension IS the outline width = circumference direction, so no
 * max(width, height) fallback is needed.
 *
 * `hood` stays on DEFAULT_WRAP deliberately: a hood is a draping panel over
 * head/back, not a closed band, and no fixture exists to measure one — revisit
 * with a real hood piece.
 *
 * ISOMETRIC tube radius (plan §6bis): wrapPanel measures the arc at the radius
 * the cloth lives at (R + gap), so for the panel to cover the full arc with
 * zero clamp-piling the tube radius must be derived FROM the panel:
 * rWrap = panelWidth / cap, floored at R + clearance (see tubeWrap). The old
 * thetaMax = min(330°, panelWidth/R) measured coverage at the BODY radius while
 * the cloth sat at R + gap → over-curved ×(R+gap)/R → 18% of María's sleeve
 * vertices piled on the ±165° clamp lines (the "pillow"/box sleeve). The
 * collar had it worse under DEFAULT_WRAP: its 456mm band needs ~287° at the
 * cloth radius vs the 150° cap → 44.2% of vertices piled on the ±75° lines
 * (the "knot at the neckline", plan item 3 / wrapIsometry case (d)).
 */
export function wrapParamsForRegion(
  region: BodyRegion,
  frame: SurfaceFrame,
  panelWidthMeters: number,
): WrapParams {
  const R = frame.radius || 1e-6;
  if (SLEEVE_REGIONS.has(region)) return tubeWrap(panelWidthMeters, R, MAX_SLEEVE_WRAP, SLEEVE_CLEARANCE);
  if (region === 'collar') return tubeWrap(panelWidthMeters, R, MAX_COLLAR_WRAP, COLLAR_CLEARANCE);
  return DEFAULT_WRAP;
}

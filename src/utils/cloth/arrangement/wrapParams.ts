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

const SLEEVE_REGIONS: ReadonlySet<BodyRegion> = new Set<BodyRegion>([
  'left-sleeve', 'right-sleeve', 'cuff-left', 'cuff-right',
]);

/**
 * Per-region wrap coverage. Sleeves wrap as a near-closed tube whose remaining
 * gap the underarm self-seam closes (Task 3); everything else keeps the 150°
 * DEFAULT_WRAP (partial-torso-panel + side-seam design). `panelWidthMeters` is
 * the flat panel's circumference-direction width (outline width × 0.001).
 *
 * ISOMETRIC tube radius (plan §6bis): wrapPanel measures the arc at the radius
 * the cloth lives at (R + gap), so for the panel to cover the full arc with
 * zero clamp-piling the tube radius must be derived FROM the panel:
 * rWrap = panelWidth / MAX_SLEEVE_WRAP (the panel spans exactly 330° with no
 * vertex past the clamp), floored at R + SLEEVE_CLEARANCE so narrow panels keep
 * a body standoff (they then cover < 330° — no clamping either way). The old
 * thetaMax = min(330°, panelWidth/R) measured coverage at the BODY radius while
 * the cloth sat at R + gap → over-curved ×(R+gap)/R → 18% of María's sleeve
 * vertices piled on the ±165° clamp lines (the "pillow"/box sleeve).
 */
export function wrapParamsForRegion(
  region: BodyRegion,
  frame: SurfaceFrame,
  panelWidthMeters: number,
): WrapParams {
  if (!SLEEVE_REGIONS.has(region)) return DEFAULT_WRAP;
  const R = frame.radius || 1e-6;
  const rWrap = Math.max(panelWidthMeters / MAX_SLEEVE_WRAP, R + SLEEVE_CLEARANCE);
  return { thetaMaxRad: MAX_SLEEVE_WRAP, gap: rWrap - R };
}

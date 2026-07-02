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

const SLEEVE_REGIONS: ReadonlySet<BodyRegion> = new Set<BodyRegion>([
  'left-sleeve', 'right-sleeve', 'cuff-left', 'cuff-right',
]);

/**
 * Per-region wrap coverage. Sleeves wrap to min(330°, panelWidth/R) — a
 * near-closed tube whose remaining gap the underarm self-seam closes (Task 3);
 * everything else keeps the 150° DEFAULT_WRAP (partial-torso-panel + side-seam
 * design). `panelWidthMeters` is the flat panel's circumference-direction width
 * (outline width × 0.001). See the sleeve-tube-closure design doc.
 */
export function wrapParamsForRegion(
  region: BodyRegion,
  frame: SurfaceFrame,
  panelWidthMeters: number,
): WrapParams {
  if (!SLEEVE_REGIONS.has(region)) return DEFAULT_WRAP;
  const R = frame.radius || 1e-6;
  const fullWrap = panelWidthMeters / R;
  return { thetaMaxRad: Math.min(MAX_SLEEVE_WRAP, fullWrap), gap: DEFAULT_WRAP.gap };
}

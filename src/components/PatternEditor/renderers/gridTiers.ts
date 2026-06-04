/**
 * Zoom-aware grid tiers for the 2D canvas (design surface 5, P2.9).
 *
 * Three tiers share one cadence anchored on `gridSizeMm` (default 10 = 1cm):
 *  - major  : 10 grid steps (10cm) — always visible, the coarse reference
 *  - minor  : 1 grid step  (1cm)   — fades out when zoomed far out so the field
 *             does not turn into a grey wash
 *  - subgrid: 0.5 grid step (5mm)  — only appears once zoomed in, for precision
 *
 * Lines stay 1px crisp because GridLayer renders OUTSIDE the scaled content
 * group (screen space), so strokeWidth here is literal px, never divided by zoom.
 */
export interface GridTier {
  key: 'subgrid' | 'minor' | 'major';
  /** Tile spacing in screen px. */
  spacingPx: number;
  strokeWidth: number;
  /** CSS custom property to use for the line color. */
  colorVar: string;
  /** 0..1 — tiers at 0 should not be rendered. */
  opacity: number;
}

/** Minor grid fades in over zoom 0.4 → 0.7; gone below, solid above. */
export function minorGridOpacity(zoom2D: number): number {
  return clamp((zoom2D - 0.4) / 0.3, 0, 1);
}

/** 5mm sub-grid appears past 2x and reaches its cap (0.6) by 3x. */
export function subGridOpacity(zoom2D: number): number {
  return clamp((zoom2D - 2) / 1, 0, 1) * 0.6;
}

export function computeGridTiers(gridSizeMm: number, zoom2D: number): GridTier[] {
  const step = gridSizeMm * zoom2D;
  return [
    { key: 'major', spacingPx: step * 10, strokeWidth: 1, colorVar: '--grid-2d-major', opacity: 1 },
    { key: 'minor', spacingPx: step, strokeWidth: 1, colorVar: '--grid-2d', opacity: minorGridOpacity(zoom2D) },
    { key: 'subgrid', spacingPx: step / 2, strokeWidth: 0.5, colorVar: '--grid-2d', opacity: subGridOpacity(zoom2D) },
  ];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

import type { UnitSystem } from '../../../types/types';

/**
 * Pure tick generation for the 2D-canvas rulers (design surface 5, P0.4).
 *
 * Pattern space is millimeters; the visible mapping is screenPx = panPx + vMm * zoom2D
 * (the same transform GridLayer and screenToPattern use). Major ticks land every
 * `minorPerMajor` grid steps (10 → every 10cm), minor ticks every grid step (1cm).
 * Minor ticks are suppressed when they would crowd below `minMinorGapPx` so the
 * ruler stays legible when zoomed out. Only major ticks carry a label.
 */
export interface RulerTick {
  /** Position along the ruler, in screen px from the gutter origin. */
  posPx: number;
  /** Pattern coordinate in mm. */
  vMm: number;
  isMajor: boolean;
  /** Compact label (no unit suffix), present only on major ticks. */
  label: string | null;
}

export interface RulerTickParams {
  /** Visible length of the ruler in px (viewport width for the top ruler, height for the left). */
  lengthPx: number;
  /** Screen px offset of pattern origin along this axis (pan2D.x or pan2D.y). */
  panPx: number;
  zoom2D: number;
  /** Minor grid step in mm (editor.gridSize, default 10 = 1cm). */
  gridSizeMm: number;
  units: UnitSystem;
  /** Major tick every N minor steps. Default 10 (→ 10cm majors on a 1cm grid). */
  minorPerMajor?: number;
  /** Minor ticks closer than this (px) are dropped. Default 7. */
  minMinorGapPx?: number;
}

/** Compact tick label without unit suffix (the unit is shown once on the gutter corner). */
export function formatRulerLabel(vMm: number, units: UnitSystem): string {
  switch (units) {
    case 'inches': {
      const inches = vMm / 25.4;
      return trimZero(inches.toFixed(1));
    }
    case 'mm':
      return String(Math.round(vMm));
    case 'cm':
    default:
      return trimZero((vMm / 10).toFixed(1));
  }
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, '');
}

export function generateRulerTicks(params: RulerTickParams): RulerTick[] {
  const {
    lengthPx, panPx, zoom2D, gridSizeMm,
    units, minorPerMajor = 10, minMinorGapPx = 7,
  } = params;

  if (lengthPx <= 0 || zoom2D <= 0 || gridSizeMm <= 0) return [];

  const minorStepMm = gridSizeMm;
  const majorStepMm = gridSizeMm * minorPerMajor;
  const minorGapPx = minorStepMm * zoom2D;
  const showMinor = minorGapPx >= minMinorGapPx;

  // Visible pattern range along this axis.
  const vStart = (0 - panPx) / zoom2D;
  const vEnd = (lengthPx - panPx) / zoom2D;

  const step = showMinor ? minorStepMm : majorStepMm;
  const first = Math.ceil(vStart / step) * step;

  const ticks: RulerTick[] = [];
  // Round-trip through integers to avoid float drift deciding major-ness.
  for (let v = first; v <= vEnd; v += step) {
    const vR = Math.round(v);
    const isMajor = vR % majorStepMm === 0;
    ticks.push({
      posPx: panPx + v * zoom2D,
      vMm: v,
      isMajor,
      label: isMajor ? formatRulerLabel(v, units) : null,
    });
  }
  return ticks;
}

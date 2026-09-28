// src/utils/geometry/path.ts
import type { PathCommand, Point2D } from '../../types/types';
import { gaussLegendreCubicBezierLength } from './arcLength';

/**
 * Get the start and end points of an edge at edgeIndex in a PathCommand array.
 *
 * A `Z` closes against the `M` that OPENS ITS SUBPATH, not against
 * `commands[0]` (#1205). With a single ring the two coincide and resolving to
 * `commands[0]` was right by accident; on a piece with a hole it reported the
 * hole's closing side as a chord running to the outer corner. Measured on
 * `M0 L1 L2 L3 Z4 M5 L6 L7 L8 Z9`: edge 9 came back as (50,70)→(0,0), 86.02 mm
 * long, instead of (50,70)→(50,30), 40 mm.
 *
 * It is the same convention `getClosingAnchor` already implements in
 * `nodeEditorUtils.ts`; here the subpath start falls out of the walk for free.
 *
 * Who showed it: `usePointTool` builds `sideEnds` from this and `ToolOverlay`
 * draws that guide on hover, so the tool promised a side that is not drawn.
 * It also feeds `sewingUtils.buildEdgeSelection` — which decides what gets
 * sewn — plus the elastic, topstitch and POM tools.
 */
export function getEdgeEndpoints(
  commands: PathCommand[],
  edgeIndex: number,
): { start: Point2D; end: Point2D } | null {
  if (edgeIndex < 1 || edgeIndex >= commands.length) return null;

  let cx = 0, cy = 0;
  // Arranque del subcamino en curso: a él vuelve su propia `Z`.
  let sx = 0, sy = 0;
  for (let i = 0; i < edgeIndex; i++) {
    const cmd = commands[i];
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': cx = v[0]; cy = v[1]; sx = cx; sy = cy; break;
      case 'L': cx = v[0]; cy = v[1]; break;
      case 'H': cx = v[0]; break;
      case 'V': cy = v[0]; break;
      case 'C': cx = v[4]; cy = v[5]; break;
      case 'Q': cx = v[2]; cy = v[3]; break;
      case 'Z': cx = sx; cy = sy; break;
    }
  }
  const start = { x: cx, y: cy };

  const cmd = commands[edgeIndex];
  const v = cmd.values;
  let end: Point2D;
  switch (cmd.type) {
    case 'L': end = { x: v[0], y: v[1] }; break;
    case 'H': end = { x: v[0], y: cy }; break;
    case 'V': end = { x: cx, y: v[0] }; break;
    case 'C': end = { x: v[4], y: v[5] }; break;
    case 'Q': end = { x: v[2], y: v[3] }; break;
    case 'Z':
      // `sx`/`sy` es la `M` de ESTE subcamino: el bucle de arriba la dejó ahí.
      end = { x: sx, y: sy };
      break;
    default: return null;
  }

  return { start, end };
}

/**
 * Get the SVG path `d` attribute for a single edge at edgeIndex.
 * Preserves curves (C/Q commands) instead of drawing a straight line.
 * The returned path starts with M(start) followed by the original command.
 */
export function getEdgePathD(
  commands: PathCommand[],
  edgeIndex: number,
  offsetX: number = 0,
  offsetY: number = 0,
): string | null {
  const ep = getEdgeEndpoints(commands, edgeIndex);
  if (!ep) return null;

  const cmd = commands[edgeIndex];
  const sx = ep.start.x + offsetX;
  const sy = ep.start.y + offsetY;

  switch (cmd.type) {
    case 'L':
      return `M${sx},${sy} L${cmd.values[0] + offsetX},${cmd.values[1] + offsetY}`;
    case 'H':
      return `M${sx},${sy} L${cmd.values[0] + offsetX},${sy}`;
    case 'V':
      return `M${sx},${sy} L${sx},${cmd.values[0] + offsetY}`;
    case 'C':
      return `M${sx},${sy} C${cmd.values[0] + offsetX},${cmd.values[1] + offsetY},${cmd.values[2] + offsetX},${cmd.values[3] + offsetY},${cmd.values[4] + offsetX},${cmd.values[5] + offsetY}`;
    case 'Q':
      return `M${sx},${sy} Q${cmd.values[0] + offsetX},${cmd.values[1] + offsetY},${cmd.values[2] + offsetX},${cmd.values[3] + offsetY}`;
    case 'Z':
      // El otro extremo ya lo resolvió `getEdgeEndpoints` contra la `M` de su
      // subcamino; recalcularlo desde `commands[0]` era la tercera copia del
      // mismo descuido.
      return `M${sx},${sy} L${ep.end.x + offsetX},${ep.end.y + offsetY}`;
    default:
      return null;
  }
}

/** Compute the straight-line length of an edge (chord between endpoints). */
export function getEdgeLength(commands: PathCommand[], edgeIndex: number): number {
  const ep = getEdgeEndpoints(commands, edgeIndex);
  if (!ep) return 0;
  return Math.sqrt((ep.end.x - ep.start.x) ** 2 + (ep.end.y - ep.start.y) ** 2);
}

/** Sample a quadratic Bézier into `steps` segments and sum their lengths. */
function quadraticArcLength(p0: Point2D, p1: Point2D, p2: Point2D, steps = 24): number {
  let len = 0;
  let px = p0.x, py = p0.y;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
    len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return len;
}

/**
 * Compute the ARC length of an edge — samples curve commands (C/Q) so curved
 * edges (armholes, sleeve caps, necklines) report their true traversed length,
 * not the straight-line chord between endpoints. Straight edges (L/H/V/Z)
 * return the chord, which equals their arc length.
 *
 * Use this — NOT getEdgeLength — for seam length comparison: autoSew pairs
 * edges by sampled arc length, so a chord-based mismatch over-reports curved
 * seams (a half-circle armhole's chord is ~64% of its arc, reading as a huge
 * false mismatch even when the seam is correctly matched).
 */
export function getEdgeArcLength(commands: PathCommand[], edgeIndex: number): number {
  const ep = getEdgeEndpoints(commands, edgeIndex);
  if (!ep) return 0;
  const cmd = commands[edgeIndex];
  const v = cmd.values;
  switch (cmd.type) {
    case 'C':
      // Reuse the precise Gauss-Legendre cubic length (< 0.1mm error).
      return gaussLegendreCubicBezierLength(ep.start, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }, { x: v[4], y: v[5] });
    case 'Q':
      return quadraticArcLength(ep.start, { x: v[0], y: v[1] }, { x: v[2], y: v[3] });
    default:
      // L / H / V / Z are straight — chord IS the arc length.
      return Math.hypot(ep.end.x - ep.start.x, ep.end.y - ep.start.y);
  }
}

/** Compute a perpendicular offset path from a line segment. */
export function computeOffsetPath(
  start: Point2D,
  end: Point2D,
  offset: number,
): PathCommand[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];

  const nx = -dy / len;
  const ny = dx / len;

  return [
    { type: 'M', values: [start.x + nx * offset, start.y + ny * offset] },
    { type: 'L', values: [end.x + nx * offset, end.y + ny * offset] },
  ];
}

/** Compute offset path for a sub-segment defined by t0 and t1. */
export function computeSegmentOffsetPath(
  start: Point2D,
  end: Point2D,
  t0: number,
  t1: number,
  offset: number,
): PathCommand[] {
  const segStart = {
    x: start.x + (end.x - start.x) * t0,
    y: start.y + (end.y - start.y) * t0,
  };
  const segEnd = {
    x: start.x + (end.x - start.x) * t1,
    y: start.y + (end.y - start.y) * t1,
  };
  return computeOffsetPath(segStart, segEnd, offset);
}

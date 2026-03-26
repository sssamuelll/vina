// src/utils/geometry/path.ts
import type { PathCommand, Point2D } from '../../types/types';

/** Get the start and end points of an edge at edgeIndex in a PathCommand array. */
export function getEdgeEndpoints(
  commands: PathCommand[],
  edgeIndex: number,
): { start: Point2D; end: Point2D } | null {
  if (edgeIndex < 1 || edgeIndex >= commands.length) return null;

  let cx = 0, cy = 0;
  for (let i = 0; i < edgeIndex; i++) {
    const cmd = commands[i];
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': case 'L': cx = v[0]; cy = v[1]; break;
      case 'H': cx = v[0]; break;
      case 'V': cy = v[0]; break;
      case 'C': cx = v[4]; cy = v[5]; break;
      case 'Q': cx = v[2]; cy = v[3]; break;
      case 'Z': {
        const m = commands[0];
        if (m.type === 'M') { cx = m.values[0]; cy = m.values[1]; }
        break;
      }
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
    case 'Z': {
      const m = commands[0];
      end = m.type === 'M' ? { x: m.values[0], y: m.values[1] } : start;
      break;
    }
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
    case 'Z': {
      const m = commands[0];
      if (m.type === 'M') return `M${sx},${sy} L${m.values[0] + offsetX},${m.values[1] + offsetY}`;
      return null;
    }
    default:
      return null;
  }
}

/** Compute the straight-line length of an edge. */
export function getEdgeLength(commands: PathCommand[], edgeIndex: number): number {
  const ep = getEdgeEndpoints(commands, edgeIndex);
  if (!ep) return 0;
  return Math.sqrt((ep.end.x - ep.start.x) ** 2 + (ep.end.y - ep.start.y) ** 2);
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

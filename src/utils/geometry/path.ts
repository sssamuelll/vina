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

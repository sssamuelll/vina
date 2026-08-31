import type { PathCommand, Point2D } from '../../../types/types';
import { getAnchor } from '../nodeEditorUtils';
import { polarOf, polarPoint } from '../polyPenGeometry';

export interface PolarSegment {
  from: Point2D;
  to: Point2D;
  lengthMm: number;
  angleDeg: number;
  writeLength(mm: number): Point2D;
  writeAngle(deg: number): Point2D;
  /** Índice del comando cuyo par final representa el nodo que se mueve. */
  toCommandIndex: number;
}

function anchorAfter(
  command: PathCommand,
  current: Point2D | null,
  subpathStart: Point2D | null,
): Point2D | null {
  const anchor = getAnchor(command);
  if (anchor) return anchor;
  switch (command.type) {
    case 'H':
      return current ? { x: command.values[0], y: current.y } : null;
    case 'V':
      return current ? { x: current.x, y: command.values[0] } : null;
    case 'S':
    case 'T':
    case 'A': {
      const n = command.values.length;
      return n >= 2
        ? { x: command.values[n - 2], y: command.values[n - 1] }
        : current;
    }
    case 'Z':
      return subpathStart;
    default:
      return current;
  }
}

/** Largo y ángulo editables de cada comando `L` del trazo. */
export function segmentPolar(path: PathCommand[]): PolarSegment[] {
  const segments: PolarSegment[] = [];
  let current: Point2D | null = null;
  let subpathStart: Point2D | null = null;

  path.forEach((command, commandIndex) => {
    const to = anchorAfter(command, current, subpathStart);
    if (command.type === 'L' && current && to) {
      const from = current;
      const polar = polarOf(from, to);
      segments.push({
        from,
        to,
        lengthMm: polar.lengthMm,
        angleDeg: polar.angleDeg,
        writeLength: mm => polarPoint(from, mm, polar.angleDeg),
        writeAngle: deg => polarPoint(from, polar.lengthMm, deg),
        toCommandIndex: commandIndex,
      });
    }

    if (command.type === 'M') subpathStart = to;
    current = to;
  });

  return segments;
}

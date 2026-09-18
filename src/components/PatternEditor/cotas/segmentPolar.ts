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

/** Un tramo recto de `from` a `to`, escribible moviendo el nodo de `toCommandIndex`. */
function tramo(from: Point2D, to: Point2D, toCommandIndex: number): PolarSegment {
  const polar = polarOf(from, to);
  return {
    from,
    to,
    lengthMm: polar.lengthMm,
    angleDeg: polar.angleDeg,
    writeLength: mm => polarPoint(from, mm, polar.angleDeg),
    writeAngle: deg => polarPoint(from, polar.lengthMm, deg),
    toCommandIndex,
  };
}

/** Más corto que esto, el lado de cierre no existe: la `Z` ya está sobre la `M`. */
const CIERRE_MIN_MM = 1e-6;

/**
 * Largo y ángulo editables de cada tramo RECTO del trazo — incluido el de
 * **cierre** (#1167 § 4).
 *
 * El de cierre no es un comando `L`: es la `Z`, que vuelve al ancla de su `M`.
 * Sin él, un rectángulo real (`M L L L Z`) —el contorno más común que existe—
 * enseñaba tres lados de cuatro. Es el mismo hueco que #1120 pagó en las
 * etiquetas de «Largos»: un consumidor que no traduce la convención del
 * productor.
 *
 * Su `toCommandIndex` es el de la **`M`**, no el de la `Z`, porque el par final
 * de esa `M` ES el nodo que se mueve — que es lo que ese campo significa y lo
 * que `copiaConNodoFinal` y `applyNodeMove` esperan recibir. La convención de
 * `nearestSegment` (el índice de la `Z`) se traduce al leer.
 */
export function segmentPolar(path: PathCommand[]): PolarSegment[] {
  const segments: PolarSegment[] = [];
  let current: Point2D | null = null;
  let subpathStart: Point2D | null = null;
  let subpathStartIndex = -1;

  path.forEach((command, commandIndex) => {
    const to = anchorAfter(command, current, subpathStart);
    if (command.type === 'L' && current && to) {
      segments.push(tramo(current, to, commandIndex));
    }
    if (command.type === 'Z' && current && subpathStart && subpathStartIndex >= 0
      && polarOf(current, subpathStart).lengthMm > CIERRE_MIN_MM) {
      segments.push(tramo(current, subpathStart, subpathStartIndex));
    }

    if (command.type === 'M') { subpathStart = to; subpathStartIndex = commandIndex; }
    current = to;
  });

  return segments;
}

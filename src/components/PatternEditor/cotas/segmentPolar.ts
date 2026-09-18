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
  /**
   * El comando que DIBUJA este tramo. Coincide con `toCommandIndex` salvo en el
   * de cierre, donde dibuja la `Z` y se mueve el ancla de la `M`.
   *
   * Los dos hacen falta y no son el mismo número: la referencia angular se
   * busca «lo que hay ANTES de este comando», y preguntarlo por la `M` (índice
   * 0) devuelve la nada — el lado de cierre decía «al eje» mientras sus
   * hermanos decían «al tramo», dos de cuatro en un mismo rectángulo.
   */
  drawCommandIndex: number;
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

/**
 * Más corto que esto, el tramo no existe: sus dos extremos son el mismo punto.
 *
 * No es una precaución teórica. El DXF de María llega de CLO con el vértice
 * REPETIDO en cada esquina, así que un rectángulo suyo trae un tramo de 0 mm
 * por esquina. Sin este filtro: un chip que dice «0,0 mm» por debajo de su
 * propio mínimo (0,1), un ángulo de 0° que `atan2(0,0)` se inventa, y escribir
 * 250 en él arrastra la esquina 250 mm a la derecha por un rumbo que nadie
 * trazó. La lección está escrita en los dos vecinos: `nodo.ts` («una cota de
 * 0,0 mm que no se puede mover es peor que ninguna») y `angleReference.ts`
 * («never let atan2(0,0) invent a reference»).
 */
const TRAMO_MIN_MM = 1e-6;

/** Un tramo recto de `from` a `to`, o `null` si sus extremos coinciden. */
function tramo(
  from: Point2D, to: Point2D, toCommandIndex: number, drawCommandIndex: number,
): PolarSegment | null {
  const polar = polarOf(from, to);
  if (polar.lengthMm <= TRAMO_MIN_MM) return null;
  return {
    from,
    to,
    lengthMm: polar.lengthMm,
    angleDeg: polar.angleDeg,
    writeLength: mm => polarPoint(from, mm, polar.angleDeg),
    writeAngle: deg => polarPoint(from, polar.lengthMm, deg),
    toCommandIndex,
    drawCommandIndex,
  };
}

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
      const t = tramo(current, to, commandIndex, commandIndex);
      if (t) segments.push(t);
    }
    if (command.type === 'Z' && current && subpathStart && subpathStartIndex >= 0) {
      const t = tramo(current, subpathStart, subpathStartIndex, commandIndex);
      if (t) segments.push(t);
    }

    if (command.type === 'M') { subpathStart = to; subpathStartIndex = commandIndex; }
    current = to;
  });

  return segments;
}

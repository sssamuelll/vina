import type { PathCommand, Point2D } from '../../../types/types';
import {
  advance,
  buildRing,
  pointAt,
  projectToRing,
} from '../../../utils/geometry/outlineRing';
import { detectCorners } from '../../../utils/notchAnchor';

export interface EdgeDistance {
  corner: Point2D;
  mm: number;
  write(mm: number): Point2D;
}

interface ProjectedCorner {
  corner: Point2D;
  distanceMm: number;
}

const CORNER_MATCH_EPSILON_MM = 1e-7;

function circularDistance(a: number, b: number, perimeter: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, perimeter - direct);
}

/**
 * Distancias por el contorno desde las dos esquinas adyacentes a un extremo.
 * `cw` sigue el orden almacenado: por eso parte de la esquina anterior;
 * `ccw` parte de la siguiente y recorre el anillo al revés. Una esquina
 * coincidente se excluye a propósito: medirse contra sí misma produciría dos
 * cotas cero que no dicen cuáles son los dos lados realmente editables.
 */
export function edgeDistances(
  outlineLocal: PathCommand[],
  endpointLocal: Point2D,
): { cw: EdgeDistance; ccw: EdgeDistance } | null {
  const built = buildRing(outlineLocal, 2);
  if (!built.ok || built.value.subpathCount > 1) return null;
  const ring = built.value;

  const endpoint = projectToRing(ring, endpointLocal);
  if (Math.hypot(
    endpoint.point.x - endpointLocal.x,
    endpoint.point.y - endpointLocal.y,
  ) > 0.5) return null;

  const corners = detectCorners(outlineLocal);
  if (corners.length < 2) return null;
  const projected = corners
    .map((corner): ProjectedCorner => ({
      corner,
      distanceMm: projectToRing(ring, corner).distanceMm,
    }))
    .sort((a, b) => a.distanceMm - b.distanceMm)
    .filter((corner, index, all) => (
      index === 0
      || Math.abs(corner.distanceMm - all[index - 1].distanceMm) > CORNER_MATCH_EPSILON_MM
    ));
  if (projected.length < 2) return null;

  const exactIndex = projected.findIndex(corner => (
    circularDistance(corner.distanceMm, endpoint.distanceMm, ring.totalMm)
      <= CORNER_MATCH_EPSILON_MM
  ));

  let cwCorner: ProjectedCorner;
  let ccwCorner: ProjectedCorner;
  if (exactIndex >= 0) {
    cwCorner = projected[(exactIndex - 1 + projected.length) % projected.length];
    ccwCorner = projected[(exactIndex + 1) % projected.length];
  } else {
    cwCorner = projected[projected.length - 1];
    for (const corner of projected) {
      if (corner.distanceMm > endpoint.distanceMm) break;
      cwCorner = corner;
    }
    ccwCorner = projected.find(corner => corner.distanceMm > endpoint.distanceMm)
      ?? projected[0];
  }

  return {
    cw: {
      corner: cwCorner.corner,
      mm: advance(ring, cwCorner.distanceMm, endpoint.distanceMm, 'cw'),
      write: mm => pointAt(ring, cwCorner.distanceMm + mm).point,
    },
    ccw: {
      corner: ccwCorner.corner,
      mm: advance(ring, ccwCorner.distanceMm, endpoint.distanceMm, 'ccw'),
      write: mm => pointAt(ring, ccwCorner.distanceMm - mm).point,
    },
  };
}

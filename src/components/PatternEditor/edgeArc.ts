import type { PathCommand, Point2D } from '../../types/types';
import {
  buildRing,
  distanceAt,
  pointAt,
  projectToRing,
  type OutlineRing,
} from '../../utils/geometry/outlineRing';
import { spanLengthMm, unwrapOnSpan } from './distanceCommit';

/**
 * UN anillo por contorno, por identidad del arreglo (immer lo cambia solo
 * cuando cambia la geometría). El `t` que el hook resuelve y el que la cota
 * interpreta salen del mismo anillo; y con hover esto corre por movimiento,
 * así que reconstruirlo por llamada sería la tormenta que el spec 02-09
 * § 5.2 prohíbe. Métrica 2 (arco exacto), con 1 de respaldo.
 */
const anillos = new WeakMap<PathCommand[], OutlineRing | null>();
export function ringForOutline(outline: PathCommand[]): OutlineRing | null {
  if (anillos.has(outline)) return anillos.get(outline) ?? null;
  const exact = buildRing(outline, 2);
  const built = exact.ok ? exact : buildRing(outline, 1);
  const ring = built.ok ? built.value : null;
  anillos.set(outline, ring);
  return ring;
}

/** Distancias de anillo que delimitan un borde, incluido el cierre que cruza 0. */
export function edgeSpanMm(ring: OutlineRing, edgeRange: [number, number]): [number, number] {
  const startMm = distanceAt(ring, { commandIndex: edgeRange[0], tLocal: 0 });
  const rawEndMm = distanceAt(ring, { commandIndex: edgeRange[1] - 1, tLocal: 1 });
  // El cierre termina donde empieza el anillo; conservar el cruce evita usar
  // accidentalmente el complemento del borde.
  return startMm > 0 && rawEndMm >= ring.totalMm - 1e-6
    ? [startMm, 0]
    : [startMm, rawEndMm];
}

/** Proyecta sobre el borde y clampea al extremo físicamente más cercano. */
export function edgeTForPoint(
  ring: OutlineRing,
  edgeRange: [number, number],
  localPoint: Point2D,
): number {
  const spanMm = edgeSpanMm(ring, edgeRange);
  const lengthMm = spanLengthMm(ring, spanMm);
  if (lengthMm <= 0) return 0;

  const projectedMm = projectToRing(ring, localPoint).distanceMm;
  const unwrappedMm = unwrapOnSpan(ring, spanMm, projectedMm);
  const startMm = spanMm[0];
  const endMm = startMm + lengthMm;
  if (unwrappedMm >= startMm - 1e-6 && unwrappedMm <= endMm + 1e-6) {
    return Math.max(0, Math.min(1, (unwrappedMm - startMm) / lengthMm));
  }

  const start = pointAt(ring, startMm).point;
  const end = pointAt(ring, endMm).point;
  const startDistance = Math.hypot(localPoint.x - start.x, localPoint.y - start.y);
  const endDistance = Math.hypot(localPoint.x - end.x, localPoint.y - end.y);
  return startDistance <= endDistance ? 0 : 1;
}

export function edgePointAtT(
  ring: OutlineRing,
  edgeRange: [number, number],
  t: number,
): Point2D {
  const spanMm = edgeSpanMm(ring, edgeRange);
  return pointAt(ring, spanMm[0] + t * spanLengthMm(ring, spanMm)).point;
}

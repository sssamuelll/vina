import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { detectCornerCommands } from '../outlineAnalysis';
import { advance, pointAt, projectToRing, type OutlineRing } from './outlineRing';

export type RefKind = 'corner' | 'point' | 'notch' | 'seamEnd' | 'edgeEnd';

export interface DistanceRef {
  point: Point2D;
  distanceMm: number;
  kind: RefKind;
}

export interface RefCandidate {
  point: Point2D;
  kind: RefKind;
}

/**
 * Conserva cada ancla explícita del contorno, incluidas las que terminan una
 * curva. Mirar solo `M`/`L` borraría precisamente nodos nombrables como el
 * final de una sisa.
 */
function commandEnd(command: PathCommand, cursor: Point2D): Point2D | null {
  const values = command.values;
  switch (command.type) {
    case 'M':
    case 'L':
    case 'T':
      return { x: values[0], y: values[1] };
    case 'H':
      return { x: values[0], y: cursor.y };
    case 'V':
      return { x: cursor.x, y: values[0] };
    case 'C':
      return { x: values[4], y: values[5] };
    case 'S':
    case 'Q':
      return { x: values[2], y: values[3] };
    case 'A':
      return { x: values[5], y: values[6] };
    case 'Z':
      // El cierre vuelve al `M`, que ya entró como nodo; repetirlo haría que
      // el orden de dos candidatos idénticos decidiera si parece esquina.
      return null;
  }
}

function contourCandidates(outline: PathCommand[]): RefCandidate[] {
  const corners = detectCornerCommands(outline);
  const candidates: RefCandidate[] = [];
  let cursor: Point2D = { x: 0, y: 0 };
  let subpathStart = cursor;

  outline.forEach((command, commandIndex) => {
    if (command.type === 'Z') {
      cursor = subpathStart;
      return;
    }

    const point = commandEnd(command, cursor);
    if (!point) return;
    cursor = point;
    if (command.type === 'M') subpathStart = point;
    candidates.push({
      point,
      kind: corners.has(commandIndex) ? 'corner' : 'point',
    });
  });

  return candidates;
}

function notchCandidates(piece: Pick<PatternPiece, 'internals'>): RefCandidate[] {
  const candidates: RefCandidate[] = [];
  for (const internal of piece.internals) {
    if (internal.type !== 'notch') continue;
    const first = internal.path[0];
    if (!first) continue;
    const point = commandEnd(first, { x: 0, y: 0 });
    if (point) candidates.push({ point, kind: 'notch' });
  }
  return candidates;
}

function nearestWithin(
  candidates: RefCandidate[],
  pressLocal: Point2D,
  hitMm: number,
): RefCandidate | null {
  let nearest: RefCandidate | null = null;
  let nearestMm = Infinity;

  for (const candidate of candidates) {
    const distanceMm = Math.hypot(
      candidate.point.x - pressLocal.x,
      candidate.point.y - pressLocal.y,
    );
    if (distanceMm <= hitMm && distanceMm < nearestMm) {
      nearest = candidate;
      nearestMm = distanceMm;
    }
  }

  return nearest;
}

/**
 * Fija una referencia nombrable durante el press para que una edición futura
 * pueda re-derivarla aunque cambie el contorno.
 *
 * Si no hay una a tiro, la caída compara los extremos por ARCO. Sobre una
 * sisa la cuerda miente: puede acercar visualmente puntos lejanos del recorrido
 * y haría que el ancla saltara al extremo equivocado del borde.
 */
export function resolveDistanceRef(
  ring: OutlineRing,
  piece: Pick<PatternPiece, 'outline' | 'internals'>,
  pressLocal: Point2D,
  edgeSpanMm: [number, number],
  hitMm: number,
  extra?: RefCandidate[],
): DistanceRef {
  const candidates = [
    ...contourCandidates(piece.outline),
    ...notchCandidates(piece),
    ...(extra ?? []),
  ];
  const nearest = nearestWithin(candidates, pressLocal, hitMm);

  if (nearest) {
    return {
      point: nearest.point,
      distanceMm: projectToRing(ring, nearest.point).distanceMm,
      kind: nearest.kind,
    };
  }

  const pressDistanceMm = projectToRing(ring, pressLocal).distanceMm;
  const [startMm, endMm] = edgeSpanMm;
  const distanceToStart = Math.min(
    advance(ring, pressDistanceMm, startMm, 'cw'),
    advance(ring, pressDistanceMm, startMm, 'ccw'),
  );
  const distanceToEnd = Math.min(
    advance(ring, pressDistanceMm, endMm, 'cw'),
    advance(ring, pressDistanceMm, endMm, 'ccw'),
  );
  const distanceMm = distanceToStart <= distanceToEnd ? startMm : endMm;

  return {
    point: pointAt(ring, distanceMm).point,
    distanceMm,
    kind: 'edgeEnd',
  };
}

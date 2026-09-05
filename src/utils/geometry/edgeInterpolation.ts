import type { PatternPiece, Point2D } from '../../types/types';
import { computePathArcLength, pointAtPathDistance } from './arcLength';
import { rangoMedibleDeBorde } from '../semanticEdges';

/**
 * Un punto sobre un borde semántico, dado t entre 0 y 1.
 *
 * `SemanticEdge.segmentRange` está en espacio de COMANDOS — es el contrato del
 * productor, escrito en `outlineAnalysis.ts:15` («Trams carry their range in
 * COMMAND space»). Este archivo lo leía como índices sobre `flattenPath`, que
 * es espacio de PUNTOS, y las dos cosas solo coinciden por casualidad.
 *
 * Lo que costaba, medido en Chrome el 2026-09-05 con un rectángulo de 200×150:
 * `trimPlace` guardaba el avío un borde corrido — clic ARRIBA guardaba
 * `leftEdge`, DERECHA guardaba `topEdge`, y así las cuatro. Invisible en el
 * lienzo, porque el renderizador usa esta misma función y se equivoca igual;
 * visible en cuanto el dato sale a un tech pack, al 3D o al copiloto. Y en una
 * pieza importada, donde un borde son 14-20 comandos y `flattenPath` además
 * densifica las curvas, no es un corrimiento de uno: descuadra del todo.
 *
 * Ahora las dos funciones delegan en la familia de `arcLength`, que trabaja en
 * espacio de comandos y mide curvas de verdad (Gauss-Legendre) en vez de
 * poligonizarlas. Ver `el-borde-de-cierre-mide.test.ts`.
 */
export function interpolateEdgePoint(
  piece: PatternPiece,
  edgeName: string,
  t: number,
): { point: Point2D; tangent: Point2D } | null {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;

  const [from, to] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
  const total = computePathArcLength(piece.outline, from, to);
  if (total <= 0) return null;

  const clampedT = Math.max(0, Math.min(1, t));
  const d = clampedT * total;
  const point = pointAtPathDistance(piece.outline, d, from, to);
  if (!point) return null;

  // Tangente por diferencia finita sobre el propio arco: sirve igual para una
  // recta que para una curva, y no hace falta que el evaluador la exponga.
  const eps = Math.min(0.5, total / 100);
  const antes = pointAtPathDistance(piece.outline, Math.max(0, d - eps), from, to);
  const despues = pointAtPathDistance(piece.outline, Math.min(total, d + eps), from, to);
  let tangent: Point2D = { x: 1, y: 0 };
  if (antes && despues) {
    const dx = despues.x - antes.x;
    const dy = despues.y - antes.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) tangent = { x: dx / len, y: dy / len };
  }

  return { point, tangent };
}

/** Largo (mm) de un borde semántico, en el mismo espacio de comandos. */
export function computeEdgeLengthMM(piece: PatternPiece, edgeName: string): number {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return 0;
  const [from, to] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
  return computePathArcLength(piece.outline, from, to);
}

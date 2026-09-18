import type { PathCommand, Point2D } from '../../../types/types';
import { distToSegment } from '../../../utils/geometry/distance';
import { indiceSegunLosBordes } from '../../../utils/semanticEdges';
import { segmentPolar } from './segmentPolar';

/**
 * Los lados de un contorno que tienen caja: los tramos RECTOS, incluido el de
 * cierre (#1167, spec 2026-09-18 § 3.1-3.2). Un lado curvo no está aquí porque
 * su largo es de solo lectura (spec 08-09 § 3.1) — se lee con el interruptor
 * «Largos», que mide el recorrido y no la cuerda.
 *
 * El índice que devuelven estos helpers es SIEMPRE el de `segmentPolar`: el
 * comando cuyo par final es el nodo que se mueve. Para el lado de cierre eso es
 * la `M`, no la `Z`.
 */

/**
 * De la convención de `nearestSegment` a la de `segmentPolar`, y con validación.
 *
 * `nearestSegment` rotula el lado de cierre con el índice de la `Z`;
 * `segmentPolar` lo rotula con el de la `M`, porque el par final de esa `M` ES
 * el nodo que se mueve. La traducción NO se reimplementa aquí: la hace
 * `indiceSegunLosBordes`, que ya existía para el mismo convenio y trae escrito
 * lo que costó («clicar el lado IZQUIERDO con Elástico o con Pliegue no hacía
 * absolutamente nada»). Era la cuarta copia de la misma idea en este repo; con
 * esto quedan tres, y la que sobra es la de `useEditPattern.ts`, que la clava a
 * `0` y por eso falla con dos subtrazos.
 *
 * Lo que sí es de aquí: validar. `null` si ese hit no cae sobre ningún lado
 * RECTO —un lado curvo incluido—, porque el largo de una curva es de solo
 * lectura (spec 08-09 § 3.1).
 */
export function ladoDelHit(outline: PathCommand[], hitIndex: number): number | null {
  if (!outline[hitIndex]) return null;
  const indice = indiceSegunLosBordes(outline, hitIndex);
  return segmentPolar(outline).some(t => t.toCommandIndex === indice) ? indice : null;
}

/**
 * El lado recto más cercano a un punto en coordenadas LOCALES de la pieza —
 * el que abre Tab (spec 2026-09-18 § 3.1).
 *
 * Sin punto (el ratón nunca entró al lienzo) devuelve el primero del contorno,
 * que es determinista y no inventa un rumbo. `null` si la pieza no tiene ningún
 * lado recto: ahí Tab se comporta como siempre.
 */
export function ladoMasCercano(outline: PathCommand[], local: Point2D | null): number | null {
  const lados = segmentPolar(outline);
  if (lados.length === 0) return null;
  if (!local) return lados[0].toCommandIndex;
  let mejor = lados[0];
  let mejorDist = Infinity;
  for (const lado of lados) {
    const d = distToSegment(local, lado.from, lado.to);
    if (d < mejorDist) { mejorDist = d; mejor = lado; }
  }
  return mejor.toCommandIndex;
}

import type { PathCommand, Point2D } from '../../../types/types';
import { distToSegment } from '../../../utils/geometry/distance';
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
 * De la convención de `nearestSegment` a la de `segmentPolar`.
 *
 * `nearestSegment` rotula el lado de cierre con el índice de la `Z` (o con 0 si
 * no hay); `segmentPolar` lo rotula con el de la `M`, porque el par final de esa
 * `M` ES el nodo que se mueve. Traducir al LEER y no al escribir: `nearestSegment`
 * tiene muchos consumidores y su convención es su interfaz pública.
 *
 * `null` si ese hit no cae sobre ningún lado recto — un lado curvo incluido.
 */
export function ladoDelHit(outline: PathCommand[], hitIndex: number): number | null {
  const comando = outline[hitIndex];
  if (!comando) return null;
  let indice = hitIndex;
  if (comando.type === 'Z') {
    // La `M` que abre el subtrazo de esta `Z`.
    indice = 0;
    for (let i = hitIndex - 1; i >= 0; i--) {
      if (outline[i].type === 'M') { indice = i; break; }
    }
  }
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

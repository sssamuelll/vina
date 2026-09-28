/**
 * Qué agarra un press en Editar patrón (spec 2026-09-24 § 3.4).
 *
 * Todas las reglas son la misma idea del contrato del 08-09 § 2.2: lo que ya
 * es sujeto gana. Por eso el clic se puede predecir sin aprender nada nuevo.
 *
 * - Un punto gana a un tramo dentro del radio.
 * - Entre puntos, el más cercano. Si coinciden (la misma coordenada): la
 *   interna elegida, luego el contorno, luego la interna de encima (decisión 4).
 * - Entre tramos, el más cercano. Si empatan: el elegido, luego el de encima.
 * - Una línea abierta no tiene tramo de cierre: ni se agarra, ni tapa a un
 *   tramo real que esté más lejos que él.
 */
import type { PathCommand, Point2D } from '../../types/types';
import { nearestSegment, type EditableNode } from './nodeEditorUtils';
import { ANCHOR_MATCH_EPS_MM } from './anchorRoles';
import { CLAVE_CONTORNO, type ClaveLinea } from './lineaEditable';

export interface LineaParaAgarre {
  clave: ClaveLinea;
  path: PathCommand[];
  nodes: EditableNode[];
}

export type Agarre =
  | { clave: ClaveLinea; tipo: 'punto'; commandIndex: number; distancia: number }
  | { clave: ClaveLinea; tipo: 'tramo'; commandIndex: number; t: number; point: Point2D; distancia: number };

/** Desempate entre puntos que coinciden: menor gana. `i` es el orden de pintado. */
function rangoDePunto(clave: ClaveLinea, i: number, total: number, elegida: ClaveLinea | null): number {
  if (clave === elegida) return 0;
  if (clave === CLAVE_CONTORNO) return 1;
  return 2 + (total - 1 - i);
}

/** Desempate entre tramos que empatan: el elegido, luego de arriba abajo. */
function rangoDeTramo(clave: ClaveLinea, i: number, total: number, elegida: ClaveLinea | null): number {
  if (clave === elegida) return 0;
  return 1 + (total - 1 - i);
}

/**
 * `lineas` en orden de pintado: el contorno primero, la última interna encima.
 * `punto` y `radio`, en el marco local de la pieza. `elegida`, la interna
 * elegida (`editor.selectedInternalLine`), si la hay.
 */
export function agarrar(
  lineas: readonly LineaParaAgarre[],
  punto: Point2D,
  radio: number,
  elegida: ClaveLinea | null,
): Agarre | null {
  let mejorPunto: { agarre: Agarre; pos: Point2D; rango: number } | null = null;
  lineas.forEach((linea, i) => {
    for (const node of linea.nodes) {
      const d = Math.hypot(punto.x - node.position.x, punto.y - node.position.y);
      if (d >= radio) continue;
      const rango = rangoDePunto(linea.clave, i, lineas.length, elegida);
      const coincide = mejorPunto !== null
        && Math.hypot(node.position.x - mejorPunto.pos.x, node.position.y - mejorPunto.pos.y) <= ANCHOR_MATCH_EPS_MM;
      const gana = mejorPunto === null
        || (coincide ? rango < mejorPunto.rango : d < mejorPunto.agarre.distancia);
      if (gana) {
        mejorPunto = {
          agarre: { clave: linea.clave, tipo: 'punto', commandIndex: node.ref.commandIndex, distancia: d },
          pos: node.position,
          rango,
        };
      }
    }
  });
  if (mejorPunto) return (mejorPunto as { agarre: Agarre }).agarre;

  let mejorTramo: { agarre: Agarre; rango: number } | null = null;
  lineas.forEach((linea, i) => {
    const hit = nearestSegment(punto, linea.path, { cierre: linea.path.some(c => c.type === 'Z') });
    // Un hit en una `M` es el cierre fantasma de un subcamino abierto: ahí no
    // se dibuja nada (#1205).
    if (!hit || hit.distance >= radio || linea.path[hit.commandIndex]?.type === 'M') return;
    const rango = rangoDeTramo(linea.clave, i, lineas.length, elegida);
    const gana = mejorTramo === null
      || hit.distance < mejorTramo.agarre.distancia
      || (hit.distance === mejorTramo.agarre.distancia && rango < mejorTramo.rango);
    if (gana) {
      mejorTramo = {
        agarre: {
          clave: linea.clave, tipo: 'tramo', commandIndex: hit.commandIndex,
          t: hit.t, point: hit.point, distancia: hit.distance,
        },
        rango,
      };
    }
  });
  return mejorTramo ? (mejorTramo as { agarre: Agarre }).agarre : null;
}

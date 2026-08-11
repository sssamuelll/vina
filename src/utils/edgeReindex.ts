/**
 * edgeReindex — mantener `SemanticEdge.segmentRange` alineado con el contorno.
 *
 * Un `segmentRange` es un rango [inicio, fin) de ÍNDICES sobre
 * `piece.outline`. Los bordes se detectan una sola vez — al crear la pieza o al
 * cargar el proyecto — y `updatePiece` reemplaza la pieza entera sin volver a
 * mirarlos. Así que cualquier verbo que INSERTE o QUITE un comando corre los
 * índices y deja los rangos apuntando al sitio equivocado (#1043).
 *
 * Lo caro no es el resalte. `resolveEdgeName` saca el nombre del borde a partir
 * del comando clicado, y ese nombre es lo que persiste en el `Seam` y lo que
 * lee el solver: con los rangos corridos, coser el lado de arriba puede
 * guardarse como si fuera el derecho.
 *
 * Por qué REINDEXAR y no re-detectar: los `Seam` referencian bordes por
 * NOMBRE, no por id. Un re-detect que renombre `sideSeam` a `sideSeam-2` deja
 * la costura apuntando a un borde que ya no existe. Reindexar conserva nombres
 * y costuras, y es lo que corresponde cuando la geometría no cambió — solo se
 * partió un tramo. Re-detectar sigue siendo lo correcto cuando la pieza cambia
 * de verdad (importar, unir, cortar), y esos caminos ya lo hacen a mano.
 *
 * @module edgeReindex
 */

import type { PathCommand, SemanticEdge } from '../types/types';

function sameCommand(a: PathCommand, b: PathCommand): boolean {
  if (a.type !== b.type || a.values.length !== b.values.length) return false;
  for (let i = 0; i < a.values.length; i++) {
    if (a.values[i] !== b.values[i]) return false;
  }
  return true;
}

/**
 * ¿Son los dos juegos de bordes el MISMO indexado?
 *
 * Distingue el arrastre sucio del recálculo: un llamador que se limitó a
 * copiar la pieza (`{...piece, outline: nuevo}`) trae los rangos viejos y hay
 * que correrlos; uno que los recalculó (tijeras, offset, unir) ya los trae en
 * el espacio del contorno nuevo y correrlos otra vez los rompería.
 */
export function sameSegmentRanges(
  a: SemanticEdge[] | undefined,
  b: SemanticEdge[] | undefined,
): boolean {
  if (!a || !b || a.length === 0 || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].segmentRange[0] !== b[i].segmentRange[0]) return false;
    if (a[i].segmentRange[1] !== b[i].segmentRange[1]) return false;
  }
  return true;
}

/**
 * Corre los `segmentRange` para que sigan nombrando los mismos tramos después
 * de insertar o quitar comandos.
 *
 * El tramo mutado se localiza por prefijo y sufijo comunes. Una frontera de
 * rango que caiga JUSTO en el punto de inserción se deja sin correr: así el
 * borde que EMPIEZA ahí se queda con los comandos nuevos (que es lo que pasa
 * al partir uno de los suyos) y el que TERMINA ahí no se los come.
 *
 * Devuelve el mismo array cuando no hay nada que hacer, y también cuando el
 * resultado saldría degenerado o fuera de rango — un juego de bordes viejo es
 * malo, pero uno corrupto es peor.
 */
export function reindexEdges(
  edges: SemanticEdge[] | undefined,
  prevOutline: PathCommand[] | undefined,
  newOutline: PathCommand[] | undefined,
): SemanticEdge[] | undefined {
  if (!edges || edges.length === 0 || !prevOutline || !newOutline) return edges;
  const delta = newOutline.length - prevOutline.length;
  if (delta === 0) return edges;

  // Prefijo común.
  let p = 0;
  const min = Math.min(prevOutline.length, newOutline.length);
  while (p < min && sameCommand(prevOutline[p], newOutline[p])) p++;

  // Sufijo común, sin solaparse con el prefijo.
  let q = 0;
  while (
    q < min - p
    && sameCommand(prevOutline[prevOutline.length - 1 - q], newOutline[newOutline.length - 1 - q])
  ) q++;

  const prevSpanEnd = prevOutline.length - q;

  /** Frontera en espacio viejo → espacio nuevo. Empate = sin correr. */
  const move = (b: number): number => {
    if (b <= p) return b;
    if (b >= prevSpanEnd) return b + delta;
    return p; // dentro del tramo reemplazado: se pega al inicio
  };

  const next = edges.map(e => ({
    ...e,
    segmentRange: [move(e.segmentRange[0]), move(e.segmentRange[1])] as [number, number],
  }));

  const sano = next.every(
    e => e.segmentRange[0] >= 0
      && e.segmentRange[1] > e.segmentRange[0]
      && e.segmentRange[1] <= newOutline.length,
  );
  return sano ? next : edges;
}

import type { PatternPiece, Point2D } from '../../types/types';
import { patternToPieceLocal, pieceLocalToPattern } from '../../utils/geometry/pieceSpace';
import { buildRing, projectToRing, type OutlineRing } from '../../utils/geometry/outlineRing';
import { extractNodes, type EditableNode } from './nodeEditorUtils';
import { getInternalLineEndpoints } from './internalShapePath';

/**
 * El resolutor de enganche del lienzo 2D, fuera del hook que lo estrenó.
 *
 * Nació dentro de `usePolyPenTool` (spec 2026-08-29 § 4.6) y ahí sigue siendo
 * el mejor del repo: una sola prioridad —vértice → extremo de otra interna →
 * contorno—, un solo radio (`EDGE_HIT_PX`), y dentro de cada clase gana la
 * pieza de arriba. Lo que no tenía era un segundo lector: la pluma, que es la
 * herramienta con la que María empieza una línea desde un punto que ya existe,
 * no miraba las piezas — ni siquiera las recibía (#1102).
 *
 * ESTO NO ES EL RESOLUTOR ÚNICO. El censo del 2026-09-05 contó veinticuatro
 * hit-tests y siete radios distintos en el lienzo 2D, y fundirlos es una L con
 * su propio spec (gramática de la tanda 6, § 4). Esto es lo barato y ya
 * decidido: un lector más para el que ya estaba bien, sin tocar los otros
 * veintitrés.
 *
 * Se separa a propósito el ÍNDICE del RESOLUTOR. El índice cuesta —aplana
 * nodos, extremos y anillos de todas las piezas visibles— y se recalcula por
 * identidad de `pieces`, no por evento de ratón; con un DXF de María eso es la
 * diferencia entre un frame y veinte. El resolutor es puro y se llama en cada
 * `mousemove`.
 */

export type SnapKind = 'firstNode' | 'vertex' | 'internalEnd' | 'outline';

export interface SnapTarget {
  kind: SnapKind;
  pieceId: string | null;
  /** Mundo (patrón). */
  point: Point2D;
}

export interface SnapIndex {
  /** Piezas VISIBLES en orden de dibujo: la última está arriba. */
  pieces: PatternPiece[];
  nodesByPiece: Map<string, EditableNode[]>;
  endsByPiece: Map<string, Point2D[]>;
  ringsByPiece: Map<string, OutlineRing>;
}

/** El primer nodo de un trazo vivo, cuando cerrar sobre él es una opción. */
export interface FirstNodeTarget {
  point: Point2D;
  pieceId: string | null;
}

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Aplana lo enganchable de las piezas visibles. Caro: memoízalo por `pieces`.
 *
 * El anillo se pre-aplana con métrica 2 porque proyectar contra él es O(n) por
 * evento; `snapToEdge` re-aplana el contorno entero por comando y no cabe en un
 * frame con veinte piezas DXF (revisión Halberg, 2026-08-29).
 */
export function buildSnapIndex(pieces: PatternPiece[]): SnapIndex {
  const nodesByPiece = new Map<string, EditableNode[]>();
  const endsByPiece = new Map<string, Point2D[]>();
  const ringsByPiece = new Map<string, OutlineRing>();

  for (const p of pieces) {
    nodesByPiece.set(p.id, extractNodes(p));

    const ends: Point2D[] = [];
    for (const line of p.internals ?? []) {
      const ep = getInternalLineEndpoints(line);
      if (ep) ends.push(ep[0], ep[1]);
    }
    endsByPiece.set(p.id, ends);

    if (p.outline?.length) {
      const built = buildRing(p.outline, 2);
      if (built.ok) ringsByPiece.set(p.id, built.value);
    }
  }

  return { pieces, nodesByPiece, endsByPiece, ringsByPiece };
}

/**
 * Qué hay bajo `world` dentro de `radius` (en unidades de PATRÓN, ya divididas
 * por el zoom por el llamador).
 *
 * Prioridad de la spec § 4.6, y dentro de cada clase la pieza de arriba
 * primero. En una esquina gana el vértice por PRECEDENCIA, no por radio: por
 * eso hay un solo radio y no siete.
 *
 * `firstNode` es opcional porque las dos herramientas que lo usan cierran
 * distinto: la línea interna cierra colocando un nodo sobre el primero, y la
 * pluma cierra COMPLETANDO la pieza. La que completa se guarda su propio
 * cierre y pasa `null` aquí.
 */
export function resolveSnap(
  index: SnapIndex,
  world: Point2D,
  radius: number,
  firstNode: FirstNodeTarget | null = null,
): SnapTarget | null {
  if (firstNode && dist(world, firstNode.point) <= radius) {
    return { kind: 'firstNode', pieceId: firstNode.pieceId, point: firstNode.point };
  }

  const ps = index.pieces;

  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    const local = patternToPieceLocal(world, p);
    for (const nd of index.nodesByPiece.get(p.id) ?? []) {
      if (dist(local, nd.position) <= radius) {
        return { kind: 'vertex', pieceId: p.id, point: pieceLocalToPattern(nd.position, p) };
      }
    }
  }

  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    const local = patternToPieceLocal(world, p);
    for (const end of index.endsByPiece.get(p.id) ?? []) {
      if (dist(local, end) <= radius) {
        return { kind: 'internalEnd', pieceId: p.id, point: pieceLocalToPattern(end, p) };
      }
    }
  }

  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    const ring = index.ringsByPiece.get(p.id);
    if (!ring) continue;
    const local = patternToPieceLocal(world, p);
    const { point } = projectToRing(ring, local);
    if (dist(local, point) <= radius) {
      return { kind: 'outline', pieceId: p.id, point: pieceLocalToPattern(point, p) };
    }
  }

  return null;
}

/**
 * Todos los vértices de las piezas visibles, en coordenadas de PATRÓN.
 *
 * Lo pide la segunda mitad de #1102: «siempre en los extremos los puntos
 * deberían aparecer» [11:38]. Sale del mismo índice que el enganche a
 * propósito — lo que se pinta y lo que engancha tienen que ser el mismo
 * conjunto, o la promesa del dibujo es falsa.
 */
export function verticesVisibles(index: SnapIndex): Point2D[] {
  const puntos: Point2D[] = [];
  for (const p of index.pieces) {
    for (const nd of index.nodesByPiece.get(p.id) ?? []) {
      puntos.push(pieceLocalToPattern(nd.position, p));
    }
  }
  return puntos;
}

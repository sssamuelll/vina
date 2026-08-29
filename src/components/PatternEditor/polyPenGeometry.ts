import type { PathCommand, Point2D } from '../../types/types';
import { chainHandles } from '../../utils/geometry/catmullRom';

/**
 * Geometría del trazo de línea interna — la única conversión nodos → comandos.
 * La usan el motor (`usePolyPenTool`) y el overlay: con un solo algoritmo el
 * aviso y el resultado no pueden discrepar (la lección de maria-196).
 *
 * Regla (spec 2026-08-29 § 4.5): cada tramo toma en cada extremo el
 * manejador que su nodo aporta. Un bezier aporta el suyo. Un bloque de nodos
 * de curva por puntos (corrida maximal) aporta los de Catmull-Rom de la
 * cadena `[vecino anterior, …bloque, vecino siguiente]`, incluidos los dos
 * tramos de frontera — el vecino recto recibe ahí su manejador calculado,
 * igual que el ancla de arranque en `splineSegment.convertSegmentToSpline`.
 * Un recto fuera de una frontera no aporta. Las cadenas son abiertas: un
 * bloque nunca cruza el cierre; si el trazo cierra, el tramo último → primero
 * es un tramo más.
 */

export type PolyPenNodeType = 'straight' | 'curvePoints' | 'bezier';

export interface PolyPenNode {
  /** Coordenadas de mundo (patrón). */
  point: Point2D;
  type: PolyPenNodeType;
  /** Solo bezier. */
  handleIn?: Point2D;
  /** Solo bezier. */
  handleOut?: Point2D;
}

interface Contributions {
  /** Manejador que el nodo `i` aporta al tramo que SALE de él. */
  out: (Point2D | null)[];
  /** Manejador que el nodo `i` aporta al tramo que ENTRA en él. */
  in: (Point2D | null)[];
}

function contributions(nodes: PolyPenNode[], closed: boolean): Contributions {
  const n = nodes.length;
  const out: (Point2D | null)[] = nodes.map(nd => (nd.type === 'bezier' ? nd.handleOut ?? null : null));
  const inn: (Point2D | null)[] = nodes.map(nd => (nd.type === 'bezier' ? nd.handleIn ?? null : null));

  let i = 0;
  while (i < n) {
    if (nodes[i].type !== 'curvePoints') { i++; continue; }
    let j = i;
    while (j + 1 < n && nodes[j + 1].type === 'curvePoints') j++;

    // El vecino anterior nunca envuelve (la cadena arranca con un fantasma:
    // la curva entra recta). El siguiente sí envuelve cuando el trazo cierra,
    // porque el tramo último → primero existe y necesita su manejador.
    const prevIdx = i - 1;
    const nextIdx = j + 1 < n ? j + 1 : (closed ? 0 : -1);
    const idx: number[] = [];
    if (prevIdx >= 0) idx.push(prevIdx);
    for (let k = i; k <= j; k++) idx.push(k);
    if (nextIdx >= 0 && nextIdx !== prevIdx && nextIdx !== i) idx.push(nextIdx);

    if (idx.length >= 2) {
      const handles = chainHandles(idx.map(k => nodes[k].point), false);
      for (let t = 0; t < handles.length; t++) {
        const a = idx[t];
        const b = idx[t + 1];
        const [cp1, cp2] = handles[t];
        // Un bezier conserva el suyo: la cadena solo escribe donde nadie aporta.
        if (nodes[a].type !== 'bezier') out[a] = cp1;
        if (nodes[b].type !== 'bezier') inn[b] = cp2;
      }
    }
    i = j + 1;
  }
  return { out, in: inn };
}

export function nodesToCommands(nodes: PolyPenNode[], closed: boolean): PathCommand[] {
  if (nodes.length < 2) return [];
  const { out, in: inn } = contributions(nodes, closed);

  const segment = (a: number, b: number): PathCommand => {
    const cp1 = out[a];
    const cp2 = inn[b];
    const to = nodes[b].point;
    if (!cp1 && !cp2) return { type: 'L', values: [to.x, to.y] };
    const c1 = cp1 ?? nodes[a].point;
    const c2 = cp2 ?? to;
    return { type: 'C', values: [c1.x, c1.y, c2.x, c2.y, to.x, to.y] };
  };

  const cmds: PathCommand[] = [{ type: 'M', values: [nodes[0].point.x, nodes[0].point.y] }];
  for (let k = 1; k < nodes.length; k++) cmds.push(segment(k - 1, k));
  if (closed) {
    const closing = segment(nodes.length - 1, 0);
    // Un cierre recto ya lo dibuja Z; uno curvo necesita su C de vuelta al
    // origen antes (como usePenTool).
    if (closing.type === 'C') cmds.push(closing);
    cmds.push({ type: 'Z', values: [] });
  }
  return cmds;
}

export function commandsToPathD(cmds: PathCommand[]): string {
  return cmds.map(c => `${c.type}${c.values.join(',')}`).join(' ');
}

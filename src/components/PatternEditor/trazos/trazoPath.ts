import type { PathCommand, Point2D } from '../../../types/types';
import { applyNodeMove, getAnchor } from '../nodeEditorUtils';
import { distToSegmentWithT } from '../../../utils/geometry/distance';

/**
 * Geometría pura de un trazo (línea de construcción, spec 2026-09-12 § 2).
 * El `path` va en coordenadas de patrón, sin `Z`; el tramo `k` es el que
 * llega al comando `k` (misma convención que `segmentPolar` y las internas).
 */

const copia = (c: PathCommand): PathCommand => ({ ...c, values: [...c.values] });

/** Anclas del trazo en orden (M, L, C, Q…). */
export function anclasDeTrazo(path: PathCommand[]): Point2D[] {
  const out: Point2D[] = [];
  for (const cmd of path) {
    const a = getAnchor(cmd);
    if (a) out.push(a);
  }
  return out;
}

/** Las dos puntas, o null si no llega a dos anclas. */
export function puntasDeTrazo(path: PathCommand[]): [Point2D, Point2D] | null {
  const a = anclasDeTrazo(path);
  return a.length >= 2 ? [a[0], a[a.length - 1]] : null;
}

/**
 * Quita el tramo que llega al comando `segmentIndex`. Devuelve [izquierda,
 * derecha]; un lado es null si le queda menos de dos anclas. Un índice que no
 * es tramo (0, o fuera) devuelve el trazo intacto.
 */
export function quitarTramo(
  path: PathCommand[],
  segmentIndex: number,
): [PathCommand[] | null, PathCommand[] | null] {
  if (segmentIndex < 1 || segmentIndex >= path.length) return [path, null];
  const izquierda = path.slice(0, segmentIndex).map(copia);
  const anclaK = getAnchor(path[segmentIndex]);
  const derecha = anclaK
    ? [{ type: 'M' as const, values: [anclaK.x, anclaK.y] }, ...path.slice(segmentIndex + 1).map(copia)]
    : null;
  return [
    anclasDeTrazo(izquierda).length >= 2 ? izquierda : null,
    derecha && anclasDeTrazo(derecha).length >= 2 ? derecha : null,
  ];
}

/**
 * ¿Ese Supr PARTE el trazo en dos? Es lo que la bitácora registra como
 * `parte` (spec § 5.6) y lo que la usuaria ve pasar. Vive aquí, al lado de
 * `quitarTramo`, porque es su misma condición leída al revés — los dos lados
 * sobreviven — y porque lo preguntan las DOS puertas de borrado: tenerlo
 * escrito dos veces es cómo #1115 acabó con una puerta tres semanas atrás.
 */
export function parteElTrazo(path: PathCommand[], segmentIndex: number): boolean {
  const [izquierda, derecha] = quitarTramo(path, segmentIndex);
  return izquierda !== null && derecha !== null;
}

/**
 * Mueve una punta (0 = primera, 1 = última) y devuelve un path nuevo; el
 * original no se toca.
 *
 * Delega en `applyNodeMove`, la misma puerta por la que se mueve el nodo de una
 * pieza o de una interna, así que la punta arrastra **sus dos manejadores**: el
 * de llegada (en su propio `C`/`Q`) y el de salida (el `cp1` del `C` siguiente,
 * maria-203). Mover la punta de salida sin el segundo deformaba el arranque de
 * un trazo curvo.
 */
export function moverPunta(path: PathCommand[], extremo: 0 | 1, a: Point2D): PathCommand[] {
  return applyNodeMove(path, extremo === 0 ? 0 : path.length - 1, 'anchor', a);
}

/**
 * Tramo más cercano a `p` por la cuerda entre anclas (como `hitInternalLine`).
 * ponytail: una curva se mide por su cuerda; si hace falta afinar, aplanarla
 * con los seeds de `parseV2` sin el cierre implícito de `buildRing`.
 */
export function tramoMasCercano(
  path: PathCommand[],
  p: Point2D,
): { distance: number; segmentIndex: number; point: Point2D } | null {
  let mejor: { distance: number; segmentIndex: number; point: Point2D } | null = null;
  let prev: Point2D | null = null;
  path.forEach((cmd, i) => {
    const a = getAnchor(cmd);
    if (!a) return;
    if (cmd.type !== 'M' && prev) {
      const d = distToSegmentWithT(p.x, p.y, prev.x, prev.y, a.x, a.y);
      if (!mejor || d.distance < mejor.distance) {
        mejor = { distance: d.distance, segmentIndex: i, point: d.point };
      }
    }
    prev = a;
  });
  return mejor;
}

/** Cruce propio de dos segmentos rectos (ni paralelos ni tocándose en una punta). */
export function cruceDeRectas(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

interface Recta {
  trazoId: string;
  i: number;
  a: Point2D;
  b: Point2D;
}

function rectasDe(trazos: ReadonlyArray<{ id: string; path: PathCommand[] }>): Recta[] {
  const out: Recta[] = [];
  for (const t of trazos) {
    let prev: Point2D | null = null;
    t.path.forEach((cmd, i) => {
      const a = getAnchor(cmd);
      if (!a) return;
      if (cmd.type === 'L' && prev) out.push({ trazoId: t.id, i, a: prev, b: a });
      prev = a;
    });
  }
  return out;
}

/**
 * Cruces entre tramos rectos: de trazos distintos, o del mismo trazo si no
 * son vecinos. Las curvas no entran (spec § 6).
 * ponytail: O(n²) sobre tramos rectos; con cientos de trazos sigue cabiendo
 * en el memo del índice, que se rehace por identidad de la lista.
 */
export function crucesDeTrazos(trazos: ReadonlyArray<{ id: string; path: PathCommand[] }>): Point2D[] {
  const rectas = rectasDe(trazos);
  const out: Point2D[] = [];
  for (let i = 0; i < rectas.length; i++) {
    for (let j = i + 1; j < rectas.length; j++) {
      const r = rectas[i];
      const s = rectas[j];
      if (r.trazoId === s.trazoId && Math.abs(r.i - s.i) <= 1) continue;
      const p = cruceDeRectas(r.a, r.b, s.a, s.b);
      if (p) out.push(p);
    }
  }
  return out;
}

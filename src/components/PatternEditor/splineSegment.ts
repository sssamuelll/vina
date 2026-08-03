import type { PathCommand, Point2D } from '../../types/types';
import { chainHandles } from '../../utils/geometry/catmullRom';
import { getAnchor } from './nodeEditorUtils';

/**
 * "Curva por puntos" — el modelo que pidió María en la nota #197.
 *
 * Ella no rechaza el bezier por la fórmula sino por dónde está el punto que
 * agarras: el manejador vive fuera de la curva. Un punto de curva de patronista
 * está ENCIMA y la curva pasa por él. Aquí la curva se sigue guardando como
 * comandos `C` — Catmull-Rom → bezier es conversión exacta — así que el render,
 * los exportadores y el motor de margen de costura no cambian nada.
 *
 * ── Por qué no hay bandera en el esquema ──────────────────────────────────
 *
 * Para re-suavizar al arrastrar hay que saber qué `C` pertenece a una curva
 * por puntos y cuál es un bezier que alguien afinó a mano. Guardar esa marca
 * sería un cambio de esquema, y los índices se desplazan al insertar o borrar
 * puntos — el mismo problema que `notchAnchor` tuvo que resolver de forma
 * paramétrica.
 *
 * No hace falta: **los datos son su propia marca**. Un tramo está gestionado
 * si sus manejadores COINCIDEN con lo que Catmull-Rom predice desde sus
 * vecinos. Recién creado coinciden por construcción; al arrastrar recalculamos
 * y vuelven a coincidir; un bezier movido a mano deja de coincidir y no se
 * toca nunca más. Sin migración, sin versión, sin estado que se desincronice.
 */

/**
 * Tolerancia de la comprobación, en mm. Los manejadores los escribe esta misma
 * función y JSON conserva los dobles exactos, así que la coincidencia es a
 * nivel de bit; el epsilon sólo absorbe el reordenamiento de operaciones en
 * coma flotante. Holgado sería peor: dejaría entrar beziers ajenos.
 */
export const SPLINE_EPS_MM = 1e-6;

/** Tramos en que se parte un lado recto al convertirlo. 4 tramos = 3 puntos nuevos. */
export const DEFAULT_SPLINE_SEGMENTS = 4;

export interface SplineRun {
  /** Índice del primer comando `C` del tramo. */
  start: number;
  /** Índice del último comando `C` del tramo (inclusive). */
  end: number;
}

/** Bloque maximal de comandos `C` consecutivos que contiene a `commandIndex`. */
export function splineRunAt(outline: PathCommand[], commandIndex: number): SplineRun | null {
  if (outline[commandIndex]?.type !== 'C') return null;
  let start = commandIndex;
  let end = commandIndex;
  while (start > 0 && outline[start - 1].type === 'C') start--;
  while (end < outline.length - 1 && outline[end + 1].type === 'C') end++;
  return { start, end };
}

/**
 * Anclas de la cadena: la que precede al tramo más la de cada `C`.
 *
 * La cadena es ABIERTA a propósito. Convertir un lado de un rectángulo no puede
 * redondear sus dos esquinas: la curva termina en ellas y ahí manda el vecino
 * recto, no la spline.
 */
export function runAnchors(outline: PathCommand[], run: SplineRun): Point2D[] | null {
  let lead: Point2D | null = null;
  for (let i = run.start - 1; i >= 0; i--) {
    lead = getAnchor(outline[i]);
    if (lead) break;
  }
  if (!lead) return null;

  const points: Point2D[] = [lead];
  for (let i = run.start; i <= run.end; i++) {
    const anchor = getAnchor(outline[i]);
    if (!anchor) return null;
    points.push(anchor);
  }
  return points;
}

/** Reescribe los manejadores del tramo desde sus anclas. */
function withHandles(outline: PathCommand[], run: SplineRun, points: Point2D[]): PathCommand[] {
  const handles = chainHandles(points, false);
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  for (let k = 0; k < handles.length; k++) {
    const [cp1, cp2] = handles[k];
    const anchor = points[k + 1];
    cmds[run.start + k] = { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, anchor.x, anchor.y] };
  }
  return cmds;
}

/** ¿Los manejadores de este tramo son los que Catmull-Rom predice? */
export function isSplineManaged(outline: PathCommand[], run: SplineRun): boolean {
  const points = runAnchors(outline, run);
  if (!points) return false;
  const handles = chainHandles(points, false);
  if (handles.length !== run.end - run.start + 1) return false;

  for (let k = 0; k < handles.length; k++) {
    const v = outline[run.start + k].values;
    const [cp1, cp2] = handles[k];
    if (
      Math.abs(v[0] - cp1.x) > SPLINE_EPS_MM || Math.abs(v[1] - cp1.y) > SPLINE_EPS_MM ||
      Math.abs(v[2] - cp2.x) > SPLINE_EPS_MM || Math.abs(v[3] - cp2.y) > SPLINE_EPS_MM
    ) return false;
  }
  return true;
}

/**
 * Tras mover un ancla, devuelve el contorno con el tramo re-suavizado.
 *
 * Si el ancla no pertenece a una curva por puntos, devuelve el contorno tal
 * cual: un bezier afinado a mano se queda como su dueño lo dejó.
 *
 * `before` es el contorno ANTES del movimiento — la comprobación de pertenencia
 * se hace sobre él, porque después de mover el ancla los manejadores ya no
 * coinciden con la predicción y todo tramo daría "no gestionado".
 */
export function resmoothAfterMove(
  before: PathCommand[],
  after: PathCommand[],
  commandIndex: number,
): PathCommand[] {
  // Un ancla movida afecta a su propio tramo y al siguiente: es el extremo de
  // uno y el principio del otro.
  const runs = new Set<string>();
  for (const idx of [commandIndex, commandIndex + 1]) {
    const run = splineRunAt(before, idx);
    if (run && run.start < before.length) runs.add(`${run.start}:${run.end}`);
  }
  if (runs.size === 0) return after;

  let result = after;
  for (const key of runs) {
    const [start, end] = key.split(':').map(Number);
    const run = { start, end };
    if (!isSplineManaged(before, run)) continue;
    if (after[start]?.type !== 'C' || after[end]?.type !== 'C') continue;
    const points = runAnchors(result, run);
    if (!points) continue;
    result = withHandles(result, run, points);
  }
  return result;
}

/**
 * Convierte un lado recto en una curva por puntos.
 *
 * Reparte `segments` tramos a lo largo del lado y les da los manejadores de
 * Catmull-Rom. Como los puntos nacen alineados, la curva DIBUJA LA RECTA hasta
 * que se mueva alguno: convertir nunca deforma el patrón por su cuenta.
 */
export function convertSegmentToSpline(
  outline: PathCommand[],
  commandIndex: number,
  segments: number = DEFAULT_SPLINE_SEGMENTS,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];
  if (!cmd || cmd.type !== 'L' || segments < 2) return cmds;

  let from: Point2D | null = null;
  for (let i = commandIndex - 1; i >= 0; i--) {
    from = getAnchor(cmds[i]);
    if (from) break;
  }
  if (!from) return cmds;
  const to = getAnchor(cmd)!;
  if (Math.hypot(to.x - from.x, to.y - from.y) === 0) return cmds;

  const points: Point2D[] = [from];
  for (let k = 1; k <= segments; k++) {
    points.push({
      x: from.x + ((to.x - from.x) * k) / segments,
      y: from.y + ((to.y - from.y) * k) / segments,
    });
  }
  // El último ancla es el vértice original, exacto — no su reconstrucción por
  // k/segments, que llegaría a un ulp de distancia y desprendería su piquete.
  points[points.length - 1] = { ...to };

  const placeholders: PathCommand[] = points.slice(1).map(p => ({ type: 'C', values: [0, 0, 0, 0, p.x, p.y] }));
  cmds.splice(commandIndex, 1, ...placeholders);

  return withHandles(cmds, { start: commandIndex, end: commandIndex + segments - 1 }, points);
}

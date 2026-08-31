import type {
  InternalLine,
  PathCommand,
  PatternPiece,
  Point2D,
} from '../../../types/types';
import { buildRing, projectToRing } from '../../../utils/geometry/outlineRing';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { computeBoundingBox, bboxPivot, rotatePoint } from '../../../utils/geometry/transform';
import { detectCorners } from '../../../utils/notchAnchor';
import { getAnchor } from '../nodeEditorUtils';
import { resizePieceTo } from '../pieceResize';
import type { TransformUpdate } from '../pieceResize';
import { edgeDistances, type EdgeDistance } from './edgeDistances';
import { segmentPolar } from './segmentPolar';

export type CotaUpdate =
  | ({ kind: 'piece' } & TransformUpdate)
  | { kind: 'internal'; pieceId: string; lineId: string; path: PathCommand[] };

/**
 * Una cota viva (spec 2026-08-30 § 3, § 5): la medida que el objeto enseña
 * sobre el lienzo y que se edita ahí mismo. `a`→`b` es el segmento de la
 * línea de cota en coordenadas de PATRÓN, sin desplazar; `outward` es el
 * vector unitario hacia fuera de la pieza (la capa lo usa para separar la
 * línea y el chip en px de pantalla). `apply` devuelve la mutación de la
 * pieza — o `null` si el valor no es representable.
 */
export interface Cota {
  id: string;
  kind: 'ancho' | 'alto' | 'tramo-largo' | 'tramo-angulo' | 'borde';
  /** Nombre accesible, en español: "Ancho de la pieza". */
  label: string;
  valueMm: number;
  unit: 'mm' | 'deg';
  min: number;
  max: number;
  /** Relleno (mando principal) o hueco (verificación) — § 3.4. */
  primary: boolean;
  a: Point2D;
  b: Point2D;
  outward: Point2D;
  apply(valueMm: number): CotaUpdate | null;
}

/** Lo que `computeBoundingBox` y `scaleOutline` entienden. `H`, `V` y `A` son válidos en el esquema
 *  pero ninguno de los dos los recorre: una cota sobre ese contorno mediría mal y escribiría peor. */
const COMANDOS_SOPORTADOS: ReadonlySet<string> = new Set(['M', 'L', 'C', 'Q', 'Z']);

/** El mismo rango que declara `rectangle.tsx` para Ancho y Alto. */
const MEDIDA_MIN = 1;
const MEDIDA_MAX = 3000;

/** Gira un vector (no un punto) en la convención del render: `rotate()` del SVG, Y hacia abajo. */
function giraVector(v: Point2D, rad: number): Point2D {
  if (!rad) return v;
  const r = rotatePoint(v, { x: 0, y: 0 }, rad);
  return { x: Math.abs(r.x) < 1e-12 ? 0 : r.x, y: Math.abs(r.y) < 1e-12 ? 0 : r.y };
}

/**
 * Las dos cotas de una pieza: Ancho sobre el lado superior de su caja y Alto
 * sobre el lado derecho, en el marco girado de la caja — `computeBoundingBox`
 * devuelve la caja SIN girar más `rotation`/`pivot`, y los tiradores hacen la
 * misma conversión (`computeHandlePositions`). Escribirlas es `resizePieceTo`:
 * la esquina superior izquierda queda plantada, "como si arrastraras el
 * manejador inferior derecho" (maria-198).
 */
export function cotasDePieza(piece: PatternPiece): Cota[] {
  if (piece.outline.some(c => !COMANDOS_SOPORTADOS.has(c.type))) return [];
  const bbox = computeBoundingBox([piece], [piece.id]);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return [];
  const rad = ((bbox.rotation ?? 0) * Math.PI) / 180;
  const pivot = bboxPivot(bbox);
  const R = (p: Point2D) => (rad ? rotatePoint(p, pivot, rad) : p);
  const nw = R({ x: bbox.x, y: bbox.y });
  const ne = R({ x: bbox.x + bbox.width, y: bbox.y });
  const se = R({ x: bbox.x + bbox.width, y: bbox.y + bbox.height });
  return [
    {
      id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: bbox.width, unit: 'mm',
      min: MEDIDA_MIN, max: MEDIDA_MAX, primary: true,
      a: nw, b: ne, outward: giraVector({ x: 0, y: -1 }, rad),
      apply: (w) => {
        const update = resizePieceTo(piece, w, bbox.height);
        return update ? { kind: 'piece', ...update } : null;
      },
    },
    {
      id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: bbox.height, unit: 'mm',
      min: MEDIDA_MIN, max: MEDIDA_MAX, primary: true,
      a: ne, b: se, outward: giraVector({ x: 1, y: 0 }, rad),
      apply: (h) => {
        const update = resizePieceTo(piece, bbox.width, h);
        return update ? { kind: 'piece', ...update } : null;
      },
    },
  ];
}

function normalHaciaFuera(a: Point2D, b: Point2D, centro: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-9) return { x: 0, y: 1 };
  const normal = { x: -dy / largo, y: dx / largo };
  const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const haciaCentro = (medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y;
  return haciaCentro < 0 ? { x: -normal.x, y: -normal.y } : normal;
}

function copiaConNodoFinal(
  path: PathCommand[],
  commandIndex: number,
  point: Point2D,
): PathCommand[] | null {
  const copy = path.map(command => ({ ...command, values: [...command.values] }));
  const command = copy[commandIndex];
  if (!command || command.values.length < 2) return null;
  const offset = command.values.length - 2;
  command.values[offset] = point.x;
  command.values[offset + 1] = point.y;
  return copy;
}

/**
 * Replica la semántica del arrastre manual de extremos. En C/Q no basta con
 * mover el ancla: el control que llega a ella viaja por el mismo delta para
 * que editar una cota de borde no cambie también, de rebote, la tangente con
 * la que la curva alcanzaba ese extremo.
 */
function copiaConExtremo(
  path: PathCommand[],
  endpointIndex: 0 | 1,
  point: Point2D,
): PathCommand[] | null {
  const copy = path.map(command => ({ ...command, values: [...command.values] }));
  if (endpointIndex === 0) {
    const first = copy[0];
    if (!first || first.values.length < 2) return null;
    first.values[0] = point.x;
    first.values[1] = point.y;
    return copy;
  }

  const last = copy[copy.length - 1];
  if (!last) return null;
  if (last.type === 'L') {
    last.values[0] = point.x;
    last.values[1] = point.y;
    return copy;
  }
  if (last.type === 'C') {
    const dx = point.x - last.values[4];
    const dy = point.y - last.values[5];
    last.values[4] = point.x;
    last.values[5] = point.y;
    last.values[2] += dx;
    last.values[3] += dy;
    return copy;
  }
  if (last.type === 'Q') {
    const dx = point.x - last.values[2];
    const dy = point.y - last.values[3];
    last.values[2] = point.x;
    last.values[3] = point.y;
    last.values[0] += dx;
    last.values[1] += dy;
    return copy;
  }
  return null;
}

function nombreCorto(point: Point2D): string {
  const x = Math.abs(point.x) < 1e-9 ? 0 : Math.round(point.x * 10) / 10;
  const y = Math.abs(point.y) < 1e-9 ? 0 : Math.round(point.y * 10) / 10;
  return `(${x}, ${y})`;
}

/**
 * `edgeDistances` decide la esquina sobre el punto YA proyectado al anillo.
 * Repetir la comparación contra el extremo crudo abre una grieta de 0,5 mm:
 * un punto apenas fuera del contorno puede engancharse a una esquina y, aun
 * así, recibir el máximo de dos lados y saltársela al escribir.
 */
function coincideConEsquinaProyectada(
  outline: PathCommand[],
  endpoint: Point2D,
  corners: Point2D[],
): boolean {
  const built = buildRing(outline, 2);
  if (!built.ok) return false;
  const ring = built.value;
  const endpointMm = projectToRing(ring, endpoint).distanceMm;
  return corners.some((corner) => {
    const cornerMm = projectToRing(ring, corner).distanceMm;
    const direct = Math.abs(endpointMm - cornerMm);
    return Math.min(direct, ring.totalMm - direct) <= 1e-7;
  });
}

/** Cotas de tramo y de borde de una sola línea interna seleccionada. */
export function cotasDeLineaInterna(piece: PatternPiece, line: InternalLine): Cota[] {
  // Un piquete conserva una segunda verdad paramétrica (`notchAnchor`) y una
  // pinza tiene su propia entidad rica: mover solo el path desde este editor
  // genérico abriría dos dueños del mismo dato. Sus chips quedan para la tanda
  // que migre también esas representaciones, como fija la spec § 11.
  if (line.type === 'notch' || line.type === 'dart') return [];

  const bbox = computeBoundingBox([piece], [piece.id]);
  const centro = bbox
    ? bboxPivot(bbox)
    : pieceLocalToPattern({ x: 0, y: 0 }, piece);
  const cotas: Cota[] = [];
  const idBase = `${piece.id}-${line.id}`;

  for (const segment of segmentPolar(line.path)) {
    const from = pieceLocalToPattern(segment.from, piece);
    const to = pieceLocalToPattern(segment.to, piece);
    const outward = normalHaciaFuera(from, to, centro);
    cotas.push({
      id: `${idBase}-tramo-${segment.toCommandIndex}-largo`,
      kind: 'tramo-largo',
      label: 'Largo',
      valueMm: segment.lengthMm,
      unit: 'mm',
      min: 0.1,
      max: 99999,
      primary: true,
      a: from,
      b: to,
      outward,
      apply: (mm) => {
        const path = copiaConNodoFinal(
          line.path,
          segment.toCommandIndex,
          segment.writeLength(mm),
        );
        return path
          ? { kind: 'internal', pieceId: piece.id, lineId: line.id, path }
          : null;
      },
    });
    cotas.push({
      id: `${idBase}-tramo-${segment.toCommandIndex}-angulo`,
      kind: 'tramo-angulo',
      label: 'Ángulo',
      valueMm: segment.angleDeg,
      unit: 'deg',
      min: -180,
      max: 180,
      primary: true,
      a: from,
      b: to,
      outward,
      apply: (deg) => {
        const path = copiaConNodoFinal(
          line.path,
          segment.toCommandIndex,
          segment.writeAngle(deg),
        );
        return path
          ? { kind: 'internal', pieceId: piece.id, lineId: line.id, path }
          : null;
      },
    });
  }

  if (line.path.length < 2 || line.path.filter(command => command.type === 'M').length > 1) {
    return cotas;
  }

  const first = getAnchor(line.path[0]);
  const last = getAnchor(line.path[line.path.length - 1]);
  const outlineCorners = detectCorners(piece.outline);
  const endpoints: Array<{ index: 0 | 1; local: Point2D | null }> = [
    { index: 0, local: first },
    { index: 1, local: last },
  ];

  for (const endpoint of endpoints) {
    if (!endpoint.local) continue;
    const distances = edgeDistances(piece.outline, endpoint.local);
    if (!distances) continue;
    const endpointPattern = pieceLocalToPattern(endpoint.local, piece);
    const coincidesConEsquina = coincideConEsquinaProyectada(
      piece.outline,
      endpoint.local,
      outlineCorners,
    );
    const sideLength = distances.cw.mm + distances.ccw.mm;
    const entries: Array<{ direction: 'ccw' | 'cw'; distance: EdgeDistance }> = [
      { direction: 'ccw', distance: distances.ccw },
      { direction: 'cw', distance: distances.cw },
    ];

    for (const { direction, distance } of entries) {
      const cornerPattern = pieceLocalToPattern(distance.corner, piece);
      const outward = normalHaciaFuera(cornerPattern, endpointPattern, centro);
      cotas.push({
        id: `${idBase}-borde-${endpoint.index}-${direction}`,
        kind: 'borde',
        label: `Borde · ${nombreCorto(distance.corner)}`,
        valueMm: distance.mm,
        unit: 'mm',
        min: 0.001,
        max: coincidesConEsquina ? distance.mm : sideLength,
        primary: false,
        a: cornerPattern,
        b: endpointPattern,
        outward,
        apply: (mm) => {
          const path = copiaConExtremo(line.path, endpoint.index, distance.write(mm));
          return path
            ? { kind: 'internal', pieceId: piece.id, lineId: line.id, path }
            : null;
        },
      });
    }
  }

  return cotas;
}

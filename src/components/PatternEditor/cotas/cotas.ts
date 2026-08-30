import type { PatternPiece, Point2D } from '../../../types/types';
import { computeBoundingBox, bboxPivot, rotatePoint } from '../../../utils/geometry/transform';
import { resizePieceTo, type TransformUpdate } from '../pieceResize';

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
  kind: 'ancho' | 'alto';
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
  apply(valueMm: number): TransformUpdate | null;
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
      apply: (w) => resizePieceTo(piece, w, bbox.height),
    },
    {
      id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: bbox.height, unit: 'mm',
      min: MEDIDA_MIN, max: MEDIDA_MAX, primary: true,
      a: ne, b: se, outward: giraVector({ x: 1, y: 0 }, rad),
      apply: (h) => resizePieceTo(piece, bbox.width, h),
    },
  ];
}

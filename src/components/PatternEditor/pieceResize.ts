import type { PatternPiece, PathCommand, Point2D } from '../../types/types';
import {
  computeBoundingBox, scaleOutline, scaleAnchorForHandle, rotatePoint, bboxPivot,
  outlineBBoxCenter, type BBox,
} from '../../utils/geometry/transform';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { reanchorTransformedNotches } from '../../utils/notchReanchor';

export interface TransformUpdate {
  id: string;
  outline: PatternPiece['outline'];
  position: Point2D;
  internals: PatternPiece['internals'];
  /** Grados. El giro es declarativo desde #1033 — ver `useTransformTool.handleMouseUp`. */
  rotation: number;
}

/**
 * Carry a piece's internals through the same transform as its outline. The box
 * moves the piece as a plane, so grainlines, darts and piquetes have to move
 * with it — rewriting the outline alone strands every one of them at its old
 * coordinates (nota de María #171, reached by a handle instead of a node).
 * Notches then get their anchors re-derived, which also redraws the mark at
 * its true size rather than stretching it with the piece.
 */
export function transformInternals(
  snap: PatternPiece,
  newOutline: PatternPiece['outline'],
  mapPath: (path: PathCommand[]) => PathCommand[],
  mapPoint: (pt: Point2D) => Point2D,
): PatternPiece['internals'] {
  const mapped = snap.internals.map(line => ({ ...line, path: mapPath(line.path) }));
  return reanchorTransformedNotches(mapped, snap.outline, newOutline, mapPoint);
}

/**
 * Escala un grupo de piezas alrededor de un ancla dada en el marco SIN girar
 * de la caja. Es el bloque que vivía en `useTransformTool.handleMouseUp`
 * (#1066, maria-198), extraído para que el manejador y la cota escrita pasen
 * por el MISMO camino: "Ancho = 300" y arrastrar el handle `se` son la misma
 * operación (spec cotas vivas 2026-08-30 § 4.3).
 *
 * El ancla nace en el marco sin girar de la caja. Colocarla con el propio
 * transform de la caja la lleva a espacio de patrón, y de ahí cada pieza la
 * baja a SU local; con `radCaja` 0 la fórmula devuelve el ancla intacta. El
 * ancla LOCAL es punto fijo del escalado; lo único que puede moverla en
 * pantalla es que escalar corre el centro del contorno (el pivote del
 * renderizador), y eso es lo que se compensa en `position`.
 */
export function scalePiecesAroundAnchor(
  snapshot: PatternPiece[],
  bbox: BBox,
  scaleX: number,
  scaleY: number,
  anchorUnrotated: Point2D,
): TransformUpdate[] {
  const radCaja = ((bbox.rotation ?? 0) * Math.PI) / 180;
  const anchorPatron = radCaja
    ? rotatePoint(anchorUnrotated, bboxPivot(bbox), radCaja)
    : anchorUnrotated;
  const updates: TransformUpdate[] = [];
  for (const snap of snapshot) {
    const localCenter = patternToPieceLocal(anchorPatron, snap);
    // El pivote del renderizador es el de ESTA pieza, no el de la caja: en
    // grupo la caja no gira (`rotation: 0`) y la pieza sí.
    const rad = ((snap.rotation ?? 0) * Math.PI) / 180;
    const newOutline = scaleOutline(snap.outline, localCenter, scaleX, scaleY);
    const plantado = pieceLocalToPattern(localCenter, snap);
    const nuevoCentro = outlineBBoxCenter(newOutline);
    const alNuevoPivote = rotatePoint(localCenter, nuevoCentro, rad);
    updates.push({
      id: snap.id,
      outline: newOutline,
      position: { x: plantado.x - alNuevoPivote.x, y: plantado.y - alNuevoPivote.y },
      rotation: snap.rotation ?? 0,
      internals: transformInternals(
        snap,
        newOutline,
        path => scaleOutline(path, localCenter, scaleX, scaleY),
        pt => ({
          x: localCenter.x + (pt.x - localCenter.x) * scaleX,
          y: localCenter.y + (pt.y - localCenter.y) * scaleY,
        }),
      ),
    });
  }
  return updates;
}

/**
 * "Como si arrastraras el manejador inferior derecho": la esquina superior
 * izquierda queda plantada, el ancho y el alto se escriben en absoluto.
 * `null` si la medida no es positiva o la pieza no tiene área.
 */
export function resizePieceTo(
  piece: PatternPiece,
  widthMm: number,
  heightMm: number,
): TransformUpdate | null {
  if (!(widthMm > 0) || !(heightMm > 0)) return null;
  const bbox = computeBoundingBox([piece], [piece.id]);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;
  const anchor = scaleAnchorForHandle('se', bbox);
  return scalePiecesAroundAnchor(
    [piece], bbox, widthMm / bbox.width, heightMm / bbox.height, anchor,
  )[0];
}

import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { screenToPatternLength } from './coords';

export type HandleId = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'rotate';

export interface HandlePosition {
  id: HandleId;
  pos: Point2D;
  cursor: string;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Orientación de la caja, en grados — la de la pieza. Ausente o 0 = caja
   * eje-alineada, que es todo el comportamiento anterior a #1033.
   *
   * `x/y/width/height` describen la caja SIN girar; `rotation` y `pivot` dicen
   * cómo colocarla. Es el mismo par que aplica `PieceRenderer.tsx:130`
   * (`rotate(piece.rotation, cx, cy)`), y por eso la caja le cae encima a la
   * pieza por construcción y no por coincidencia.
   */
  rotation?: number;
  /** Punto de giro en espacio de patrón. Ausente = centro de la caja. */
  pivot?: Point2D;
}

/** El punto sobre el que gira una caja. Sin `pivot` explícito, su centro. */
export function bboxPivot(bbox: BBox): Point2D {
  return bbox.pivot ?? { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

const bboxRad = (bbox: BBox): number => ((bbox.rotation ?? 0) * Math.PI) / 180;

const ROTATION_ARM_LENGTH = 25; // pixels (will be divided by zoom)

// Commands whose values are not simple (x,y) pairs — skip for transform math
const NON_XY_PAIR_COMMANDS = new Set(['Z', 'H', 'V', 'A']);

/**
 * Compute the axis-aligned bounding box encompassing all selected pieces.
 * Accounts for piece position offset and all path coordinate values
 * (including bezier control points).
 */
export function computeBoundingBox(
  pieces: PatternPiece[],
  selectedIds: string[],
): BBox | null {
  const selected = pieces.filter(p => selectedIds.includes(p.id));
  if (selected.length === 0) return null;

  // Una sola pieza: la caja se orienta como ella. Sale del contorno CRUDO
  // (sin girar) más `rotation`/`pivot`, que es exactamente el transform que el
  // renderizador ya aplica — así la caja y la pieza no pueden separarse.
  if (selected.length === 1) {
    const piece = selected[0];
    const box = aabbOfPoints(piecePoints(piece, false));
    if (!box) return null;
    const c = outlineBBoxCenter(piece.outline);
    return {
      ...box,
      rotation: piece.rotation ?? 0,
      pivot: {
        x: (piece.position?.x ?? 0) + c.x,
        y: (piece.position?.y ?? 0) + c.y,
      },
    };
  }

  // Varias piezas: cada una gira sobre SU propio centro, así que no existe una
  // caja orientada honesta para el grupo — sería inventarle al conjunto una
  // orientación que ninguna de sus partes tiene. Se devuelve la eje-alineada
  // de la geometría YA girada, que además arregla el caso de hoy: antes la
  // selección múltiple ignoraba la rotación y encuadraba mal cualquier pieza
  // girada.
  const box = aabbOfPoints(selected.flatMap(p => piecePoints(p, true)));
  if (!box) return null;
  // El pivote NO puede ser el centro de esa caja: el AABB de geometría girada
  // se muda al girar, así que girar el grupo y desgirarlo lo dejaría corrido.
  // El centroide de los pivotes propios sí sobrevive — rotar un conjunto de
  // puntos alrededor de su centroide conserva el centroide.
  return { ...box, rotation: 0, pivot: centroidOfPivots(selected) };
}

/** Centroide de los pivotes de giro propios de cada pieza. Invariante bajo
 *  una rotación rígida del grupo alrededor de él mismo. */
function centroidOfPivots(pieces: PatternPiece[]): Point2D {
  let sx = 0, sy = 0;
  for (const p of pieces) {
    const c = outlineBBoxCenter(p.outline);
    sx += (p.position?.x ?? 0) + c.x;
    sy += (p.position?.y ?? 0) + c.y;
  }
  return { x: sx / pieces.length, y: sy / pieces.length };
}

/**
 * Los puntos de una pieza en espacio de patrón. Con `rotated`, pasados por el
 * giro del renderizador; sin él, el contorno crudo desplazado por `position`.
 */
function piecePoints(piece: PatternPiece, rotated: boolean): Point2D[] {
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;
  const rad = ((piece.rotation ?? 0) * Math.PI) / 180;
  const center = rotated && rad ? outlineBBoxCenter(piece.outline) : null;
  const out: Point2D[] = [];
  for (const cmd of piece.outline) {
    if (NON_XY_PAIR_COMMANDS.has(cmd.type)) continue;
    const v = cmd.values;
    for (let i = 0; i + 1 < v.length; i += 2) {
      const pt = center
        ? rotatePoint({ x: v[i], y: v[i + 1] }, center, rad)
        : { x: v[i], y: v[i + 1] };
      out.push({ x: pt.x + ox, y: pt.y + oy });
    }
  }
  return out;
}

function aabbOfPoints(pts: Point2D[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the 9 handle positions (8 resize + 1 rotation) for a bounding box.
 */
export function computeHandlePositions(bbox: BBox, zoom = 1): HandlePosition[] {
  const { x, y, width, height } = bbox;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const armLen = screenToPatternLength(ROTATION_ARM_LENGTH, zoom);

  const handles: HandlePosition[] = [
    { id: 'nw', pos: { x, y }, cursor: 'nwse-resize' },
    { id: 'n', pos: { x: cx, y }, cursor: 'ns-resize' },
    { id: 'ne', pos: { x: x + width, y }, cursor: 'nesw-resize' },
    { id: 'w', pos: { x, y: cy }, cursor: 'ew-resize' },
    { id: 'e', pos: { x: x + width, y: cy }, cursor: 'ew-resize' },
    { id: 'sw', pos: { x, y: y + height }, cursor: 'nesw-resize' },
    { id: 's', pos: { x: cx, y: y + height }, cursor: 'ns-resize' },
    { id: 'se', pos: { x: x + width, y: y + height }, cursor: 'nwse-resize' },
    { id: 'rotate', pos: { x: cx, y: y - armLen }, cursor: 'grab' },
  ];

  // Los tiradores viajan con la caja. Antes se quedaban donde la pieza SIN
  // girar: medido en #1033, el de giro caía en el mismo punto para 0°, 45° y
  // 90°, así que se agarraba donde no estaba.
  const rad = bboxRad(bbox);
  if (!rad) return handles;
  const pivot = bboxPivot(bbox);
  // ponytail: el `cursor` no rota con el tirador — a 45° la flecha apunta
  // torcida. Se corrige mapeando el ángulo a los 4 cursores diagonales si
  // alguien lo reporta; no vale una tabla de 8 entradas por adelantado.
  return handles.map(h => ({ ...h, pos: rotatePoint(h.pos, pivot, rad) }));
}

/**
 * Scale all coordinate values in a PathCommand[] around a center point.
 */
export function scaleOutline(
  outline: PathCommand[],
  center: Point2D,
  scaleX: number,
  scaleY: number,
): PathCommand[] {
  return outline.map(cmd => {
    if (NON_XY_PAIR_COMMANDS.has(cmd.type) || cmd.values.length === 0) return cmd;
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      newValues[i] = center.x + (newValues[i] - center.x) * scaleX;
      if (i + 1 < newValues.length) {
        newValues[i + 1] = center.y + (newValues[i + 1] - center.y) * scaleY;
      }
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Rotate all coordinate values in a PathCommand[] around a center point.
 * Angle is in radians.
 */
export function rotateOutline(
  outline: PathCommand[],
  center: Point2D,
  angle: number,
): PathCommand[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map(cmd => {
    if (NON_XY_PAIR_COMMANDS.has(cmd.type) || cmd.values.length === 0) return cmd;
    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i += 2) {
      const dx = newValues[i] - center.x;
      const dy = i + 1 < newValues.length ? newValues[i + 1] - center.y : 0;
      newValues[i] = center.x + dx * cos - dy * sin;
      if (i + 1 < newValues.length) {
        newValues[i + 1] = center.y + dx * sin + dy * cos;
      }
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Rotate a single point around a center. Angle in radians, same handedness as
 * {@link rotateOutline} and SVG `rotate()` — so a piece rendered with
 * `rotate(deg, cx, cy)` and a point rotated by `deg·π/180` about `(cx,cy)` land
 * in the same place. Pass a negative angle to invert (screen → piece-local).
 */
export function rotatePoint(pt: Point2D, center: Point2D, angle: number): Point2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Bounding-box center of a piece-local outline — the pivot the 2D renderer
 * rotates each piece around (`rotate(piece.rotation, cx, cy)`). Includes bezier
 * control points, so edit overlays and hit-tests share the renderer's exact
 * pivot. Empty outline → origin.
 */
export function outlineBBoxCenter(outline: PathCommand[]): Point2D {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const seen = (x: number, y: number) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const cmd of outline) {
    const v = cmd.values;
    if (cmd.type === 'M' || cmd.type === 'L') {
      seen(v[0], v[1]);
    } else if (cmd.type === 'C') {
      for (let i = 0; i < 6; i += 2) seen(v[i], v[i + 1]);
    } else if (cmd.type === 'Q') {
      for (let i = 0; i < 4; i += 2) seen(v[i], v[i + 1]);
    } else if (cmd.type === 'H') {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    } else if (cmd.type === 'V') {
      if (v[0] < minY) minY = v[0]; if (v[0] > maxY) maxY = v[0];
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Hit-test: find which handle (if any) is under the given pattern-space point.
 */
export function hitTestHandle(
  point: Point2D,
  handles: HandlePosition[],
  threshold: number,
): HandleId | null {
  for (const h of handles) {
    if (Math.hypot(point.x - h.pos.x, point.y - h.pos.y) <= threshold) {
      return h.id;
    }
  }
  return null;
}

/**
 * Anchor (fixed point) for a resize drag: the side/corner OPPOSITE the
 * dragged handle. CAD standard (maria-198): dragging `e` keeps the west edge
 * planted instead of growing symmetric from the center — what you don't
 * drag, doesn't move. Only rotation pivots on the bbox center.
 */
export function scaleAnchorForHandle(handleId: HandleId, bbox: BBox): Point2D {
  const isLeft = ['nw', 'w', 'sw'].includes(handleId);
  const isRight = ['ne', 'e', 'se'].includes(handleId);
  const isTop = ['nw', 'n', 'ne'].includes(handleId);
  const isBottom = ['sw', 's', 'se'].includes(handleId);
  return {
    x: isLeft ? bbox.x + bbox.width : isRight ? bbox.x : bbox.x + bbox.width / 2,
    y: isTop ? bbox.y + bbox.height : isBottom ? bbox.y : bbox.y + bbox.height / 2,
  };
}

/**
 * Compute scale factors from a drag on a resize handle.
 * Returns { scaleX, scaleY } relative to the bounding box.
 */
export function computeScaleFromDrag(
  handleId: HandleId,
  bbox: BBox,
  dragStart: Point2D,
  dragCurrent: Point2D,
  uniform: boolean,
): { scaleX: number; scaleY: number } {
  // El arrastre llega en espacio de patrón, pero la caja mide en el marco
  // propio de la pieza. Sin des-girarlo, arrastrar el tirador `e` de una pieza
  // a 90° crecería a lo alto en vez de a lo ancho.
  const rad = bboxRad(bbox);
  if (rad) {
    const pivot = bboxPivot(bbox);
    dragStart = rotatePoint(dragStart, pivot, -rad);
    dragCurrent = rotatePoint(dragCurrent, pivot, -rad);
  }
  const dx = dragCurrent.x - dragStart.x;
  const dy = dragCurrent.y - dragStart.y;
  let scaleX = 1;
  let scaleY = 1;

  // Which axes does this handle affect?
  const affectsX = ['nw', 'ne', 'sw', 'se', 'e', 'w'].includes(handleId);
  const affectsY = ['nw', 'ne', 'sw', 'se', 'n', 's'].includes(handleId);
  const isLeft = ['nw', 'w', 'sw'].includes(handleId);
  const isTop = ['nw', 'n', 'ne'].includes(handleId);

  if (affectsX && bbox.width > 0) {
    scaleX = 1 + (isLeft ? -dx : dx) / bbox.width;
  }
  if (affectsY && bbox.height > 0) {
    scaleY = 1 + (isTop ? -dy : dy) / bbox.height;
  }

  // Un tirador de LADO solo toca un eje, asi que pedirle "uniforme" no hacia
  // nada: el otro se quedaba en 1 y el escalado seguia siendo no-uniforme. Eso
  // bastaba mientras `uniform` solo llegaba desde las esquinas, pero #1066 lo
  // pide tambien de lado — un grupo con piezas giradas NO puede escalarse en un
  // solo eje sin producir un paralelogramo, y `outline + rotation + position`
  // no sabe representarlo. Aca el factor del eje arrastrado se propaga al otro.
  if (uniform) {
    if (affectsX && affectsY) {
      const avg = (scaleX + scaleY) / 2;
      scaleX = avg;
      scaleY = avg;
    } else if (affectsX) {
      scaleY = scaleX;
    } else if (affectsY) {
      scaleX = scaleY;
    }
  }

  // Prevent negative/zero scale
  scaleX = Math.max(0.01, scaleX);
  scaleY = Math.max(0.01, scaleY);

  return { scaleX, scaleY };
}

/**
 * Compute rotation angle from dragging the rotation handle.
 * Returns angle in radians.
 */
export function computeRotationFromDrag(
  bbox: BBox,
  dragStart: Point2D,
  dragCurrent: Point2D,
  snapToIncrement: boolean,
): number {
  // Sobre el pivote del RENDERIZADOR, no sobre el centro geométrico de la
  // caja: son el mismo punto mientras el contorno no cambie, y con el giro
  // declarativo el contorno ya no cambia. De ahí sale que ida y vuelta sea
  // exacta en vez de aproximada (#1033).
  const { x: cx, y: cy } = bboxPivot(bbox);
  const startAngle = Math.atan2(dragStart.y - cy, dragStart.x - cx);
  const currentAngle = Math.atan2(dragCurrent.y - cy, dragCurrent.x - cx);
  let angle = currentAngle - startAngle;

  if (snapToIncrement) {
    const snap = Math.PI / 12; // 15 degrees
    angle = Math.round(angle / snap) * snap;
  }

  return angle;
}

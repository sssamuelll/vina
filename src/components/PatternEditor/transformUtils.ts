import type { PathCommand, PatternPiece, Point2D } from '../../types/types';

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
}

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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const piece of selected) {
    const ox = piece.position?.x ?? 0;
    const oy = piece.position?.y ?? 0;
    for (const cmd of piece.outline) {
      if (NON_XY_PAIR_COMMANDS.has(cmd.type)) continue;
      const v = cmd.values;
      for (let i = 0; i < v.length; i += 2) {
        const px = v[i] + ox;
        const py = v[i + 1] + oy;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
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
  const armLen = ROTATION_ARM_LENGTH / zoom;

  return [
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

  if (uniform && affectsX && affectsY) {
    const avg = (scaleX + scaleY) / 2;
    scaleX = avg;
    scaleY = avg;
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
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const startAngle = Math.atan2(dragStart.y - cy, dragStart.x - cx);
  const currentAngle = Math.atan2(dragCurrent.y - cy, dragCurrent.x - cx);
  let angle = currentAngle - startAngle;

  if (snapToIncrement) {
    const snap = Math.PI / 12; // 15 degrees
    angle = Math.round(angle / snap) * snap;
  }

  return angle;
}

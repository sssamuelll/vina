import { useState, useCallback, useRef, useMemo } from 'react';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import {
  computeBoundingBox,
  computeHandlePositions,
  hitTestHandle,
  computeScaleFromDrag,
  computeRotationFromDrag,
  scaleOutline,
  rotateOutline,
  rotatePoint,
  type HandleId,
  type BBox,
} from '../../utils/geometry/transform';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { reanchorTransformedNotches } from '../../utils/notchReanchor';

interface TransformDragState {
  handleId: HandleId;
  origin: Point2D;
  current: Point2D;
  piecesSnapshot: PatternPiece[];
  bboxSnapshot: BBox;
}

export interface TransformPreview {
  scaleX: number;
  scaleY: number;
  rotation: number;
  centerX: number;
  centerY: number;
}

const HANDLE_HIT_THRESHOLD = 8; // screen pixels

export interface TransformUpdate {
  id: string;
  outline: PatternPiece['outline'];
  position: Point2D;
  internals: PatternPiece['internals'];
}

/**
 * Carry a piece's internals through the same transform as its outline. The box
 * moves the piece as a plane, so grainlines, darts and piquetes have to move
 * with it — rewriting the outline alone strands every one of them at its old
 * coordinates (nota de María #171, reached by a handle instead of a node).
 * Notches then get their anchors re-derived, which also redraws the mark at
 * its true size rather than stretching it with the piece.
 */
function transformInternals(
  snap: PatternPiece,
  newOutline: PatternPiece['outline'],
  mapPath: (path: PathCommand[]) => PathCommand[],
  mapPoint: (pt: Point2D) => Point2D,
): PatternPiece['internals'] {
  const mapped = snap.internals.map(line => ({ ...line, path: mapPath(line.path) }));
  return reanchorTransformedNotches(mapped, snap.outline, newOutline, mapPoint);
}

export function useTransformTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  selectedPieceIds: string[],
  onTransform: (updates: TransformUpdate[]) => void,
) {
  const [drag, setDrag] = useState<TransformDragState | null>(null);
  const dragRef = useRef<TransformDragState | null>(null);
  const shiftRef = useRef(false);

  const bbox = useMemo(
    () => computeBoundingBox(pieces, selectedPieceIds),
    [pieces, selectedPieceIds],
  );
  const handles = useMemo(
    () => (bbox ? computeHandlePositions(bbox, zoom2D) : []),
    [bbox, zoom2D],
  );

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!bbox || handles.length === 0) return false;
      const pt = toPattern(e);
      const threshold = screenToPatternLength(HANDLE_HIT_THRESHOLD, zoom2D);
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return false;

      const snapshot = pieces.filter(p => selectedPieceIds.includes(p.id)).map(p => ({
        ...p,
        outline: p.outline.map(cmd => ({ ...cmd, values: [...cmd.values] })),
        position: { ...p.position },
      }));

      const state: TransformDragState = {
        handleId: hitId,
        origin: pt,
        current: pt,
        piecesSnapshot: snapshot,
        bboxSnapshot: { ...bbox },
      };
      dragRef.current = state;
      shiftRef.current = e.shiftKey;
      setDrag(state);
      return true;
    },
    [bbox, handles, toPattern, pieces, selectedPieceIds, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!dragRef.current) return false;
      shiftRef.current = e.shiftKey;
      const pt = toPattern(e);
      const updated = { ...dragRef.current, current: pt };
      dragRef.current = updated;
      setDrag(updated);
      return true;
    },
    [toPattern],
  );

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) {
      dragRef.current = null;
      setDrag(null);
      return;
    }

    const snappedBbox = d.bboxSnapshot;
    const center: Point2D = { x: snappedBbox.x + snappedBbox.width / 2, y: snappedBbox.y + snappedBbox.height / 2 };
    const updates: TransformUpdate[] = [];

    if (d.handleId === 'rotate') {
      const angle = computeRotationFromDrag(snappedBbox, d.origin, d.current, shiftRef.current);
      for (const snap of d.piecesSnapshot) {
        const ox = snap.position.x;
        const oy = snap.position.y;
        // Rotate outline points relative to global center (adjusted for piece position)
        const localCenter = { x: center.x - ox, y: center.y - oy };
        const newOutline = rotateOutline(snap.outline, localCenter, angle);
        // Also rotate the piece position around global center
        const dx = ox - center.x;
        const dy = oy - center.y;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const newPos = {
          x: center.x + dx * cos - dy * sin,
          y: center.y + dx * sin + dy * cos,
        };
        updates.push({
          id: snap.id,
          outline: newOutline,
          position: newPos,
          internals: transformInternals(
            snap,
            newOutline,
            path => rotateOutline(path, localCenter, angle),
            pt => rotatePoint(pt, localCenter, angle),
          ),
        });
      }
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(d.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(d.handleId, snappedBbox, d.origin, d.current, uniform);
      for (const snap of d.piecesSnapshot) {
        const ox = snap.position.x;
        const oy = snap.position.y;
        const localCenter = { x: center.x - ox, y: center.y - oy };
        const newOutline = scaleOutline(snap.outline, localCenter, scaleX, scaleY);
        // Scale position offset relative to center
        const newPos = {
          x: center.x + (ox - center.x) * scaleX,
          y: center.y + (oy - center.y) * scaleY,
        };
        updates.push({
          id: snap.id,
          outline: newOutline,
          position: newPos,
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
    }

    onTransform(updates);
    dragRef.current = null;
    setDrag(null);
  }, [onTransform]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
  }, []);

  // Compute preview transform for rendering ghost during drag
  let preview: TransformPreview | null = null;
  if (drag) {
    const previewBbox = drag.bboxSnapshot;
    const center = { x: previewBbox.x + previewBbox.width / 2, y: previewBbox.y + previewBbox.height / 2 };
    if (drag.handleId === 'rotate') {
      const angle = computeRotationFromDrag(previewBbox, drag.origin, drag.current, shiftRef.current);
      preview = { scaleX: 1, scaleY: 1, rotation: angle, centerX: center.x, centerY: center.y };
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(drag.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(drag.handleId, previewBbox, drag.origin, drag.current, uniform);
      preview = { scaleX, scaleY, rotation: 0, centerX: center.x, centerY: center.y };
    }
  }

  const getCursor = useCallback(
    (pt: Point2D): string | null => {
      if (!handles.length) return null;
      const threshold = screenToPatternLength(HANDLE_HIT_THRESHOLD, zoom2D);
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return null;
      return handles.find(h => h.id === hitId)?.cursor ?? null;
    },
    [handles, zoom2D],
  );

  return {
    bbox,
    handles,
    isDragging: drag !== null,
    preview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
  };
}

import { useState, useCallback, useRef, useMemo } from 'react';
import type { Point2D, PatternPiece } from '../../types/types';
import {
  computeBoundingBox,
  computeHandlePositions,
  hitTestHandle,
  computeScaleFromDrag,
  computeRotationFromDrag,
  scaleOutline,
  rotateOutline,
  type HandleId,
} from './transformUtils';

interface TransformDragState {
  handleId: HandleId;
  origin: Point2D;
  current: Point2D;
  piecesSnapshot: PatternPiece[];
}

export interface TransformPreview {
  scaleX: number;
  scaleY: number;
  rotation: number;
  centerX: number;
  centerY: number;
}

const HANDLE_HIT_THRESHOLD = 8; // screen pixels

export function useTransformTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  selectedPieceIds: string[],
  onTransform: (updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }>) => void,
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
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan2D.x) / zoom2D,
        y: (e.clientY - rect.top - pan2D.y) / zoom2D,
      };
    },
    [zoom2D, pan2D],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!bbox || handles.length === 0) return false;
      const pt = toPattern(e);
      const threshold = HANDLE_HIT_THRESHOLD / zoom2D;
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
      if (!dragRef.current || !bbox) return false;
      shiftRef.current = e.shiftKey;
      const pt = toPattern(e);
      const updated = { ...dragRef.current, current: pt };
      dragRef.current = updated;
      setDrag(updated);
      return true;
    },
    [toPattern, bbox],
  );

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d || !bbox) {
      dragRef.current = null;
      setDrag(null);
      return;
    }

    const center: Point2D = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    const updates: Array<{ id: string; outline: PatternPiece['outline']; position: Point2D }> = [];

    if (d.handleId === 'rotate') {
      const angle = computeRotationFromDrag(bbox, d.origin, d.current, shiftRef.current);
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
        updates.push({ id: snap.id, outline: newOutline, position: newPos });
      }
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(d.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(d.handleId, bbox, d.origin, d.current, uniform);
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
        updates.push({ id: snap.id, outline: newOutline, position: newPos });
      }
    }

    onTransform(updates);
    dragRef.current = null;
    setDrag(null);
  }, [bbox, onTransform]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
  }, []);

  // Compute preview transform for rendering ghost during drag
  let preview: TransformPreview | null = null;
  if (drag && bbox) {
    const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    if (drag.handleId === 'rotate') {
      const angle = computeRotationFromDrag(bbox, drag.origin, drag.current, shiftRef.current);
      preview = { scaleX: 1, scaleY: 1, rotation: angle, centerX: center.x, centerY: center.y };
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(drag.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(drag.handleId, bbox, drag.origin, drag.current, uniform);
      preview = { scaleX, scaleY, rotation: 0, centerX: center.x, centerY: center.y };
    }
  }

  const getCursor = useCallback(
    (pt: Point2D): string | null => {
      if (!handles.length) return null;
      const threshold = HANDLE_HIT_THRESHOLD / zoom2D;
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

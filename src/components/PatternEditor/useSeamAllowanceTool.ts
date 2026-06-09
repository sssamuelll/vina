import { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { resolveSeamAllowanceClick } from '../../utils/seam/edgeHitTest';

/** Screen-pixel displacement past which a body press is treated as a drag
 *  (mirrors MIN_DRAG in useEditorInteractions). Below this a press+release is
 *  a single body-click, preserving the ratified click-to-apply behavior. */
const DRAG_THRESHOLD_PX = 3;

/**
 * Seam allowance tool — left-click and drag-to-all interaction.
 *
 * Left-click disambiguates by what it lands on (CLO3D-style selection):
 *  - near a VERTEX  → select that vertex (corner-type editing in the panel)
 *  - near an EDGE   → select that edge (per-edge width editing in the panel)
 *  - the piece BODY → apply the editor default to the WHOLE piece (the bulk
 *    seed; its command home, no longer squatting on the selection verb)
 *
 * Dragging from a piece BODY across the workspace applies the editor default to
 * every piece the cursor touches in ONE batched action (CLO3D's click-and-drag
 * "apply to all"). Vertex/edge presses stay pure clicks — the drag gesture never
 * starts on them, so the (deferred) selection model is untouched.
 *
 * Width/corner-type values are edited in the PropertiesPanel, bound to the
 * selection — properties live in panels, commands live in menus. `onApply`
 * receives the previous width so the caller can offer an undo toast.
 */
export function useSeamAllowanceTool(
  pieces: PatternPiece[],
  zoom: number,
  pan: Point2D,
  callbacks: {
    onApply: (pieceId: string, widthMm: number, prevWidthMm: number) => void;
    onApplyAll: (pieceIds: string[], widthMm: number) => void;
    /** `additive` (Shift) toggles the edge into the multi-select set. */
    onSelectEdge: (pieceId: string, edgeId: string, additive: boolean) => void;
    onSelectVertex: (pieceId: string, vertexIndex: number) => void;
  },
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const { onApply, onApplyAll, onSelectEdge, onSelectVertex } = callbacks;

  // Drag gesture state (body-drag → apply-to-all). null when not body-dragging.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    touched: Set<string>;
    singlePieceId: string;
    prevWidth: number;
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Reset any stale gesture (e.g. a previous release that happened off-canvas
    // so mouseUp never fired). Only a body press below re-arms it; a vertex/edge
    // press leaves it null so the following mouseUp is a no-op.
    dragRef.current = null;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const vThresh = screenToPatternLength(10, zoom);
    const eThresh = screenToPatternLength(12, zoom);
    const target = resolveSeamAllowanceClick(pieces, pt, vThresh, eThresh);
    if (!target) return;
    if (target.kind === 'vertex') {
      // Pure click — never start a drag on a vertex/edge (selection, not apply).
      onSelectVertex(target.pieceId, target.vertexIndex);
    } else if (target.kind === 'edge') {
      // Shift accumulates the edge into the multi-select set.
      onSelectEdge(target.pieceId, target.edgeId, !!e.shiftKey);
    } else {
      // Body press: arm the drag. The apply decision (single vs all) is made on
      // mouseUp based on whether the cursor moved past the drag threshold.
      const prev = pieces.find(p => p.id === target.pieceId)?.seamAllowance ?? 0;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        touched: new Set([target.pieceId]),
        singlePieceId: target.pieceId,
        prevWidth: prev,
      };
    }
  }, [pieces, zoom, pan, onSelectEdge, onSelectVertex]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) drag.moved = true;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const vThresh = screenToPatternLength(10, zoom);
    const eThresh = screenToPatternLength(12, zoom);
    const target = resolveSeamAllowanceClick(pieces, pt, vThresh, eThresh);
    // Only piece bodies count — Pass-1 can return vertex/edge near borders and
    // would contaminate the touched set.
    if (target && target.kind === 'piece') drag.touched.add(target.pieceId);
  }, [pieces, zoom, pan]);

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved && drag.touched.size > 0) {
      onApplyAll([...drag.touched], widthMm);
    } else {
      // No movement → single body-click, the ratified click-to-apply behavior.
      onApply(drag.singlePieceId, widthMm, drag.prevWidth);
    }
  }, [widthMm, onApply, onApplyAll]);

  return { handleMouseDown, handleMouseMove, handleMouseUp, widthMm };
}

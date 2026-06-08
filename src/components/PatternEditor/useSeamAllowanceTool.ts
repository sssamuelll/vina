import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { resolveSeamAllowanceClick } from '../../utils/seam/edgeHitTest';

/**
 * Seam allowance tool — left-click interaction.
 *
 * Left-click disambiguates by what it lands on (CLO3D-style selection):
 *  - near a VERTEX  → select that vertex (corner-type editing in the panel)
 *  - near an EDGE   → select that edge (per-edge width editing in the panel)
 *  - the piece BODY → apply the editor default to the WHOLE piece (the bulk
 *    seed; its command home, no longer squatting on the selection verb)
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
    onSelectEdge: (pieceId: string, edgeId: string) => void;
    onSelectVertex: (pieceId: string, vertexIndex: number) => void;
  },
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const { onApply, onSelectEdge, onSelectVertex } = callbacks;

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const vThresh = screenToPatternLength(10, zoom);
    const eThresh = screenToPatternLength(12, zoom);
    const target = resolveSeamAllowanceClick(pieces, pt, vThresh, eThresh);
    if (!target) return;
    if (target.kind === 'vertex') {
      onSelectVertex(target.pieceId, target.vertexIndex);
    } else if (target.kind === 'edge') {
      onSelectEdge(target.pieceId, target.edgeId);
    } else {
      const prev = pieces.find(p => p.id === target.pieceId)?.seamAllowance ?? 0;
      onApply(target.pieceId, widthMm, prev);
    }
  }, [pieces, zoom, pan, widthMm, onApply, onSelectEdge, onSelectVertex]);

  return { handleMouseDown, widthMm };
}

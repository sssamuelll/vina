import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece } from '../../types/types';

/**
 * Seam allowance tool — the explicit apply-SA command (María, hallazgo #2).
 *
 * Pieces are born NET (seamAllowance 0, drafted-pieces-born-net); this tool is
 * the reachable way to put allowance back ON PURPOSE: click a piece → apply
 * `editor.defaultSeamAllowanceWidth` as the per-piece scalar. Per-edge widths
 * are a future model (no data shape today). The other half of the tool —
 * right-click a vertex → CornerTypeMenu — is wired in PatternEditor's
 * handleContextMenu and shares the same `activeTool === 'seamAllowance'` gate.
 *
 * `onApply` receives the piece's previous width so the caller can surface an
 * undo toast when a click overwrites a deliberate custom value.
 */
export function useSeamAllowanceTool(
  pieces: PatternPiece[],
  onApply: (pieceId: string, widthMm: number, prevWidthMm: number) => void,
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
    if (!pieceId) return;
    const prev = pieces.find(p => p.id === pieceId)?.seamAllowance ?? 0;
    onApply(pieceId, widthMm, prev);
  }, [onApply, widthMm, pieces]);

  return { handleMouseDown, widthMm };
}

import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

/**
 * Seam allowance tool — the explicit apply-SA command (María, hallazgo #2).
 *
 * Pieces are born NET (seamAllowance 0, drafted-pieces-born-net); this tool is
 * the reachable way to put allowance back ON PURPOSE: click a piece → apply
 * `editor.defaultSeamAllowanceWidth` as the per-piece scalar. Per-edge widths
 * are a future model (no data shape today). The other half of the tool —
 * right-click a vertex → CornerTypeMenu — is wired in PatternEditor's
 * handleContextMenu and shares the same `activeTool === 'seamAllowance'` gate.
 */
export function useSeamAllowanceTool(
  onApply: (pieceId: string, widthMm: number) => void,
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
    if (pieceId) onApply(pieceId, widthMm);
  }, [onApply, widthMm]);

  return { handleMouseDown, widthMm };
}

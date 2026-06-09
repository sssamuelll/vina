import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, InternalLine, Point2D } from '../../types/types';
import { mapNotchAcrossSeam, type MirrorNotchResult } from '../../utils/seam/notchMirror';

export interface NotchMirrorPreview {
  sourcePiece: PatternPiece;
  notch: InternalLine;
  point: Point2D;        // source notch entry point (source-local coords)
  invert: boolean;
  mapped: MirrorNotchResult;
}

/**
 * Derive the notch-mirror preview from the current internal-line selection
 * (`selectedInternalLine`) and the shared sense toggle (`notchMirrorInvert`).
 * Pure/static — recomputes only when the selection, the toggle, or the project
 * geometry change (not per frame, F3-5). Shared by the F3 panel control and the
 * canvas ghost so they never disagree. Returns null unless a NOTCH is selected.
 */
export function useNotchMirrorPreview(): NotchMirrorPreview | null {
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const sel = useSelector((s: RootState) => s.editor.selectedInternalLine);
  const invert = useSelector((s: RootState) => s.editor.notchMirrorInvert ?? true);

  return useMemo(() => {
    if (!sel) return null;
    const sourcePiece = pieces.find(p => p.id === sel.pieceId);
    const notch = sourcePiece?.internals.find(i => i.id === sel.lineId && i.type === 'notch');
    if (!sourcePiece || !notch) return null;
    const head = notch.path[0];
    if (!head || head.values.length < 2) return null;
    const point = { x: head.values[0], y: head.values[1] };
    const mapped = mapNotchAcrossSeam({ sourcePiece, point, seams, pieces, invert });
    return { sourcePiece, notch, point, invert, mapped };
  }, [pieces, seams, sel, invert]);
}

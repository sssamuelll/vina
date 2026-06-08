import { PatternPiece, Tool2D } from '../../../types/types';

interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
  segmentSewingPhase?: string;
  topstitchMode?: string;
  walkSeamPhase?: string;
  /** Whether the seam/freesewing tool already holds its first edge */
  seamHasFirstEdge?: boolean;
  /** Width the seamAllowance tool will apply on click (editor.defaultSeamAllowanceWidth) */
  saDefaultWidthMm?: number;
}

export default function HintText({
  activeTool, pieces, penNodesLength,
  nodeEditorIsEditing, segmentSewingPhase, topstitchMode, walkSeamPhase,
  seamHasFirstEdge, saDefaultWidthMm,
}: HintTextProps) {
  const hasPieces = pieces.length > 0;

  return (
    <>
      {nodeEditorIsEditing && (
        <text
          x="50%" y="98%"
          textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)"
          fontSize="11" fontFamily="Inter, sans-serif"
        >
          Editing nodes — Drag to move · Esc to exit
        </text>
      )}

      {!hasPieces && activeTool === 'pen' && penNodesLength === 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click to add points · Drag to curve · Click first point to close · Enter to finish open · Esc to cancel
        </text>
      )}

      {(activeTool === 'seam' || activeTool === 'freesewing') && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
          {seamHasFirstEdge
            ? 'Click an edge on a different piece to sew · Esc to cancel'
            : 'Click an edge on the first piece to start a seam'}
        </text>
      )}

      {activeTool === 'segmentSewing' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Click on an edge to start segment A',
          a_start: 'Click further along the same edge to define segment A end',
          a_end: 'Click on a different piece to start segment B',
          b_start: 'Click further along the same edge to define segment B end',
          b_end: 'Press Enter to sew · Backspace to undo · Esc to cancel',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
            {msgs[segmentSewingPhase ?? 'idle'] ?? msgs.idle}
          </text>
        );
      })()}

      {(activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree' || activeTool === 'topstitchEdit') && (() => {
        const msgs: Record<string, string> = {
          seamline: 'Click an edge to add topstitch along its full length',
          segment: 'Click two points on the same edge to define topstitch segment',
          free: 'Click to add points · Enter to confirm · Backspace to undo · Esc to cancel',
          edit: 'Click a topstitch line to select and edit it',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
            {msgs[topstitchMode ?? 'seamline'] ?? msgs.seamline}
          </text>
        );
      })()}

      {activeTool === 'seamAllowance' && (
        <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
          fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
          {`Click a piece to apply ${saDefaultWidthMm ?? 10}mm · Right-click an edge for its width · a corner for corner type`}
        </text>
      )}

      {activeTool === 'walkSeam' && (() => {
        const msgs: Record<string, string> = {
          idle: 'Click an edge to start walk verification · Shift+click for manual pair',
          stationary: 'Shift+click another edge for manual pair · or auto-paired via seam data',
          walking: 'Hover along edge to walk · Click to reset · Esc to clear',
        };
        return (
          <text x="50%" y="98%" textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)" fontSize="11" fontFamily="Inter, sans-serif">
            {msgs[walkSeamPhase ?? 'idle'] ?? msgs.idle}
          </text>
        );
      })()}
    </>
  );
}

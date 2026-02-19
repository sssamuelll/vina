import { PatternPiece, Tool2D } from '../../../types/types';

interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  seamFirstEdge: boolean;
  nodeEditorIsEditing: boolean;
  measurementsLength: number;
  measureCurrentStart: boolean;
}

export default function HintText({
  activeTool, pieces, penNodesLength, seamFirstEdge,
  nodeEditorIsEditing, measurementsLength, measureCurrentStart,
}: HintTextProps) {
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

      {pieces.length === 0 && activeTool !== 'pen' && (
        <text
          x="50%" y="50%"
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="15" fontFamily="Inter, sans-serif"
        >
          Select the Pen tool (P) to draw pattern pieces
        </text>
      )}

      {activeTool === 'notch' && pieces.length > 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click on a piece edge to place a notch mark
        </text>
      )}

      {activeTool === 'grainline' && pieces.length > 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click and drag inside a piece to set grain direction
        </text>
      )}

      {activeTool === 'seam' && !seamFirstEdge && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click an edge on piece A · Then click an edge on piece B · Esc to cancel
        </text>
      )}
      {activeTool === 'seam' && seamFirstEdge && (
        <text x="50%" y="95%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(46, 204, 113, 0.5)" fontSize="12" fontFamily="Inter, sans-serif">
          Edge A selected — now click an edge on a different piece
        </text>
      )}

      {activeTool === 'measure' && measurementsLength === 0 && !measureCurrentStart && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click two points to measure distance · Esc to clear · Delete to remove last
        </text>
      )}

      {activeTool === 'pen' && penNodesLength === 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click to add points · Drag to curve · Click first point to close · Enter to finish open · Esc to cancel
        </text>
      )}
    </>
  );
}

import { PatternPiece, Tool2D } from '../../../types/types';

interface HintTextProps {
  activeTool: Tool2D;
  pieces: PatternPiece[];
  penNodesLength: number;
  nodeEditorIsEditing: boolean;
}

export default function HintText({
  activeTool, pieces, penNodesLength,
  nodeEditorIsEditing,
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

      {!hasPieces && activeTool !== 'pen' && (
        <text
          x="50%" y="50%"
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="15" fontFamily="Inter, sans-serif"
        >
          Select the Pen tool (P) to draw pattern pieces
        </text>
      )}

      {!hasPieces && activeTool === 'pen' && penNodesLength === 0 && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
          Click to add points · Drag to curve · Click first point to close · Enter to finish open · Esc to cancel
        </text>
      )}
    </>
  );
}

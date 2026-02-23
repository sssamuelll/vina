import { PatternPiece, Point2D } from '../../../../types/types';
import { getEdgeEndpoints } from '../../useSeamTool';

interface SeamEdge {
  pieceId: string;
  edgeIndex: number;
  midpoint: Point2D;
}

interface SeamToolOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  firstEdge: SeamEdge | null;
  hoveredEdge: SeamEdge | null;
}

export default function SeamToolOverlay({ zoom2D, pieces, firstEdge, hoveredEdge }: SeamToolOverlayProps) {
  return (
    <g className="seam-tool-wip">
      {firstEdge && (() => {
        const piece = pieces.find(p => p.id === firstEdge.pieceId);
        if (!piece) return null;
        const ep = getEdgeEndpoints(piece.outline, firstEdge.edgeIndex);
        if (!ep) return null;
        return (
          <line
            x1={ep.start.x + piece.position.x} y1={ep.start.y + piece.position.y}
            x2={ep.end.x + piece.position.x} y2={ep.end.y + piece.position.y}
            stroke="#2ecc71"
            strokeWidth={3 / zoom2D}
            strokeLinecap="round"
          />
        );
      })()}
      {hoveredEdge && (() => {
        const piece = pieces.find(p => p.id === hoveredEdge.pieceId);
        if (!piece) return null;
        const ep = getEdgeEndpoints(piece.outline, hoveredEdge.edgeIndex);
        if (!ep) return null;
        return (
          <line
            x1={ep.start.x + piece.position.x} y1={ep.start.y + piece.position.y}
            x2={ep.end.x + piece.position.x} y2={ep.end.y + piece.position.y}
            stroke={firstEdge ? '#3498db' : '#2ecc71'}
            strokeWidth={2.5 / zoom2D}
            strokeLinecap="round"
            opacity={0.7}
          />
        );
      })()}
      {firstEdge && hoveredEdge && firstEdge.pieceId !== hoveredEdge.pieceId && (
        <line
          x1={firstEdge.midpoint.x} y1={firstEdge.midpoint.y}
          x2={hoveredEdge.midpoint.x} y2={hoveredEdge.midpoint.y}
          stroke="#2ecc71"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5}
        />
      )}
    </g>
  );
}

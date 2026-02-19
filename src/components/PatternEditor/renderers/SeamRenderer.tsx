import { PatternPiece, Seam } from '../../../types/types';
import { getEdgeEndpoints } from '../useSeamTool';

interface SeamRendererProps {
  seams: Seam[];
  pieces: PatternPiece[];
  zoom2D: number;
  selectedSeamId: string | null;
}

export default function SeamRenderer({ seams, pieces, zoom2D, selectedSeamId }: SeamRendererProps) {
  return (
    <>
      {seams.map(seam => {
        const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
        const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
        if (!pieceA || !pieceB) return null;
        const epA = getEdgeEndpoints(pieceA.outline, seam.pieceA.edgeStart);
        const epB = getEdgeEndpoints(pieceB.outline, seam.pieceB.edgeStart);
        if (!epA || !epB) return null;
        const midA = {
          x: (epA.start.x + epA.end.x) / 2 + pieceA.position.x,
          y: (epA.start.y + epA.end.y) / 2 + pieceA.position.y,
        };
        const midB = {
          x: (epB.start.x + epB.end.x) / 2 + pieceB.position.x,
          y: (epB.start.y + epB.end.y) / 2 + pieceB.position.y,
        };
        const isSelected = selectedSeamId === seam.id;
        return (
          <g key={seam.id} className="seam-connection">
            <line
              x1={epA.start.x + pieceA.position.x} y1={epA.start.y + pieceA.position.y}
              x2={epA.end.x + pieceA.position.x} y2={epA.end.y + pieceA.position.y}
              stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
              strokeWidth={2.5 / zoom2D}
              strokeLinecap="round"
            />
            <line
              x1={epB.start.x + pieceB.position.x} y1={epB.start.y + pieceB.position.y}
              x2={epB.end.x + pieceB.position.x} y2={epB.end.y + pieceB.position.y}
              stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
              strokeWidth={2.5 / zoom2D}
              strokeLinecap="round"
            />
            <line
              x1={midA.x} y1={midA.y}
              x2={midB.x} y2={midB.y}
              stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
              opacity={0.6}
            />
            <circle cx={midA.x} cy={midA.y} r={3 / zoom2D} fill="#e74c3c" />
            <circle cx={midB.x} cy={midB.y} r={3 / zoom2D} fill="#e74c3c" />
          </g>
        );
      })}
    </>
  );
}

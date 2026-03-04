import type { Point2D, PatternPiece } from '../../../../types/types';

interface TopstitchOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  mode: string;
  hoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  segSnapA: { point: Point2D; edgeIndex: number; t: number; pieceId: string } | null;
  segHover: { point: Point2D } | null;
  freePieceId: string | null;
  freePoints: Point2D[];
  freeCursor: Point2D | null;
  hoveredSnapPoint: Point2D | null;
}

export default function TopstitchOverlay({
  zoom2D, pieces, mode, hoveredEdge, segSnapA, segHover,
  freePieceId, freePoints, freeCursor, hoveredSnapPoint,
}: TopstitchOverlayProps) {
  const color = '#e67e22'; // orange for topstitch

  return (
    <g className="topstitch-overlay">
      {/* Snap indicator */}
      {hoveredSnapPoint && (
        <circle cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
          r={4 / zoom2D} fill={color} opacity={0.5} pointerEvents="none" />
      )}

      {/* Seamline mode: highlight hovered edge */}
      {mode === 'seamline' && hoveredEdge && (
        <line
          x1={hoveredEdge.start.x} y1={hoveredEdge.start.y}
          x2={hoveredEdge.end.x} y2={hoveredEdge.end.y}
          stroke={color} strokeWidth={3 / zoom2D}
          strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
          opacity={0.7} pointerEvents="none"
        />
      )}

      {/* Segment mode: first snap point */}
      {mode === 'segment' && segSnapA && (
        <circle cx={segSnapA.point.x} cy={segSnapA.point.y}
          r={5 / zoom2D} fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
          pointerEvents="none" />
      )}

      {/* Segment mode: hover point */}
      {mode === 'segment' && segHover && (
        <circle cx={segHover.point.x} cy={segHover.point.y}
          r={4 / zoom2D} fill={color} opacity={0.5} pointerEvents="none" />
      )}

      {/* Free mode: polyline preview */}
      {mode === 'free' && freePieceId && freePoints.length > 0 && (() => {
        const piece = pieces.find(p => p.id === freePieceId);
        const ox = piece?.position?.x ?? 0;
        const oy = piece?.position?.y ?? 0;
        const pts = freePoints.map(p => ({ x: p.x + ox, y: p.y + oy }));
        const allPts = freeCursor ? [...pts, freeCursor] : pts;
        if (allPts.length < 1) return null;
        const d = allPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        return (
          <g>
            <path d={d} fill="none" stroke={color} strokeWidth={2 / zoom2D}
              strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
              opacity={0.8} pointerEvents="none" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y}
                r={4 / zoom2D} fill={color} stroke="#fff" strokeWidth={1 / zoom2D}
                pointerEvents="none" />
            ))}
          </g>
        );
      })()}
    </g>
  );
}

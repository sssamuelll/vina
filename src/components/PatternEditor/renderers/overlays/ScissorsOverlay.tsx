import type { Point2D, PatternPiece } from '../../../../types/types';

interface ScissorsOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  hoveredEdgePoint: Point2D | null;
  previewValid: boolean;
}

export default function ScissorsOverlay({
  zoom2D,
  pieces,
  targetPieceId,
  startPoint,
  endPoint,
  hoveredEdgePoint,
  previewValid,
}: ScissorsOverlayProps) {
  if (!targetPieceId) return null;

  const piece = pieces.find(p => p.id === targetPieceId);
  if (!piece) return null;

  const r = 6 / zoom2D;
  const sw = 1.5 / zoom2D;
  const color = previewValid ? '#FF4444' : '#FF8888';

  return (
    <g>
      {/* Cut line preview */}
      {startPoint && endPoint && (
        <line
          x1={startPoint.x}
          y1={startPoint.y}
          x2={endPoint.x}
          y2={endPoint.y}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          pointerEvents="none"
        />
      )}

      {/* Start point */}
      {startPoint && (
        <circle
          cx={startPoint.x}
          cy={startPoint.y}
          r={r}
          fill="#FF4444"
          stroke="#fff"
          strokeWidth={1.2 / zoom2D}
          pointerEvents="none"
        />
      )}

      {/* Hover snap indicator */}
      {hoveredEdgePoint && !startPoint && (
        <circle
          cx={hoveredEdgePoint.x}
          cy={hoveredEdgePoint.y}
          r={4 / zoom2D}
          fill="#FF4444"
          opacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* End point preview */}
      {endPoint && (
        <circle
          cx={endPoint.x}
          cy={endPoint.y}
          r={r}
          fill={previewValid ? '#FF4444' : '#FF8888'}
          stroke="#fff"
          strokeWidth={1.2 / zoom2D}
          opacity={0.7}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

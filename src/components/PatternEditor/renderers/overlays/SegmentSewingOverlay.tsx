import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection, SnapResult } from '../../useSegmentSewingTool';
import { getEdgeEndpoints } from '../../../../utils/geometry/path';

interface SegmentSewingOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  phase: string;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  pendingSnap: SnapResult | null;
  hoveredSnap: SnapResult | null;
}

function SegmentHighlight({
  segment,
  piece,
  color,
  zoom2D,
}: {
  segment: SegmentSelection;
  piece: PatternPiece | undefined;
  color: string;
  zoom2D: number;
}) {
  if (!piece) return null;
  const ep = getEdgeEndpoints(piece.outline, segment.edgeIndex);
  if (!ep) return null;

  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;

  const x1 = ox + ep.start.x + (ep.end.x - ep.start.x) * segment.startT;
  const y1 = oy + ep.start.y + (ep.end.y - ep.start.y) * segment.startT;
  const x2 = ox + ep.start.x + (ep.end.x - ep.start.x) * segment.endT;
  const y2 = oy + ep.start.y + (ep.end.y - ep.start.y) * segment.endT;

  const r = 5 / zoom2D;

  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={3.5 / zoom2D}
        strokeLinecap="round" pointerEvents="none"
      />
      <circle cx={x1} cy={y1} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
      <circle cx={x2} cy={y2} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
    </g>
  );
}

export default function SegmentSewingOverlay({
  zoom2D, pieces, phase, segmentA, segmentB, pendingSnap, hoveredSnap,
}: SegmentSewingOverlayProps) {
  const colorA = '#3498db';
  const colorB = '#2ecc71';

  const midA = segmentA ? {
    x: (segmentA.startPoint.x + segmentA.endPoint.x) / 2,
    y: (segmentA.startPoint.y + segmentA.endPoint.y) / 2,
  } : null;
  const midB = segmentB ? {
    x: (segmentB.startPoint.x + segmentB.endPoint.x) / 2,
    y: (segmentB.startPoint.y + segmentB.endPoint.y) / 2,
  } : null;

  return (
    <g className="segment-sewing-overlay">
      {hoveredSnap && (
        <circle
          cx={hoveredSnap.point.x} cy={hoveredSnap.point.y}
          r={4 / zoom2D} fill="#9c27b0" opacity={0.5}
          pointerEvents="none"
        />
      )}

      {pendingSnap && (
        <circle
          cx={pendingSnap.point.x} cy={pendingSnap.point.y}
          r={5 / zoom2D}
          fill={phase === 'a_start' ? colorA : colorB}
          stroke="#fff" strokeWidth={1.2 / zoom2D}
          pointerEvents="none"
        />
      )}

      {segmentA && (
        <SegmentHighlight
          segment={segmentA}
          piece={pieces.find(p => p.id === segmentA.pieceId)}
          color={colorA}
          zoom2D={zoom2D}
        />
      )}

      {segmentB && (
        <SegmentHighlight
          segment={segmentB}
          piece={pieces.find(p => p.id === segmentB.pieceId)}
          color={colorB}
          zoom2D={zoom2D}
        />
      )}

      {midA && midB && (
        <line
          x1={midA.x} y1={midA.y} x2={midB.x} y2={midB.y}
          stroke="#2ecc71" strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5} pointerEvents="none"
        />
      )}
    </g>
  );
}

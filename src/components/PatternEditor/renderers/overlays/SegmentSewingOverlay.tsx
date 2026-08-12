import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection, SnapResult } from '../../useSegmentSewingTool';
import { SEWING_PICK_FIRST, SEWING_PICK_SECOND } from '../seamVisuals';
import { segmentArcPoints } from './segmentArc';

interface SegmentSewingOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  phase: string;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  pendingSnap: SnapResult | null;
  hoveredSnap: SnapResult | null;
}

export function SegmentHighlight({
  segment,
  piece,
  color,
  zoom2D,
  opacity = 1,
}: {
  segment: SegmentSelection;
  piece: PatternPiece | undefined;
  color: string;
  zoom2D: number;
  /** Reusado por `EdgePairOverlay` para el hover pre-press (spec § 3): más
   *  tenue que la mitad ya cerrada, misma geometría de arco. */
  opacity?: number;
}) {
  if (!piece) return null;

  const pts = segmentArcPoints(piece, segment);
  if (!pts) return null;

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const ini = pts[0];
  const fin = pts[pts.length - 1];
  const r = 5 / zoom2D;

  return (
    <g opacity={opacity}>
      <path
        d={d} fill="none"
        stroke={color} strokeWidth={3.5 / zoom2D}
        strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
      />
      <circle cx={ini.x} cy={ini.y} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
      <circle cx={fin.x} cy={fin.y} r={r}
        fill={color} stroke="#fff" strokeWidth={1.2 / zoom2D}
        pointerEvents="none" />
    </g>
  );
}

export default function SegmentSewingOverlay({
  zoom2D, pieces, phase, segmentA, segmentB, pendingSnap, hoveredSnap,
}: SegmentSewingOverlayProps) {
  // Shared pick language (Fase 6): FIRST selection green, SECOND blue —
  // this overlay had the assignment inverted relative to EdgePairOverlay,
  // teaching two contradictory color meanings for the same gesture.
  const colorA = SEWING_PICK_FIRST;
  const colorB = SEWING_PICK_SECOND;

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
          stroke={SEWING_PICK_FIRST} strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5} pointerEvents="none"
        />
      )}
    </g>
  );
}

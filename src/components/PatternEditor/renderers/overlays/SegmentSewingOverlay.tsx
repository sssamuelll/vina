import type { PatternPiece, Point2D } from '../../../../types/types';
import type { SegmentSelection, SnapResult } from '../../useSegmentSewingTool';
import { getEdgeEndpoints } from '../../../../utils/geometry/path';
import { edgeRangePolyline, slicePolylineByT } from '../../../../utils/seam';
import { SEWING_PICK_FIRST, SEWING_PICK_SECOND } from '../seamVisuals';

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

  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;

  // El tramo se recorta del TRAZO del BORDE por fracción de arco — la misma
  // parametrización con la que `closeSegment` devuelve startT/endT. Antes se
  // interpolaba linealmente entre los dos extremos, así que sobre una curva ni
  // la línea ni las dos marcas caían donde ella había clicado (maria #199); y
  // se recortaba del comando en vez del borde, así que un tramo que cruzaba
  // dos comandos se pintaba encogido dentro del primero (maria #199a).
  // La cuerda queda de reserva para lo que el aplanado no cubre (el cierre Z).
  const local = edgeRangePolyline(piece.outline, segment.edgeRange);
  let tramo: Point2D[];
  if (local.length >= 2) {
    tramo = slicePolylineByT(local, segment.startT, segment.endT);
  } else {
    const ep = getEdgeEndpoints(piece.outline, segment.edgeIndex);
    if (!ep) return null;
    const at = (t: number) => ({
      x: ep.start.x + (ep.end.x - ep.start.x) * t,
      y: ep.start.y + (ep.end.y - ep.start.y) * t,
    });
    tramo = [at(segment.startT), at(segment.endT)];
  }
  if (tramo.length < 2) return null;

  const pts = tramo.map(p => ({ x: ox + p.x, y: oy + p.y }));
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

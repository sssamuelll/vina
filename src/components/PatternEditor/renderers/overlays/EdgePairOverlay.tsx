import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection } from '../../useSegmentSewingTool';
import type { EdgeTarget } from '../../edgeGesture';
import { SegmentHighlight } from './SegmentSewingOverlay';
import { SEWING_PICK_FIRST, SEWING_PICK_SECOND } from '../seamVisuals';

interface EdgePairOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  /** La mitad ya cerrada (clic o arrastre) — se pinta con el trazo real del
   *  borde, arco a arco (maria #199). */
  segmentA: SegmentSelection | null;
  /** Lo que hay bajo el ratón ANTES de apretar (fuera de gesto). Sin rango:
   *  un clic todavía significa "el borde entero" (spec § 4.2). */
  hoveredTarget: EdgeTarget | null;
  /** El borde del press mientras el gesto sigue vivo (null fuera de gesto). */
  activeTarget: EdgeTarget | null;
  /** El rango que lleva marcado el arrastre ahora mismo (null si aún no cruzó
   *  el umbral, o si el cursor se salió del borde). */
  liveRange: [number, number] | null;
}

/** `EdgeTarget` no trae t0/t1 — solo el punto bajo el cursor. Se sintetiza un
 *  `SegmentSelection` de arco completo (0..1) para reutilizar el mismo trazo
 *  de `SegmentHighlight` que ya sigue la curva en vez de la cuerda. */
function wholeEdgeAsSegment(target: EdgeTarget): SegmentSelection {
  return {
    pieceId: target.pieceId,
    edgeIndex: target.edgeIndex,
    edgeRange: target.edgeRange,
    startT: 0,
    endT: 1,
    startPoint: target.point,
    endPoint: target.point,
  };
}

export default function EdgePairOverlay({ zoom2D, pieces, segmentA, hoveredTarget, activeTarget, liveRange }: EdgePairOverlayProps) {
  const hoveredSegment = hoveredTarget ? wholeEdgeAsSegment(hoveredTarget) : null;

  // Mientras arrastra manda el tramo en vivo. Sin esto se le sigue pintando el
  // borde entero, que es justo lo contrario de lo que está haciendo.
  const liveSegment: SegmentSelection | null = activeTarget && liveRange
    ? {
        pieceId: activeTarget.pieceId,
        edgeIndex: activeTarget.edgeIndex,
        edgeRange: activeTarget.edgeRange,
        startT: liveRange[0],
        endT: liveRange[1],
        startPoint: activeTarget.point,
        endPoint: activeTarget.point,
      }
    : null;

  // El tramo en vivo SUSTITUYE al resalte de hover, no se suma: son dos
  // lecturas del mismo sitio en pantalla (spec § 4.2 ampliación 2026-08-12).
  const displaySegment = liveSegment ?? hoveredSegment;

  return (
    <g className="edge-pair-overlay">
      {segmentA && (
        <SegmentHighlight
          segment={segmentA}
          piece={pieces.find(p => p.id === segmentA.pieceId)}
          color={SEWING_PICK_FIRST}
          zoom2D={zoom2D}
        />
      )}

      {displaySegment && (
        <SegmentHighlight
          segment={displaySegment}
          piece={pieces.find(p => p.id === displaySegment.pieceId)}
          color={segmentA ? SEWING_PICK_SECOND : SEWING_PICK_FIRST}
          zoom2D={zoom2D}
          // El tramo en vivo va a opacidad plena: lo que está marcando ahora
          // mismo no es una insinuación, como sí lo es el hover pre-gesto.
          opacity={liveSegment ? 1 : 0.7}
        />
      )}

      {segmentA && hoveredTarget && segmentA.pieceId !== hoveredTarget.pieceId && (
        <line
          x1={(segmentA.startPoint.x + segmentA.endPoint.x) / 2}
          y1={(segmentA.startPoint.y + segmentA.endPoint.y) / 2}
          x2={hoveredTarget.point.x}
          y2={hoveredTarget.point.y}
          stroke={SEWING_PICK_FIRST}
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5}
        />
      )}
    </g>
  );
}

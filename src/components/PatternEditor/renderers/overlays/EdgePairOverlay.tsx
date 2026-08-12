import type { PatternPiece } from '../../../../types/types';
import type { SegmentSelection } from '../../useSegmentSewingTool';
import type { EdgeTarget } from '../../edgeGesture';
import { SegmentHighlight } from './SegmentSewingOverlay';
import { segmentArcPoints } from './segmentArc';
import { sewnLengthMm } from '../../../../utils/seam/seamRange';
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

/** Largo (mm) del borde semántico que coincide con `edgeRange` — el target
 *  del gesto no trae `edgeName`, solo el rango de comandos, la misma unidad
 *  que produce `edgeRangeForCommand`. Sin match (borde dibujado a mano,
 *  legacy sin `SemanticEdge`): `undefined`, nunca 0 ni NaN. */
function resolveEdgeLengthMm(piece: PatternPiece | undefined, edgeRange: [number, number]): number | undefined {
  return piece?.edges?.find(e => e.segmentRange[0] === edgeRange[0] && e.segmentRange[1] === edgeRange[1])?.length;
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

  // "El momento del descubrimiento" (spec § 4.2 ampliación): el número en mm
  // del tramo, solo mientras hay arrastre vivo — nunca en hover. `liveRange`
  // sale siempre ordenado [t0,t1] ascendente, así que el extremo del arco
  // donde está el CURSOR no siempre es t1: si el press fue el extremo
  // superior (arrastre hacia t decreciente), el cursor vive en t0.
  let liveLengthLabel: { x: number; y: number; mm: number } | null = null;
  if (liveSegment && activeTarget) {
    const piece = pieces.find(p => p.id === liveSegment.pieceId);
    const mm = sewnLengthMm(
      resolveEdgeLengthMm(piece, liveSegment.edgeRange),
      { tStart: liveSegment.startT, tEnd: liveSegment.endT },
    );
    const pts = piece ? segmentArcPoints(piece, liveSegment) : null;
    if (mm != null && pts) {
      const pressIsLowerBound = Math.abs(activeTarget.t - liveSegment.startT)
        <= Math.abs(activeTarget.t - liveSegment.endT);
      const cursorPoint = pressIsLowerBound ? pts[pts.length - 1] : pts[0];
      liveLengthLabel = { x: cursorPoint.x, y: cursorPoint.y, mm };
    }
  }

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

      {liveLengthLabel && (
        // Desplazado arriba del cursor (mismo criterio que el de pen-tool:
        // centrado en el punto tapa el marcador de extremo que pinta
        // `SegmentHighlight` ahí mismo, radio 5/zoom2D).
        <g className="live-length-label" transform={`translate(${liveLengthLabel.x}, ${liveLengthLabel.y - 22 / zoom2D})`}>
          <rect
            x={-24 / zoom2D} y={-8 / zoom2D}
            width={48 / zoom2D} height={16 / zoom2D}
            rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
            pointerEvents="none"
          />
          <text
            textAnchor="middle" dominantBaseline="central"
            fill="#fff" fontSize={10 / zoom2D} pointerEvents="none"
          >
            {`${liveLengthLabel.mm.toFixed(1)} mm`}
          </text>
        </g>
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

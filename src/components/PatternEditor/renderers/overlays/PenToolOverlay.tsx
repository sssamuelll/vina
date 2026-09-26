import { memo } from 'react';
import { Point2D, UnitSystem } from '../../../../types/types';
import { HANDLE_RADIUS, ANCHOR_RADIUS } from '../../utils';
import { formatDimension } from '../../../../utils/units';
import { EDGE_HIT_PX } from '../../gestureConstants';
import type { SnapTarget } from '../../snapIndex';
import type { AngleReference } from '../../angleReference';
import { angleReferenceLabel, relativeAngle } from '../../angleReference';
import { READOUT_FONT_PX, pildoraDeMedida } from './pildoraDeMedida';

interface PenNode {
  anchor: Point2D;
  handleIn: Point2D | null;
  handleOut: Point2D | null;
}

interface PenToolOverlayProps {
  zoom2D: number;
  units: string;
  penNodes: PenNode[];
  previewPath: string;
  guidePath: string | null;
  penDistance: {
    distance: number;
    position: Point2D;
    angleDeg?: number;
    reference?: AngleReference;
  } | null;
  precisionHint?: boolean;
  /** El próximo clic cierra el contorno — enciende el anillo del origen (maria-196) */
  penWillClose: boolean;
  /**
   * Los vértices de las piezas visibles, en patrón (#1102 [11:38]: «siempre en
   * los extremos los puntos deberían aparecer»). Solo con la pluma: el gate ya
   * lo pone `ToolOverlay`, así que aquí no hace falta ningún `if` nuevo.
   */
  verticesDePiezas?: Point2D[];
  /** Lo que el próximo clic va a enganchar (#1102 [11:23]: «no se está iluminando»). */
  snapHover?: SnapTarget | null;
}

/**
 * Los puntos de las piezas, ANTES del primer clic. Van fuera del grupo
 * `pen-wip` a propósito: la queja de María es sobre el momento en que todavía
 * no ha empezado a dibujar («si yo ahora quiero crear una línea nueva que
 * empiece desde aquí»), y ese grupo solo existe con un nodo puesto. Salen del
 * mismo índice que engancha, así que lo que se dibuja y lo que atrae son el
 * mismo conjunto.
 *
 * Memoizado y aparte porque NO dependen del cursor. Dentro del overlay, cada
 * `mousemove` de la pluma cambia `snapHover` y `previewPath`, y React
 * reconciliaba de nuevo un círculo por nodo de todas las piezas visibles —
 * miles con un DXF importado, medido el 06-09. Aquí solo se rehacen cuando
 * cambian las piezas o el zoom.
 */
const VerticesDePiezas = memo(function VerticesDePiezas(
  { puntos, zoom2D }: { puntos: Point2D[]; zoom2D: number },
) {
  if (puntos.length === 0) return null;
  return (
    <g className="pen-piece-vertices" pointerEvents="none">
      {puntos.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={ANCHOR_RADIUS * 0.8 / zoom2D}
          fill="var(--piece-fill-2d)"
          stroke="var(--accent-2d)"
          strokeWidth={1 / zoom2D}
        />
      ))}
    </g>
  );
});

export default function PenToolOverlay({
  zoom2D, units, penNodes, previewPath, guidePath, penDistance, penWillClose,
  verticesDePiezas = [], snapHover = null, precisionHint = false,
}: PenToolOverlayProps) {
  const distanceText = penDistance
    ? (() => {
        const length = formatDimension(penDistance.distance, units as UnitSystem);
        if (penDistance.angleDeg === undefined || !penDistance.reference) return length;
        const angle = relativeAngle(penDistance.angleDeg, penDistance.reference);
        return `${length} · ${angle.toFixed(1)}° ${angleReferenceLabel(penDistance.reference)}`;
      })()
    : null;
  return (
    <>
      <VerticesDePiezas puntos={verticesDePiezas} zoom2D={zoom2D} />

      {/* El anillo de enganche: la misma palabra que la línea interna ya usa
          para «el próximo clic cae AQUÍ». El del CIERRE es otro y está abajo:
          uno dice dónde caerá el punto, el otro que la pieza se termina. */}
      {snapHover && (
        <circle
          className="snap-ring"
          cx={snapHover.point.x} cy={snapHover.point.y}
          r={(EDGE_HIT_PX / zoom2D) * 0.5}
          fill="none" stroke="var(--snap-2d)" strokeWidth={2 / zoom2D}
          pointerEvents="none"
        />
      )}

      {penNodes.length > 0 && (
        <g className="pen-wip">
          <path
            d={previewPath}
            fill="none"
            stroke="var(--accent-2d)"
            strokeWidth={1.5 / zoom2D}
            strokeLinejoin="round"
          />
          {guidePath && (
            <path
              d={guidePath}
              fill="none"
              stroke="rgba(74, 158, 255, 0.4)"
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
            />
          )}
          {penNodes.map((node, i) => (
            <g key={i}>
              {node.handleIn && (
                <>
                  <line
                    x1={node.anchor.x} y1={node.anchor.y}
                    x2={node.handleIn.x} y2={node.handleIn.y}
                    stroke="rgba(255, 107, 107, 0.6)"
                    strokeWidth={0.8 / zoom2D}
                  />
                  <circle
                    cx={node.handleIn.x} cy={node.handleIn.y}
                    r={HANDLE_RADIUS / zoom2D}
                    fill="#ff6b6b"
                    stroke="#fff"
                    strokeWidth={0.8 / zoom2D}
                  />
                </>
              )}
              {node.handleOut && (
                <>
                  <line
                    x1={node.anchor.x} y1={node.anchor.y}
                    x2={node.handleOut.x} y2={node.handleOut.y}
                    stroke="rgba(255, 107, 107, 0.6)"
                    strokeWidth={0.8 / zoom2D}
                  />
                  <circle
                    cx={node.handleOut.x} cy={node.handleOut.y}
                    r={HANDLE_RADIUS / zoom2D}
                    fill="#ff6b6b"
                    stroke="#fff"
                    strokeWidth={0.8 / zoom2D}
                  />
                </>
              )}
              <circle
                cx={node.anchor.x} cy={node.anchor.y}
                r={ANCHOR_RADIUS / zoom2D}
                fill={i === 0 ? '#ffd700' : 'var(--accent-2d)'}
                stroke="var(--piece-fill-2d)"
                strokeWidth={1 / zoom2D}
              />
            </g>
          ))}
          {penNodes.length > 2 && penNodes[0] && (
            <circle
              cx={penNodes[0].anchor.x}
              cy={penNodes[0].anchor.y}
              r={HANDLE_RADIUS * 3 / zoom2D}
              fill="none"
              stroke="rgba(255, 215, 0, 0.3)"
              strokeWidth={1 / zoom2D}
              pointerEvents="none"
            />
          )}
          {/* Cierre armado (maria-196): el origen se enciende — el próximo
              clic cierra la pieza AQUÍ. Sin esto el snap era invisible. */}
          {penWillClose && penNodes[0] && (
            <circle
              className="pen-close-ring"
              cx={penNodes[0].anchor.x}
              cy={penNodes[0].anchor.y}
              r={HANDLE_RADIUS * 3.5 / zoom2D}
              fill="rgba(255, 215, 0, 0.25)"
              stroke="#ffd700"
              strokeWidth={2 / zoom2D}
              pointerEvents="none"
            />
          )}
        </g>
      )}

      {penDistance && distanceText && (() => {
        const fontSize = READOUT_FONT_PX / zoom2D;
        const pill = pildoraDeMedida(distanceText, fontSize);
        return (
        // Desplazado arriba-derecha del cursor (maria-196): centrado en él
        // tapaba justo lo que estás a punto de clicar.
        <g className="pen-distance-label" pointerEvents="none" transform={`translate(${penDistance.position.x + 22 / zoom2D}, ${penDistance.position.y - 18 / zoom2D})`}>
          <rect {...pill} fill="var(--readout-bg-2d)" />
          <text
            textAnchor="middle" dominantBaseline="central"
            fill="var(--readout-ink-2d)" fontSize={fontSize} pointerEvents="none"
            style={{ fontFamily: 'var(--font-mono-2d)' }}
          >
            {distanceText}
          </text>
          {precisionHint && (
            // ENCIMA de la píldora (no debajo): debajo cruzaba justo el punto
            // del próximo clic y el vértice que engancha (revisión
            // adversarial #1166). Alineada a su mismo borde izquierdo —no
            // centrada sobre el cursor— con `textAnchor="start"` en `pill.x`.
            <text
              className="precision-hint"
              x={pill.x}
              y={pill.y - fontSize * 0.6}
              textAnchor="start"
              dominantBaseline="auto"
              fill="var(--ink-hint)"
              fontSize={fontSize}
              pointerEvents="none"
              style={{ fontFamily: 'var(--font-mono-2d)' }}
            >
              Tab · escribe la medida
            </text>
          )}
        </g>
        );
      })()}
    </>
  );
}

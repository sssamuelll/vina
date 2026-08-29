import type { Point2D, UnitSystem } from '../../../../types/types';
import { formatDimension } from '../../../../utils/units';
import { EDGE_HIT_PX } from '../../gestureConstants';
import { nodesToCommands, commandsToPathD, type PolyPenNode, type PolyPenNodeType } from '../../polyPenGeometry';
import type { SnapTarget } from '../../usePolyPenTool';

/**
 * Overlay de "Línea interna" (spec 2026-08-29 § 4.7).
 *
 * Pinta desde la misma geometría que el motor (`nodesToCommands`): un solo
 * algoritmo, así el aviso y el resultado no pueden discrepar. Tres señales
 * antes de clicar — el anillo sobre el objetivo del enganche, la goma que
 * termina en el objetivo y el fantasma del nodo con el relleno de su tipo —
 * y la píldora con el largo y el ángulo del tramo en curso.
 *
 * Tinta: tokens del papel (`--accent-2d`, `--snap-2d`, `--readout-*-2d`).
 * Ningún literal: el trinquete R3 los cuenta en .tsx.
 */
interface PolyPenToolOverlayProps {
  nodes: PolyPenNode[];
  previewPoint: Point2D | null;
  /** El ancla del press vivo: el nodo que va a nacer (ya enganchado). */
  pressPoint: Point2D | null;
  isDragging: boolean;
  dragHandle: Point2D | null;
  hover: SnapTarget | null;
  /** El latch de la barra: qué tipo de nodo va a caer. */
  nodeType: Exclude<PolyPenNodeType, 'bezier'>;
  closeArmed: boolean;
  zoom2D: number;
  units: string;
}

const fillFor = (type: PolyPenNodeType): string =>
  type === 'straight' ? 'var(--piece-fill-2d)' : 'var(--accent-2d)';

export default function PolyPenToolOverlay({
  nodes, previewPoint, pressPoint, isDragging, dragHandle, hover, nodeType, closeArmed, zoom2D, units,
}: PolyPenToolOverlayProps) {
  const z = zoom2D;
  const r = 4 / z;
  const handleR = 3 / z;
  const strokeW = 1 / z;
  const pathD = nodes.length >= 2 ? commandsToPathD(nodesToCommands(nodes, false)) : '';
  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

  // La goma termina en el objetivo del enganche, no en el cursor: la línea
  // salta y se ve. Mientras se arrastra un manejador no hay goma.
  const target = hover?.point ?? previewPoint;
  const showRubber = !!lastNode && !!target && !isDragging && !pressPoint;
  const ringAt = closeArmed && nodes.length > 0 ? nodes[0].point : hover?.point ?? null;
  const showGhost = !!target && !isDragging && !pressPoint && !closeArmed;

  // Píldora: largo y ángulo del tramo en curso. 0° a la derecha, 90° hacia
  // arriba tal como se ve en pantalla (y crece hacia abajo en el patrón).
  let readout: { at: Point2D; text: string } | null = null;
  if (lastNode && target && !isDragging && !pressPoint && !closeArmed) {
    const dx = target.x - lastNode.point.x;
    const dy = target.y - lastNode.point.y;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(-dy, dx) * 180) / Math.PI;
    readout = {
      at: { x: (previewPoint ?? target).x + 22 / z, y: (previewPoint ?? target).y - 18 / z },
      text: `${formatDimension(len, units as UnitSystem)} · ${ang.toFixed(1)}°`,
    };
  }

  return (
    <g pointerEvents="none">
      {pathD && (
        <path className="il-trace" d={pathD} fill="none" stroke="var(--accent-2d)" strokeWidth={strokeW * 1.5} />
      )}

      {showRubber && lastNode && target && (
        <line
          className="il-rubber"
          x1={lastNode.point.x} y1={lastNode.point.y} x2={target.x} y2={target.y}
          stroke="var(--accent-2d)" strokeWidth={strokeW}
          strokeDasharray={`${3 / z} ${3 / z}`} opacity={0.6}
        />
      )}

      {nodes.map((node, i) => (
        <g key={i}>
          {node.type === 'bezier' && node.handleOut && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleOut.x} y2={node.handleOut.y}
                stroke="var(--ink-on-light-3)" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleOut.x} cy={node.handleOut.y} r={handleR}
                fill="none" stroke="var(--ink-on-light-3)" strokeWidth={strokeW * 0.5} />
            </>
          )}
          {node.type === 'bezier' && node.handleIn && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleIn.x} y2={node.handleIn.y}
                stroke="var(--ink-on-light-3)" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleIn.x} cy={node.handleIn.y} r={handleR}
                fill="none" stroke="var(--ink-on-light-3)" strokeWidth={strokeW * 0.5} />
            </>
          )}
          <circle cx={node.point.x} cy={node.point.y} r={r}
            fill={fillFor(node.type)} stroke="var(--accent-2d)" strokeWidth={strokeW} />
        </g>
      ))}

      {/* Manejador en curso: el ancla es el PRESS (el nodo todavía no existe),
          no el último nodo. Simétrico, como lo guardará el motor. */}
      {isDragging && dragHandle && pressPoint && (
        <>
          <circle cx={pressPoint.x} cy={pressPoint.y} r={r}
            fill="var(--accent-2d)" stroke="var(--accent-2d)" strokeWidth={strokeW} />
          <line
            className="il-drag-handle"
            x1={dragHandle.x} y1={dragHandle.y}
            x2={2 * pressPoint.x - dragHandle.x} y2={2 * pressPoint.y - dragHandle.y}
            stroke="var(--snap-2d)" strokeWidth={strokeW}
          />
          <circle cx={dragHandle.x} cy={dragHandle.y} r={handleR}
            fill="none" stroke="var(--snap-2d)" strokeWidth={strokeW} />
        </>
      )}

      {/* Fantasma del nodo que va a caer, con el relleno de su tipo. */}
      {showGhost && target && (
        <circle
          data-node-type={nodeType}
          cx={target.x} cy={target.y} r={r}
          fill={fillFor(nodeType)} stroke="var(--accent-2d)" strokeWidth={strokeW} opacity={0.7}
        />
      )}

      {/* El anillo: la palabra que la app ya usa para "el próximo clic cae AQUÍ". */}
      {ringAt && (
        <circle
          className="snap-ring"
          cx={ringAt.x} cy={ringAt.y} r={(EDGE_HIT_PX / z) * 0.5}
          fill="none" stroke="var(--snap-2d)" strokeWidth={2 / z}
        />
      )}

      {readout && (
        <g className="il-readout" transform={`translate(${readout.at.x}, ${readout.at.y})`}>
          <rect x={-48 / z} y={-8 / z} width={96 / z} height={16 / z} rx={8 / z} fill="var(--readout-bg-2d)" />
          <text textAnchor="middle" dominantBaseline="central" fill="var(--readout-ink-2d)" fontSize={10 / z}>
            {readout.text}
          </text>
        </g>
      )}
    </g>
  );
}

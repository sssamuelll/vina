import type { PolyPenNode } from '../../usePolyPenTool';
import type { Point2D } from '../../../../types/types';

interface PolyPenToolOverlayProps {
  nodes: PolyPenNode[];
  previewPoint: Point2D | null;
  isDragging: boolean;
  dragHandle: Point2D | null;
  zoom2D: number;
}

function buildPathD(nodes: PolyPenNode[]): string {
  if (nodes.length === 0) return '';
  let d = `M ${nodes[0].point.x} ${nodes[0].point.y}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1], curr = nodes[i];
    if (curr.type === 'curve' || prev.type === 'curve') {
      const cp1 = prev.handleOut || prev.point;
      const cp2 = curr.handleIn || curr.point;
      d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.point.x} ${curr.point.y}`;
    } else {
      d += ` L ${curr.point.x} ${curr.point.y}`;
    }
  }
  return d;
}

export default function PolyPenToolOverlay({ nodes, previewPoint, isDragging, dragHandle, zoom2D }: PolyPenToolOverlayProps) {
  const r = 4 / zoom2D;
  const strokeW = 1 / zoom2D;
  const handleR = 3 / zoom2D;
  const pathD = buildPathD(nodes);
  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
  const firstNode = nodes.length >= 3 ? nodes[0] : null;
  let showClose = false;
  if (firstNode && previewPoint) {
    const dx = (previewPoint.x - firstNode.point.x) * zoom2D;
    const dy = (previewPoint.y - firstNode.point.y) * zoom2D;
    showClose = Math.hypot(dx, dy) < 8;
  }

  return (
    <g pointerEvents="none">
      {pathD && <path d={pathD} fill="none" stroke="#2196f3" strokeWidth={strokeW * 1.5} />}
      {lastNode && previewPoint && !isDragging && (
        <line x1={lastNode.point.x} y1={lastNode.point.y} x2={previewPoint.x} y2={previewPoint.y}
          stroke="#2196f3" strokeWidth={strokeW} strokeDasharray={`${3 / zoom2D} ${3 / zoom2D}`} opacity={0.6} />
      )}
      {nodes.map((node, i) => (
        <g key={i}>
          <circle cx={node.point.x} cy={node.point.y} r={r}
            fill={node.type === 'curve' ? '#2196f3' : '#fff'} stroke="#2196f3" strokeWidth={strokeW} />
          {node.type === 'curve' && node.handleOut && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleOut.x} y2={node.handleOut.y}
                stroke="#999" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleOut.x} cy={node.handleOut.y} r={handleR}
                fill="none" stroke="#999" strokeWidth={strokeW * 0.5} />
            </>
          )}
          {node.type === 'curve' && node.handleIn && (
            <>
              <line x1={node.point.x} y1={node.point.y} x2={node.handleIn.x} y2={node.handleIn.y}
                stroke="#999" strokeWidth={strokeW * 0.5} />
              <circle cx={node.handleIn.x} cy={node.handleIn.y} r={handleR}
                fill="none" stroke="#999" strokeWidth={strokeW * 0.5} />
            </>
          )}
        </g>
      ))}
      {isDragging && dragHandle && lastNode && (
        <>
          <line x1={dragHandle.x} y1={dragHandle.y}
            x2={2 * (lastNode.point.x) - dragHandle.x} y2={2 * (lastNode.point.y) - dragHandle.y}
            stroke="#ff9800" strokeWidth={strokeW} />
          <circle cx={dragHandle.x} cy={dragHandle.y} r={handleR} fill="none" stroke="#ff9800" strokeWidth={strokeW} />
        </>
      )}
      {showClose && firstNode && (
        <circle cx={firstNode.point.x} cy={firstNode.point.y} r={r * 2}
          fill="none" stroke="#4caf50" strokeWidth={strokeW * 2} />
      )}
    </g>
  );
}

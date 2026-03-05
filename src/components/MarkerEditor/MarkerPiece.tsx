import { useState, useCallback, useRef } from 'react';
import type { PlacedPiece } from '../../utils/export/cuttingLayout';

export interface MarkerPieceProps {
  piece: PlacedPiece;
  index: number;
  isSelected: boolean;
  hasCollision: boolean;
  onSelect: (index: number) => void;
  onDrag: (index: number, newPos: [number, number]) => void;
  onRotate: (index: number, degrees: number) => void;
  onContextMenu?: (index: number, e: React.MouseEvent) => void;
  gridSnap?: number;
}

/** Build SVG path d from flat coords [x0,y0,x1,y1,...] */
function coordsToPath(coords: number[]): string {
  if (coords.length < 4) return '';
  let d = `M ${coords[0]} ${coords[1]}`;
  for (let i = 2; i < coords.length; i += 2) {
    d += ` L ${coords[i]} ${coords[i + 1]}`;
  }
  d += ' Z';
  return d;
}

/** Compute center of flat coords */
function coordsCenter(coords: number[]): [number, number] {
  let cx = 0, cy = 0;
  const n = coords.length / 2;
  if (n === 0) return [0, 0];
  for (let i = 0; i < coords.length; i += 2) {
    cx += coords[i];
    cy += coords[i + 1];
  }
  return [cx / n, cy / n];
}

export default function MarkerPiece({
  piece,
  index,
  isSelected,
  hasCollision,
  onSelect,
  onDrag,
  onRotate,
  onContextMenu,
  gridSnap,
}: MarkerPieceProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; pos: [number, number] } | null>(null);
  const svgRef = useRef<SVGGElement>(null);

  const getMousePos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current?.ownerSVGElement;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm);
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(index);
    const pos = getMousePos(e);
    dragStart.current = { mx: pos.x, my: pos.y, pos: [...piece.position] as [number, number] };
    setDragging(true);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const svg = svgRef.current?.ownerSVGElement;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const ctm = svg.getScreenCTM()?.inverse();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm);

      let newX = dragStart.current.pos[0] + svgPt.x - dragStart.current.mx;
      let newY = dragStart.current.pos[1] + svgPt.y - dragStart.current.my;

      if (gridSnap && gridSnap > 0) {
        newX = Math.round(newX / gridSnap) * gridSnap;
        newY = Math.round(newY / gridSnap) * gridSnap;
      }

      onDrag(index, [newX, newY]);
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragStart.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [index, piece.position, onSelect, onDrag, getMousePos, gridSnap]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (onContextMenu) {
      onContextMenu(index, e);
    } else {
      onRotate(index, 90);
    }
  }, [index, onRotate, onContextMenu]);

  const outlinePath = coordsToPath(piece.outline);
  const saPath = piece.seamAllowance ? coordsToPath(piece.seamAllowance) : null;
  const center = coordsCenter(piece.outline);

  const fillColor = hasCollision ? 'rgba(255,80,80,0.3)' : 'rgba(100,150,255,0.2)';
  const strokeColor = hasCollision ? '#e53935' : isSelected ? '#1976d2' : '#555';
  const strokeWidth = isSelected ? 1.5 : 0.8;

  return (
    <g
      ref={svgRef}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      {/* SA outline */}
      {saPath && (
        <path
          d={saPath}
          fill="none"
          stroke="#aaa"
          strokeWidth={0.5}
          strokeDasharray="3 2"
        />
      )}
      {/* Main outline */}
      <path
        d={outlinePath}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {/* Grainline */}
      {piece.grainline && (
        <line
          x1={piece.grainline.start[0] + piece.position[0]}
          y1={piece.grainline.start[1] + piece.position[1]}
          x2={piece.grainline.end[0] + piece.position[0]}
          y2={piece.grainline.end[1] + piece.position[1]}
          stroke="#666"
          strokeWidth={0.5}
          markerEnd="url(#arrowhead)"
        />
      )}
      {/* Label */}
      <text
        x={center[0]}
        y={center[1]}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fill="#333"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {piece.pieceName}
      </text>
    </g>
  );
}

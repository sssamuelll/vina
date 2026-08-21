import { bboxPivot, type BBox, type HandlePosition } from '../../../../utils/geometry/transform';
import type { TransformPreview } from '../../useTransformTool';

interface TransformHandlesOverlayProps {
  zoom2D: number;
  bbox: BBox;
  handles: HandlePosition[];
  preview: TransformPreview | null;
}

const HANDLE_SIZE = 6;   // screen pixels
const ROTATE_RADIUS = 4; // screen pixels

export default function TransformHandlesOverlay({
  zoom2D,
  bbox,
  handles,
  preview,
}: TransformHandlesOverlayProps) {
  const hs = HANDLE_SIZE / zoom2D;
  const rr = ROTATE_RADIUS / zoom2D;
  const strokeW = 1 / zoom2D;

  // La caja se coloca con el MISMO par que el renderizador aplica a la pieza
  // (`rotate(piece.rotation, cx, cy)`), así que le cae encima por construcción.
  // Los tiradores ya llegan girados desde `computeHandlePositions`.
  const pivot = bboxPivot(bbox);
  const boxTransform = bbox.rotation
    ? `rotate(${bbox.rotation}, ${pivot.x}, ${pivot.y})`
    : undefined;

  // El fantasma: escalar pasa primero, en el marco propio, y el giro encima —
  // el mismo orden en que se commitea.
  const previewTransform = preview
    ? `rotate(${preview.rotationDeg}, ${preview.pivot.x}, ${preview.pivot.y})`
      + ` translate(${preview.anchor.x}, ${preview.anchor.y})`
      + ` scale(${preview.scaleX}, ${preview.scaleY})`
      + ` translate(${-preview.anchor.x}, ${-preview.anchor.y})`
    : undefined;

  const rotateHandle = handles.find(h => h.id === 'rotate');
  const topCenter = handles.find(h => h.id === 'n');

  return (
    <g className="transform-handles">
      {/* Bounding box */}
      <rect
        x={bbox.x}
        y={bbox.y}
        width={bbox.width}
        height={bbox.height}
        fill="none"
        stroke="var(--accent-2d)"
        strokeWidth={strokeW}
        strokeDasharray={`${4 / zoom2D}`}
        transform={boxTransform}
        pointerEvents="none"
      />

      {/* Rotation arm (line from top-center to rotation handle) */}
      {rotateHandle && topCenter && (
        <line
          x1={topCenter.pos.x}
          y1={topCenter.pos.y}
          x2={rotateHandle.pos.x}
          y2={rotateHandle.pos.y}
          stroke="var(--accent-2d)"
          strokeWidth={strokeW}
          pointerEvents="none"
        />
      )}

      {/* Resize handles (squares) */}
      {handles
        .filter(h => h.id !== 'rotate')
        .map(h => (
          <rect
            key={h.id}
            x={h.pos.x - hs / 2}
            y={h.pos.y - hs / 2}
            width={hs}
            height={hs}
            fill="var(--canvas-2d)"
            stroke="var(--accent-2d)"
            strokeWidth={strokeW}
            style={{ cursor: h.cursor }}
          />
        ))}

      {/* Rotation handle (circle) */}
      {rotateHandle && (
        <circle
          cx={rotateHandle.pos.x}
          cy={rotateHandle.pos.y}
          r={rr}
          fill="var(--canvas-2d)"
          stroke="var(--accent-2d)"
          strokeWidth={strokeW}
          style={{ cursor: 'grab' }}
        />
      )}

      {/* Preview ghost during drag */}
      {preview && (
        <rect
          x={bbox.x}
          y={bbox.y}
          width={bbox.width}
          height={bbox.height}
          fill="var(--accent-2d)"
          fillOpacity={0.1}
          stroke="var(--accent-2d)"
          strokeWidth={strokeW}
          strokeDasharray={`${2 / zoom2D}`}
          opacity={0.5}
          transform={previewTransform}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

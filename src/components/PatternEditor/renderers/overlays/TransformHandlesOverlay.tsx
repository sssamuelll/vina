import type { BBox, HandlePosition } from '../../transformUtils';
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

  // Transform string for preview ghost
  const previewTransform = preview
    ? `translate(${preview.centerX}, ${preview.centerY}) rotate(${(preview.rotation * 180) / Math.PI}) scale(${preview.scaleX}, ${preview.scaleY}) translate(${-preview.centerX}, ${-preview.centerY})`
    : undefined;

  const rotateHandle = handles.find(h => h.id === 'rotate');
  const topCenter = handles.find(h => h.id === 'n');

  return (
    <>
      {/* Bounding box */}
      <rect
        x={bbox.x}
        y={bbox.y}
        width={bbox.width}
        height={bbox.height}
        fill="none"
        stroke="#4A9EFF"
        strokeWidth={strokeW}
        strokeDasharray={`${4 / zoom2D}`}
        pointerEvents="none"
      />

      {/* Rotation arm (line from top-center to rotation handle) */}
      {rotateHandle && topCenter && (
        <line
          x1={topCenter.pos.x}
          y1={topCenter.pos.y}
          x2={rotateHandle.pos.x}
          y2={rotateHandle.pos.y}
          stroke="#4A9EFF"
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
            fill="white"
            stroke="#4A9EFF"
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
          fill="white"
          stroke="#4A9EFF"
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
          fill="rgba(74, 158, 255, 0.1)"
          stroke="#4A9EFF"
          strokeWidth={strokeW}
          strokeDasharray={`${2 / zoom2D}`}
          opacity={0.5}
          transform={previewTransform}
          pointerEvents="none"
        />
      )}
    </>
  );
}

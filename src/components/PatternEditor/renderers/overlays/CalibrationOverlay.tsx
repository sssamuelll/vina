import type { Point2D } from '../../../../types/types';

interface CalibrationOverlayProps {
  zoom2D: number;
  calibrationMode: { imageId: string; point1: Point2D | null } | null;
  cursorPosition: Point2D | null;
}

export default function CalibrationOverlay({
  zoom2D,
  calibrationMode,
  cursorPosition,
}: CalibrationOverlayProps) {
  if (!calibrationMode) return null;

  const color = '#4a9eff';
  const sw = 1.5 / zoom2D;
  const r = 5 / zoom2D;
  const crosshairSize = 8 / zoom2D;

  const { point1 } = calibrationMode;

  // Phase 1: no point1 yet — show crosshair at cursor
  if (!point1) {
    if (!cursorPosition) return null;
    return (
      <g pointerEvents="none">
        <line
          x1={cursorPosition.x - crosshairSize}
          y1={cursorPosition.y}
          x2={cursorPosition.x + crosshairSize}
          y2={cursorPosition.y}
          stroke={color}
          strokeWidth={sw}
        />
        <line
          x1={cursorPosition.x}
          y1={cursorPosition.y - crosshairSize}
          x2={cursorPosition.x}
          y2={cursorPosition.y + crosshairSize}
          stroke={color}
          strokeWidth={sw}
        />
      </g>
    );
  }

  // Phase 2: point1 set — show ruler line from point1 to cursor
  const cursor = cursorPosition;

  const midX = cursor ? (point1.x + cursor.x) / 2 : point1.x;
  const midY = cursor ? (point1.y + cursor.y) / 2 : point1.y;

  const pixelDist = cursor
    ? Math.sqrt(Math.pow(cursor.x - point1.x, 2) + Math.pow(cursor.y - point1.y, 2))
    : 0;

  const fontSize = 11 / zoom2D;
  const labelPad = 4 / zoom2D;

  return (
    <g pointerEvents="none">
      {/* Dashed ruler line */}
      {cursor && (
        <line
          x1={point1.x}
          y1={point1.y}
          x2={cursor.x}
          y2={cursor.y}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
        />
      )}

      {/* Point 1 marker */}
      <circle
        cx={point1.x}
        cy={point1.y}
        r={r}
        fill={color}
        stroke="#fff"
        strokeWidth={1.2 / zoom2D}
      />

      {/* Cursor marker */}
      {cursor && (
        <circle
          cx={cursor.x}
          cy={cursor.y}
          r={r}
          fill={color}
          stroke="#fff"
          strokeWidth={1.2 / zoom2D}
          opacity={0.8}
        />
      )}

      {/* Distance label near midpoint */}
      {cursor && pixelDist > 0 && (
        <>
          <rect
            x={midX - (28 / zoom2D)}
            y={midY - fontSize - labelPad}
            width={56 / zoom2D}
            height={fontSize + labelPad * 2}
            rx={2 / zoom2D}
            fill="rgba(0,0,0,0.65)"
          />
          <text
            x={midX}
            y={midY - labelPad / 2}
            textAnchor="middle"
            dominantBaseline="auto"
            fill={color}
            fontSize={fontSize}
            fontFamily="monospace"
          >
            {pixelDist.toFixed(1)}px
          </text>
        </>
      )}
    </g>
  );
}

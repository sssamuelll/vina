import { Point2D, UnitSystem } from '../../../../types/types';
import { formatDimension } from '../../../../utils/units';

interface RectangleToolOverlayProps {
  zoom2D: number;
  units: string;
  rectPreview: { x: number; y: number; width: number; height: number } | null;
  rectDimensions: { width: number; height: number; center: Point2D } | null;
}

export default function RectangleToolOverlay({ zoom2D, units, rectPreview, rectDimensions }: RectangleToolOverlayProps) {
  return (
    <>
      {rectPreview && (
        <rect
          x={rectPreview.x}
          y={rectPreview.y}
          width={rectPreview.width}
          height={rectPreview.height}
          fill="rgba(74, 158, 255, 0.15)"
          stroke="#4a9eff"
          strokeWidth={1.5 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}

      {rectDimensions && (() => {
        const dimText = `${formatDimension(rectDimensions.width, units as UnitSystem)} × ${formatDimension(rectDimensions.height, units as UnitSystem)}`;
        const charWidth = 5.5;
        const pillWidth = Math.max(60, dimText.length * charWidth + 16);
        return (
          <g transform={`translate(${rectDimensions.center.x}, ${rectDimensions.center.y})`}>
            <rect
              x={-pillWidth / 2 / zoom2D} y={-8 / zoom2D}
              width={pillWidth / zoom2D} height={16 / zoom2D}
              rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
            />
            <text
              textAnchor="middle" dominantBaseline="central"
              fill="#fff" fontSize={10 / zoom2D} pointerEvents="none"
            >
              {dimText}
            </text>
          </g>
        );
      })()}
    </>
  );
}

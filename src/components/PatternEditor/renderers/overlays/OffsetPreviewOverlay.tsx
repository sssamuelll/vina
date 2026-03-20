import type { PathCommand, Point2D } from '../../../../types/types';
import { pathToSVG } from '../../utils';

interface OffsetPreviewOverlayProps {
  previewOutline: PathCommand[] | null;
  piecePosition: Point2D;
  zoom2D: number;
}

export default function OffsetPreviewOverlay({
  previewOutline,
  piecePosition,
  zoom2D,
}: OffsetPreviewOverlayProps) {
  if (!previewOutline || previewOutline.length === 0) return null;

  const svgPath = pathToSVG(previewOutline);
  const sw = 1.5 / zoom2D;
  const dashLen = 5 / zoom2D;
  const gapLen = 3 / zoom2D;

  return (
    <g transform={`translate(${piecePosition.x}, ${piecePosition.y})`}>
      <path
        d={svgPath}
        fill="rgba(142, 68, 173, 0.05)"
        stroke="#8e44ad"
        strokeWidth={sw}
        strokeDasharray={`${dashLen} ${gapLen}`}
        pointerEvents="none"
      />
    </g>
  );
}

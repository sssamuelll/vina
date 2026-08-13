import type { PatternPiece, Point2D } from '../../../../types/types';
import type { NotchDragPreview } from '../../useNotchTool';
import type { SegmentSelection } from '../../useSegmentSewingTool';
import { segmentArcPoints } from './segmentArc';

interface NotchHover {
  point: Point2D;
  normal: Point2D;
}

/** Corner-reference marker shown while the precision modal is open (F3). */
export interface NotchRefineMarker {
  refWorld: Point2D;   // anchor's reference corner
  notchWorld: Point2D; // notch entry point on the outline
  /** Live landing point while a distance is being typed (ghost marker). */
  previewWorld?: Point2D | null;
}

interface NotchToolOverlayProps {
  zoom2D: number;
  pieces?: PatternPiece[];
  notchHoveredPoint: NotchHover | null;
  refineMarker?: NotchRefineMarker | null;
  dragPreview?: NotchDragPreview | null;
  dragSegment?: SegmentSelection | null;
}

export default function NotchToolOverlay({
  zoom2D,
  pieces = [],
  notchHoveredPoint,
  refineMarker,
  dragPreview,
  dragSegment,
}: NotchToolOverlayProps) {
  const dragPiece = dragSegment
    ? pieces.find(piece => piece.id === dragSegment.pieceId)
    : undefined;
  const dragArc = dragPiece && dragSegment
    ? segmentArcPoints(dragPiece, dragSegment)
    : null;

  return (
    <g className="notch-preview">
      {notchHoveredPoint && !dragPreview && (
        <>
          <line
            x1={notchHoveredPoint.point.x - notchHoveredPoint.normal.x * 4}
            y1={notchHoveredPoint.point.y - notchHoveredPoint.normal.y * 4}
            x2={notchHoveredPoint.point.x + notchHoveredPoint.normal.x * 8}
            y2={notchHoveredPoint.point.y + notchHoveredPoint.normal.y * 8}
            stroke="#ff9800"
            strokeWidth={2 / zoom2D}
            strokeLinecap="round"
            opacity={0.7}
          />
          <circle
            cx={notchHoveredPoint.point.x}
            cy={notchHoveredPoint.point.y}
            r={3 / zoom2D}
            fill="#ff9800"
            opacity={0.5}
          />
        </>
      )}
      {refineMarker && (() => {
        // While a distance is being typed, the dashed hint tracks where the
        // notch WILL land (preview ghost), not only where the click put it.
        const target = refineMarker.previewWorld ?? refineMarker.notchWorld;
        const isPreview = refineMarker.previewWorld != null;
        return (
          <g className="notch-refine-marker" pointerEvents="none">
            {/* Reference corner: the point the modal's distance is measured FROM */}
            <circle
              cx={refineMarker.refWorld.x}
              cy={refineMarker.refWorld.y}
              r={5 / zoom2D}
              fill="none"
              style={{ stroke: 'var(--notch-2d)' }}
              strokeWidth={1.6 / zoom2D}
            />
            <circle
              cx={refineMarker.refWorld.x}
              cy={refineMarker.refWorld.y}
              r={1.6 / zoom2D}
              style={{ fill: 'var(--notch-2d)' }}
            />
            {/* Measurement hint: corner → (preview | current) notch position */}
            <line
              x1={refineMarker.refWorld.x}
              y1={refineMarker.refWorld.y}
              x2={target.x}
              y2={target.y}
              style={{ stroke: 'var(--notch-2d)' }}
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              opacity={0.7}
            />
            {isPreview && (
              <circle
                cx={target.x}
                cy={target.y}
                r={3 / zoom2D}
                fill="none"
                style={{ stroke: 'var(--notch-2d)' }}
                strokeWidth={1.4 / zoom2D}
                opacity={0.9}
              />
            )}
          </g>
        );
      })()}
      {dragPreview && dragArc && (() => {
        const d = dragArc.map((point, index) => (
          `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        )).join(' ');
        return (
          <g className="notch-drag-preview" pointerEvents="none">
            <circle
              cx={dragPreview.refWorld.x}
              cy={dragPreview.refWorld.y}
              r={5 / zoom2D}
              fill="none"
              style={{ stroke: 'var(--notch-2d)' }}
              strokeWidth={1.6 / zoom2D}
            />
            <circle
              cx={dragPreview.refWorld.x}
              cy={dragPreview.refWorld.y}
              r={1.6 / zoom2D}
              style={{ fill: 'var(--notch-2d)' }}
            />
            <path
              d={d}
              fill="none"
              style={{ stroke: 'var(--notch-2d)' }}
              strokeWidth={2 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={dragPreview.currentWorld.x}
              cy={dragPreview.currentWorld.y}
              r={3 / zoom2D}
              fill="none"
              style={{ stroke: 'var(--notch-2d)' }}
              strokeWidth={1.4 / zoom2D}
            />
            <g transform={`translate(${dragPreview.currentWorld.x}, ${dragPreview.currentWorld.y - 12 / zoom2D})`}>
              <rect
                x={-24 / zoom2D}
                y={-8 / zoom2D}
                width={48 / zoom2D}
                height={16 / zoom2D}
                rx={8 / zoom2D}
                fill="rgba(0,0,0,0.75)"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize={10 / zoom2D}
              >
                {`${dragPreview.distanceMm.toFixed(1).replace('.', ',')} mm`}
              </text>
            </g>
          </g>
        );
      })()}
    </g>
  );
}

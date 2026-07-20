import type { Point2D } from '../../../types/types';
import type { AnchorRole } from '../anchorRoles';

export type AnchorVisualState = 'idle' | 'hovered' | 'selected';

export interface AnchorGlyphProps {
  role: AnchorRole;
  position: Point2D;
  zoom2D: number;
  state: AnchorVisualState;
  className?: string;
}

const STATE_COLOR: Record<AnchorVisualState, string> = {
  idle: '#4A9EFF',
  hovered: '#6BB3FF',
  selected: '#FFD700',
};

export default function AnchorGlyph({
  role, position, zoom2D, state, className,
}: AnchorGlyphProps) {
  const color = STATE_COLOR[state];
  const strokeWidth = 1.2 / zoom2D;
  const halfLarge = 5 / zoom2D;

  return (
    <g
      transform={`translate(${position.x} ${position.y})`}
      data-anchor-role={role}
      className={className}
      pointerEvents="none"
      style={{ cursor: 'move' }}
    >
      {role === 'openEndpoint' && (
        <polygon
          points={`0,${-halfLarge} ${halfLarge},0 0,${halfLarge} ${-halfLarge},0`}
          fill={color} stroke="#fff" strokeWidth={strokeWidth}
        />
      )}
      {role === 'corner' && (
        <rect
          x={-halfLarge} y={-halfLarge}
          width={halfLarge * 2} height={halfLarge * 2}
          fill={color} stroke="#fff" strokeWidth={strokeWidth}
        />
      )}
      {role === 'bezierAnchor' && (
        <>
          <circle
            r={4.5 / zoom2D} fill="none" stroke="#fff"
            strokeWidth={3 / zoom2D}
          />
          <circle
            r={4.5 / zoom2D} fill="none" stroke={color}
            strokeWidth={1.5 / zoom2D}
          />
        </>
      )}
      {role === 'smoothSample' && (
        <circle
          r={3 / zoom2D} fill={color} stroke="#fff"
          strokeWidth={strokeWidth}
        />
      )}
    </g>
  );
}

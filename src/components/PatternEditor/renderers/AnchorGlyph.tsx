import type { Point2D } from '../../../types/types';
import type { AnchorRole } from '../anchorRoles';

export type AnchorVisualState = 'reposo' | 'idle' | 'hovered' | 'selected';

export interface AnchorGlyphProps {
  role: AnchorRole;
  position: Point2D;
  zoom2D: number;
  state: AnchorVisualState;
  className?: string;
}

/* Tinta sobre el papel (spec 2026-09-24 § 4.6): en reposo el punto es una
 * referencia y va en tinta; elegida la pieza, en el acento del lienzo; bajo el
 * cursor, en su paso fuerte (seleccionado > hover > reposo, contrato § 4). El
 * nodo elegido conserva su dorado: es el color que los e2e de Q y el replay de
 * María [07-09] buscan. */
const STATE_COLOR: Record<AnchorVisualState, string> = {
  reposo: 'var(--ink-on-light-2)',
  idle: 'var(--accent-2d)',
  hovered: 'var(--accent-2d-fuerte)',
  selected: '#FFD700',
};

export default function AnchorGlyph({
  role, position, zoom2D, state, className,
}: AnchorGlyphProps) {
  const color = STATE_COLOR[state];
  const strokeWidth = 1.2 / zoom2D;
  const halfLarge = 5 / zoom2D;
  const halfSmall = 4 / zoom2D;

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
          fill={color} stroke="var(--piece-fill-2d)" strokeWidth={strokeWidth}
        />
      )}
      {role === 'corner' && (
        <rect
          x={-halfLarge} y={-halfLarge}
          width={halfLarge * 2} height={halfLarge * 2}
          fill={color} stroke="var(--piece-fill-2d)" strokeWidth={strokeWidth}
        />
      )}
      {role === 'bezierAnchor' && (
        <>
          <circle
            r={4.5 / zoom2D} fill="none" stroke="var(--piece-fill-2d)"
            strokeWidth={3 / zoom2D}
          />
          <circle
            r={4.5 / zoom2D} fill="none" stroke={color}
            strokeWidth={1.5 / zoom2D}
          />
        </>
      )}
      {role === 'lineEnd' && (
        <>
          <rect
            x={-halfSmall} y={-halfSmall}
            width={halfSmall * 2} height={halfSmall * 2}
            fill="none" stroke="var(--piece-fill-2d)" strokeWidth={3 / zoom2D}
          />
          <rect
            x={-halfSmall} y={-halfSmall}
            width={halfSmall * 2} height={halfSmall * 2}
            fill="none" stroke={color} strokeWidth={1.5 / zoom2D}
          />
        </>
      )}
      {role === 'smoothSample' && (
        <circle r={2 / zoom2D} fill={color} />
      )}
    </g>
  );
}

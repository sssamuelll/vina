import type { Point2D, NotchOptions } from '../../../../types/types';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../../../utils/notches';

/** Where the mirror notch would land, in WORLD coords (paired-piece position
 *  already added by the caller — the overlay draws, it does not resolve). */
export interface NotchMirrorGhost {
  pointWorld: Point2D;
  normal: Point2D;
  options?: NotchOptions;
}

interface Props {
  ghost: NotchMirrorGhost | null;
  zoom: number;
}

/**
 * Ghost preview of the corresponding (mirror) notch on the paired piece (F3).
 * A distinct FOURTH visual state — outline-only, long-dash, hollow anchor,
 * accent-tinted at low opacity — so it never reads as a real notch
 * (--notch-2d), the selection (--accent-2d solid), or the create-hover. Gated
 * by presence (not activeTool); pointerEvents none; inside the pan/zoom group.
 */
export default function NotchMirrorOverlay({ ghost, zoom }: Props) {
  if (!ghost) return null;
  const stroke = 2 / zoom;
  const r = 4 / zoom;
  const path = generateNotchPath(ghost.pointWorld, ghost.normal, ghost.options ?? DEFAULT_NOTCH_OPTIONS);
  const d = path.map(c => `${c.type}${c.values.join(' ')}`).join(' ');
  return (
    <g pointerEvents="none" opacity={0.6}>
      <path
        d={d}
        fill="none"
        stroke="var(--accent-2d)"
        strokeWidth={stroke}
        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={ghost.pointWorld.x} cy={ghost.pointWorld.y} r={r} fill="none" stroke="var(--accent-2d)" strokeWidth={stroke} />
    </g>
  );
}

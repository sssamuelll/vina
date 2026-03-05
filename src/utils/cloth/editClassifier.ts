import type { PatternPiece } from '../../types/types';

export type EditType = 'dimension' | 'topology';

/**
 * Classifies a pattern edit as either a "dimension" change (coordinates moved,
 * solver can warm-start) or a "topology" change (mesh structure changed,
 * solver needs full restart).
 *
 * Topology changes include:
 * - Pieces added or removed
 * - Piece IDs changed or reordered
 * - Outline segment count changed
 * - Outline segment type changed (e.g. L -> C)
 * - Segment value count changed (different curve parameterization)
 *
 * Dimension changes include:
 * - Coordinate values moved (edge lengths, vertex positions)
 * - Position/rotation/seamAllowance changes (non-mesh properties)
 */
export function classifyEdit(prev: PatternPiece[], next: PatternPiece[]): EditType {
  if (prev.length !== next.length) return 'topology';

  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return 'topology';

    const prevOutline = prev[i].outline;
    const nextOutline = next[i].outline;

    if (prevOutline.length !== nextOutline.length) return 'topology';

    for (let j = 0; j < prevOutline.length; j++) {
      if (prevOutline[j].type !== nextOutline[j].type) return 'topology';
      if (prevOutline[j].values.length !== nextOutline[j].values.length) return 'topology';
    }
  }

  return 'dimension';
}

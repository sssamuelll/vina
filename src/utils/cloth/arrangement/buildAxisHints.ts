import { computeEffectiveRegions, type BodyRegion } from '../garmentPlacement';
import type { PatternPiece } from '../../../types/types';
import type { V3 } from './surfaceFrame';

export interface ArmAxis {
  left: V3 | null;
  right: V3 | null;
  ready: boolean;
}

/**
 * buildAxisHints — map sleeve pieces to their arm directions.
 *
 * Runs computeEffectiveRegions on pieces, then maps each piece whose region
 * is left-sleeve/cuff-left to armAxis.left, right-sleeve/cuff-right to armAxis.right.
 * Omits torso and other regions. Omits a side whose direction is null.
 *
 * @param pieces Pattern pieces to classify
 * @param armAxis {left, right, ready} arm directions from redux state (Task 4)
 * @returns Record<string, V3> keyed by piece.id
 */
export function buildAxisHints(pieces: PatternPiece[], armAxis: ArmAxis): Record<string, V3> {
  const regions = computeEffectiveRegions(pieces);
  const out: Record<string, V3> = {};
  pieces.forEach((p, i) => {
    const r: BodyRegion = regions[i];
    if ((r === 'left-sleeve' || r === 'cuff-left') && armAxis.left) out[p.id] = armAxis.left;
    else if ((r === 'right-sleeve' || r === 'cuff-right') && armAxis.right) out[p.id] = armAxis.right;
  });
  return out;
}

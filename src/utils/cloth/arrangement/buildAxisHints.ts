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
 * Runs computeEffectiveRegions on pieces, then maps each sleeve/cuff piece to
 * the arm direction for the body SIDE where surfaceFrame will place it.
 *
 * HANDEDNESS — the two halves of the system use OPPOSITE left/right conventions:
 *   • Garment pipeline (detectBodyRegion + surfaceFrame + seam pairing): a piece
 *     classified `left-sleeve`/`cuff-left` is placed on the body's −X side
 *     (surfaceFrame: `point.x = -shoulderWidth/2`, default axis −X). The M4 sonda
 *     validates that the sleeve↔armhole seams connect on this −X side.
 *   • Avatar bones (AvatarModel): anatomical. The avatar faces +Z, so its
 *     anatomical-left arm (`LeftArm` → armAxis.left) is the +X arm and `RightArm`
 *     (armAxis.right) is the −X arm.
 * So a `left-sleeve` (placed at −X) must take the −X arm's direction = armAxis.RIGHT,
 * and a `right-sleeve` (+X) takes armAxis.LEFT. With the naive same-name mapping the
 * hint points across the body and the sleeves collapse to center (maxAbsX≈0.23,
 * #924 A-pose replay); cross-mapped they drape down the A-pose arms (maxAbsX≈0.68).
 * The conversion belongs HERE — this function is the bridge between the two
 * conventions; surfaceFrame's −X="left" is load-bearing for the seam pairing and
 * must not be flipped in isolation.
 *
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
    // Cross-mapped on purpose — see HANDEDNESS above (−X sleeve ← −X arm = armAxis.right).
    if ((r === 'left-sleeve' || r === 'cuff-left') && armAxis.right) out[p.id] = armAxis.right;
    else if ((r === 'right-sleeve' || r === 'cuff-right') && armAxis.left) out[p.id] = armAxis.left;
  });
  return out;
}

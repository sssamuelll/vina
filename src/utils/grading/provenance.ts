/**
 * Grading provenance — honest reporting of HOW a size run was produced.
 *
 * `gradePieceToSize` routes each piece to the per-point rule engine when it
 * carries `gradeRules`, and to uniform scaling otherwise. The per-point path
 * grades the OUTLINE only — internals (darts/notches/grainlines) are carried
 * unchanged (see `gradePieceByRules`). This helper mirrors that same routing
 * condition so the UI can label the result truthfully and warn when a piece's
 * internals are silently frozen — the Step-4 "honest fallback" of the Level-1
 * imported-grading scope (docs/superpowers/plans/2026-06-18-level1-imported-pattern-editing-scope.md).
 *
 * @module grading/provenance
 */
import type { PatternPiece } from '../../types/types';

export type GradingMethod = 'uniform' | 'per-point' | 'mixed';

export interface GradingProvenance {
  /** How the given base pieces grade, given their per-point rules. */
  method: GradingMethod;
  /**
   * Count of per-point pieces that also carry internals — their internals are
   * carried unchanged (not graded per-point), a regression the UI must surface.
   */
  frozenInternalsPieces: number;
}

/** Mirrors the routing condition in `gradePieceToSize`. */
function isPerPoint(piece: Pick<PatternPiece, 'gradeRules'>): boolean {
  return (piece.gradeRules?.length ?? 0) > 0;
}

/**
 * Summarize how a set of base pieces will grade. Pure; reads only `gradeRules`
 * and `internals`.
 */
export function summarizeGradingProvenance(
  basePieces: Pick<PatternPiece, 'gradeRules' | 'internals'>[],
): GradingProvenance {
  let anyPerPoint = false;
  let anyUniform = false;
  let frozenInternalsPieces = 0;

  for (const piece of basePieces) {
    if (isPerPoint(piece)) {
      anyPerPoint = true;
      if ((piece.internals?.length ?? 0) > 0) frozenInternalsPieces++;
    } else {
      anyUniform = true;
    }
  }

  const method: GradingMethod =
    anyPerPoint && anyUniform ? 'mixed' : anyPerPoint ? 'per-point' : 'uniform';

  return { method, frozenInternalsPieces };
}

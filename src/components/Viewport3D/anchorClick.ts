/**
 * anchorClick — pure decision logic for the human's placement-contract click
 * (arrangement mode: click pieza → click anchor → binding). Extracted from
 * Viewport3D so the branching is unit-testable without an R3F harness.
 *
 * The whole contract here MIRRORS the solver: the piece-set is activePieces
 * (GarmentSimulation's filter, same as the agent's contractPieces) and the
 * binding opts are `{ axisHints: buildAxisHints(activePieces, armAxis),
 * skeletonReady: armAxis.ready }`. Diverging on EITHER re-opens the
 * split-brain that arrangementBinding documents: computeEffectiveRegions
 * assigns L/R to side-less sleeves per-SET (toggle), so a binding baked over
 * the FULL array could compose against the mirrored arm's frame at simulate
 * (review #934). The delta must be expressed against the SAME auto-frame the
 * solver seeds from.
 */
import type { BodyMeasurements, PatternPiece } from '../../types/types';
import { computeEffectiveRegions, type BodyRegion } from '../../utils/cloth/garmentPlacement';
import { anchorNamespaceFor, bindingForAnchor } from '../../utils/cloth/arrangement/placementContract';
import { buildAxisHints, type ArmAxis } from '../../utils/cloth/arrangement/buildAxisHints';
import type { AnchorMap } from '../../utils/cloth/arrangement/anchorMap';
import type { ArrangementBinding } from '../../utils/cloth/arrangement/arrangementBinding';

export type AnchorClickResult =
  | { kind: 'no-selection' } // zero or >1 pieces selected (or stale selection)
  | { kind: 'no-map' } // unreachable from a rendered point; defensive
  | { kind: 'cross-namespace'; namespace: BodyRegion }
  | { kind: 'bound'; pieceId: string; binding: ArrangementBinding };

/** Index of the single selected piece in `pieces`, or -1. */
function selectedIndex(pieces: PatternPiece[], selectedPieceIds: string[]): number {
  if (selectedPieceIds.length !== 1) return -1;
  return pieces.findIndex((p) => p.id === selectedPieceIds[0]);
}

/**
 * Anchor namespace of the single selected piece — drives the accent/dim
 * highlight on AnchorPoints. Callers pass activePieces (the solver's set) so
 * the highlighted anchors are exactly the ones resolveAnchorClick will
 * accept. Null unless exactly one selected piece exists in the set.
 */
export function selectionNamespace(
  pieces: PatternPiece[],
  selectedPieceIds: string[],
): BodyRegion | null {
  const idx = selectedIndex(pieces, selectedPieceIds);
  if (idx < 0) return null;
  return anchorNamespaceFor(computeEffectiveRegions(pieces)[idx]);
}

export interface AnchorClickArgs {
  /**
   * Contract piece-set: activePieces (GarmentSimulation's filter — same set
   * as the agent's contractPieces). NOT the full array: effective-region L/R
   * assignment is per-set, and the solver composes the binding over this set.
   */
  activePieces: PatternPiece[];
  selectedPieceIds: string[];
  measurements: BodyMeasurements;
  map: AnchorMap | null;
  anchorId: string;
  armAxis: ArmAxis;
}

/** Click on an anchor point → what should happen (toast vs binding dispatch). */
export function resolveAnchorClick(args: AnchorClickArgs): AnchorClickResult {
  const { activePieces, selectedPieceIds, measurements, map, anchorId, armAxis } = args;
  const index = selectedIndex(activePieces, selectedPieceIds);
  if (index < 0) return { kind: 'no-selection' };
  if (!map) return { kind: 'no-map' };

  const binding = bindingForAnchor(activePieces, index, measurements, map, anchorId, {
    skeletonReady: armAxis.ready,
    axisHints: buildAxisHints(activePieces, armAxis),
  });
  if (!binding) {
    return {
      kind: 'cross-namespace',
      namespace: anchorNamespaceFor(computeEffectiveRegions(activePieces)[index]),
    };
  }
  return { kind: 'bound', pieceId: activePieces[index].id, binding };
}

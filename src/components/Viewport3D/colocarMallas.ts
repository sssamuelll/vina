import type { BodyMeasurements, PatternPiece } from '../../types/types';
import type { MeshedPiece } from './useMeshing';
import type { PlacedMesh } from './useSimulationLifecycle';
import { resolveArrangementWithFrames, type ArrangementOverride } from '../../utils/cloth/arrangement/arrangementBinding';
import { computeEffectiveRegions } from '../../utils/cloth/garmentPlacement';
import { wrapPlacedMesh } from '../../utils/cloth/arrangement/wrapPlacedMesh';
import { buildAxisHints, type ArmAxis } from '../../utils/cloth/arrangement/buildAxisHints';
import { computeStiffnessMultiplier } from '../../utils/cloth/interfacing';

/**
 * Las mallas como las recibe el solver: envueltas sobre el cuerpo (el mismo
 * marco que el render), con su región, su rigidez por entretela, su presión y
 * sus internas de doblez. La llaman GarmentSimulation y el preparador
 * (usePrepararTela): con las mismas entradas, la misma tela.
 * El armAxis cuenta: cuando el esqueleto publica la pose A, la tela se vuelve
 * a sembrar en esa pose (#924).
 */
export function colocarMallas(
  pieceMeshes: MeshedPiece[],
  activePieces: PatternPiece[],
  medidas: BodyMeasurements,
  overrides: Record<string, ArrangementOverride>,
  armAxis: ArmAxis,
): PlacedMesh[] {
  if (pieceMeshes.length === 0) return [];

  // M2: arrange-mode drags apply here too — what the user sees in the
  // arrange view is EXACTLY where the solver starts.
  const axisHints = buildAxisHints(activePieces, armAxis);
  const arrangement = resolveArrangementWithFrames(activePieces, medidas, overrides, { axisHints, skeletonReady: armAxis.ready });
  // Index by pieceId — pieceMeshes may have dropped failed-to-mesh pieces, so
  // it is not guaranteed index-aligned with activePieces (matches render loop).
  const arrangeById = new Map(activePieces.map((p, i) => [p.id, arrangement[i]]));

  // Per-region tether radii (frente#2): one deterministic pass via
  // computeEffectiveRegions (same toggle-reset semantics as the arrangement path).
  const regions = computeEffectiveRegions(activePieces);
  const regionById = new Map(activePieces.map((p, i) => [p.id, regions[i] as string]));

  // Skip stale meshes (deleted piece, no frame) — same guard as the render
  // loop; the old `?? arrangement[i]` fallback destructured undefined (#924).
  return pieceMeshes
    .filter(pm => arrangeById.has(pm.pieceId))
    .map((pm) => {
      const { frame, flip, wrapParams } = arrangeById.get(pm.pieceId)!;
      // Envelope wrap (Task 5): IDENTICAL call to the render loop (GarmentSimulation,
      // staticGeometry) — render and solver must not diverge. `frame.point` carries
      // the landmark; `flip` is the M4-C anatomy-up correction.
      const transformed = wrapPlacedMesh(pm.vertices, frame, wrapParams, flip);
      const piece = activePieces.find(p => p.id === pm.pieceId);
      const stiffnessMultiplier = computeStiffnessMultiplier(piece?.interfacingType, piece?.solidifyFactor);
      const pressurePa = piece?.pressurePa ?? 0;
      const foldInternals = piece?.internals?.filter(l => l.type === 'fold' && l.foldOptions);
      return { ...pm, vertices: transformed, stiffnessMultiplier, pressurePa, internals: foldInternals, region: regionById.get(pm.pieceId) };
    });
}

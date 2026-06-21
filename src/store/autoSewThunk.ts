/**
 * runAutoSew — user-facing auto-sew trigger (camisa de María plan, M3).
 *
 * The copilot has had `autoDetectSeams` since the registry existed, but the
 * USER had no working surface: the ⌘K command "Auto-Sew Pieces" opened a
 * placeholder panel that renders "Auto-Sew — available via ⌘K" (a dead
 * loop). This thunk is the real execution path for both: propose seams over
 * the classified pieces (M1) with the anatomy-aware scorer (M3), dispatch
 * them with `createdBy: 'ai'` (amber "review me" provenance in 3D), and
 * tell the user what happened — including when the answer is "nothing
 * confident enough" (honest non-silence, Fase 4 doctrine).
 */

import type { AppDispatch, RootState } from './index';
import { addSeam } from './projectSlice';
import { showSuccessToast, showInfoToast } from './copilotUISlice';
import { autoSew } from '../utils/autoSew';
import { refineSeamsInWorld } from '../utils/autoSew/worldRefine';
import { resolveArrangement } from '../utils/cloth/arrangement/arrangementBinding';
import type { PatternPiece, Seam } from '../types/types';

/**
 * World-space refinement of the proposals (M4-C): partner reassignment by
 * world proximity + `reversed` seeding — autoSew scores in 2D, but which
 * edges are ADJACENT (and in which traversal direction) is a placement
 * fact. Shared by the ⌘K thunk and the copilot tools so every dispatch
 * path proposes the same seams the simulation will actually converge on.
 */
export function refineProposalsAgainstState(
  seams: Seam[],
  pieces: PatternPiece[],
  state: RootState,
): Seam[] {
  const placements = resolveArrangement(
    pieces,
    state.project.avatar.measurements,
    state.project.arrangementOverrides,
  );
  return refineSeamsInWorld(seams, pieces, placements);
}

/** Same default the copilot tool uses (autoSewTools.ts). */
const DEFAULT_MIN_CONFIDENCE = 0.4;

function samePair(a: Seam, b: Seam): boolean {
  const key = (s: Seam) =>
    [`${s.pieceA.pieceId}:${s.pieceA.edgeName}`, `${s.pieceB.pieceId}:${s.pieceB.edgeName}`]
      .sort()
      .join('↔');
  return key(a) === key(b);
}

export function runAutoSew(minConfidence: number = DEFAULT_MIN_CONFIDENCE) {
  return (dispatch: AppDispatch, getState: () => RootState): { added: number; proposed: number } => {
    const state = getState();
    const pieces = state.project.pieces.filter(p => p.active !== false);
    const existing = state.project.seams;

    const result = autoSew(pieces, { minConfidence });
    const refined = refineProposalsAgainstState(
      result.seams.map(p => p.seam), pieces, state,
    );

    let added = 0;
    for (const seam of refined) {
      if (existing.some(e => samePair(e, seam))) continue;
      dispatch(addSeam({ ...seam, createdBy: 'ai' }));
      added++;
    }

    if (added > 0) {
      dispatch(showSuccessToast(
        `Auto-sew: ${added} costura${added === 1 ? '' : 's'} propuesta${added === 1 ? '' : 's'} (ámbar = revisar y confirmar)`,
      ));
    } else if (result.seams.length > 0) {
      dispatch(showInfoToast('Auto-sew: las costuras propuestas ya existen'));
    } else {
      dispatch(showInfoToast(
        'Auto-sew: sin costuras con confianza suficiente — ¿las piezas están clasificadas?',
      ));
    }

    return { added, proposed: result.seams.length };
  };
}

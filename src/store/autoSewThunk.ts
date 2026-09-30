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
import { addSeam, removeSeam } from './projectSlice';
import { batchUndo } from './undoMiddleware';
import { showSuccessToast, showInfoToast } from './copilotUISlice';
import { autoSew, isStaleAiSeam } from '../utils/autoSew';
import { refineSeamsInWorld } from '../utils/autoSew/worldRefine';
import { resolveArrangementWithFrames } from '../utils/cloth/arrangement/arrangementBinding';
import { buildAxisHints } from '../utils/cloth/arrangement/buildAxisHints';
import type { PatternPiece, Seam } from '../types/types';
import { medidasDelCuerpo } from '../avatares/catalogo';

/**
 * World-space refinement of the proposals (M4-C): partner reassignment by
 * world proximity + `reversed` seeding — autoSew scores in 2D, but which
 * edges are ADJACENT (and in which traversal direction) is a placement
 * fact. Shared by the ⌘K thunk and the copilot tools so every dispatch
 * path proposes the same seams the simulation will actually converge on.
 *
 * Scores against the WRAP pose (`resolveArrangementWithFrames` → per-piece
 * `{frame, flip}`), the same geometry GarmentSimulation starts the solver
 * with — NOT the rigid Euler placement, which diverged on wrapped edges and
 * could pick the wrong partner/direction (PR #924 finding #5).
 */
export function refineProposalsAgainstState(
  seams: Seam[],
  pieces: PatternPiece[],
  state: RootState,
): Seam[] {
  // state.simulation may be absent in lightweight test stores that omit the
  // simulation reducer — fall back to the no-hints default (ready=false).
  const armAxis = state.simulation?.armAxis ?? { left: null, right: null, ready: false };
  const axisHints = buildAxisHints(pieces, armAxis);
  const placements = resolveArrangementWithFrames(
    pieces,
    medidasDelCuerpo(state.project),
    state.project.arrangementOverrides,
    { axisHints, skeletonReady: armAxis.ready },
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
        `Costura automática: ${added} propuesta${added === 1 ? '' : 's'} (ámbar = revisar y confirmar)`,
      ));
    } else if (result.seams.length > 0) {
      dispatch(showInfoToast('Costura automática: las propuestas ya existen'));
    } else {
      dispatch(showInfoToast(
        'Costura automática: no hay propuestas con confianza suficiente — ¿las piezas están clasificadas?',
      ));
    }

    return { added, proposed: result.seams.length };
  };
}

/**
 * resewAiSeams — regenerar las costuras IA stale con el motor actual (el
 * botón "Re-coser" del toast de restauración; ver `SEAM_ENGINE_VERSION`).
 *
 * ORDEN CRÍTICO (hallazgo del workflow 2026-07-05): computar las propuestas
 * PRIMERO; borrar las stale y añadir DESPUÉS, dedupando solo contra las
 * supervivientes (humanas). Si se dedupara contra el estado pre-borrado,
 * `samePair` — que IGNORA tStart/tEnd — bloquearía las mitades split nuevas
 * (sisa/collar) contra la costura entera vieja del mismo par de edges: el
 * mismo bug que motiva este thunk. Y si se borrara antes de proponer, un
 * autoSew que devuelve 0 dejaría el proyecto sin costuras.
 *
 * Las costuras humanas (newId, sin createdBy) nunca se tocan.
 */
export function resewAiSeams(minConfidence: number = DEFAULT_MIN_CONFIDENCE) {
  return (dispatch: AppDispatch, getState: () => RootState): { removed: number; added: number } => {
    const state = getState();
    const pieces = state.project.pieces.filter(p => p.active !== false);
    const stale = state.project.seams.filter(isStaleAiSeam);
    const survivors = state.project.seams.filter(s => !isStaleAiSeam(s));

    // 1. Proponer primero (sin tocar nada todavía).
    const result = autoSew(pieces, { minConfidence });
    const refined = refineProposalsAgainstState(
      result.seams.map(p => p.seam), pieces, state,
    );

    if (refined.length === 0) {
      dispatch(showInfoToast(
        'Recoser: el motor no propuso costuras — no se eliminó nada. ¿Las piezas están clasificadas?',
      ));
      return { removed: 0, added: 0 };
    }

    // 2+3 dentro de UN batch de undo (review #934): sin él, undoMiddleware
    // snapshotea los removes y los adds por separado y un solo Ctrl+Z
    // aterrizaba en el intermedio "todo borrado, nada re-añadido".
    let added = 0;
    batchUndo(dispatch, 'Recoser', () => {
      // 2. Borrar las stale (meta.skipConfirmation: el gate de confirmación es
      // para borrados del usuario, no para este reemplazo atómico ofrecido).
      for (const s of stale) {
        dispatch({ type: removeSeam.type, payload: s.id, meta: { skipConfirmation: true } });
      }

      // 3. Añadir dedupando SOLO contra las supervivientes humanas.
      for (const seam of refined) {
        if (survivors.some(e => samePair(e, seam))) continue;
        dispatch(addSeam({ ...seam, createdBy: 'ai' }));
        added++;
      }
    });

    dispatch(showSuccessToast(
      `Recosido: ${stale.length} costura${stale.length === 1 ? '' : 's'} vieja${stale.length === 1 ? '' : 's'} → ${added} nueva${added === 1 ? '' : 's'} con el motor actual`,
    ));

    return { removed: stale.length, added };
  };
}

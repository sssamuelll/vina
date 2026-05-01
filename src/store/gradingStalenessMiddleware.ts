/**
 * Grading Staleness Middleware (Issue #258)
 *
 * Watches for piece-modifying Redux actions and marks grading as stale
 * when a base piece (not a generated variant) is modified.
 *
 * @module gradingStalenessMiddleware
 */

import { Middleware } from '@reduxjs/toolkit';

const PIECE_MODIFYING_ACTIONS = new Set([
  'project/updatePiece',
  'project/movePiece',
  'project/rotatePiece',
  'project/removePiece',
  'project/removePieces',
  'project/addInternalLine',
  'project/updateInternalLine',
  'project/removeInternalLine',
]);

/**
 * @cascade
 * shape: obs 1→1 asymmetric (idempotent — setStale only goes true→true)
 * triggers: project/updatePiece, project/movePiece, project/rotatePiece,
 *           project/removePiece, project/removePieces,
 *           project/addInternalLine, project/updateInternalLine,
 *           project/removeInternalLine
 * dispatches: grading/setStale (true) when modified piece is base, not generated
 * guard: none (setStale is idempotent + early-return if already stale or empty)
 * undo: does not group (metadata observation, not part of user undo step)
 * cap-depth: 0 (grading/setStale is not in any trigger set)
 * cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md`
 */
export const gradingStalenessMiddleware: Middleware = (store) => (next) => (action: unknown) => {
  const result = next(action);

  const act = action as { type?: string; payload?: unknown };
  const actionType: string = act?.type ?? '';
  if (!PIECE_MODIFYING_ACTIONS.has(actionType)) return result;

  const state = store.getState();
  const grading = state.grading;

  // Only check if grading has generated pieces and isn't already stale
  if (!grading || Object.keys(grading.generatedPieces).length === 0 || grading.stale) return result;

  // Check if the modified piece is a base piece (not a generated variant)
  const allGeneratedIds = new Set(Object.values(grading.generatedPieces).flat());

  const payload = act.payload as Record<string, unknown> | string | string[] | undefined;

  // For removePiece/updatePiece: check the payload pieceId
  const pieceId = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).pieceId
    : payload;
  if (typeof pieceId === 'string' && !allGeneratedIds.has(pieceId)) {
    store.dispatch({ type: 'grading/setStale', payload: true });
  }

  // For removePieces: check the payload array
  if (Array.isArray(payload)) {
    const hasBasePiece = payload.some((id: string) => !allGeneratedIds.has(id));
    if (hasBasePiece) {
      store.dispatch({ type: 'grading/setStale', payload: true });
    }
  }

  return result;
};

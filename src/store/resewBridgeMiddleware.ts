/**
 * Resew bridge — puentea la acción PLANA `RESEW_AI_SEAMS` (serializable, la
 * dispara el botón "Re-coser" del toast de restauración) al thunk
 * `resewAiSeams` (necesita getState + autoSew, no cabe en un reducer).
 *
 * @cascade
 * shape: 1→1 bridge — una acción plana dispara un thunk
 * triggers: global/resewAiSeams (actions.ts)
 * dispatches: resewAiSeams() → removeSeam×N (meta.skipConfirmation) + addSeam×N + toast
 * guard: la acción plana no la re-dispara nadie aguas abajo (el thunk emite
 *        solo acciones de projectSlice/copilotUISlice)
 * undo: las removeSeam/addSeam entran a la historia normal (Ctrl+Z revierte)
 * cap-depth: 1
 *
 * cross-ref: docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md
 */
import type { Middleware } from '@reduxjs/toolkit';
import { RESEW_AI_SEAMS } from './actions';
import { resewAiSeams } from './autoSewThunk';
import type { AppDispatch } from './index';

export const resewBridgeMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (RESEW_AI_SEAMS.match(action)) {
    (storeApi.dispatch as AppDispatch)(resewAiSeams());
  }
  return result;
};

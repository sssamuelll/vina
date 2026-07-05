/**
 * Shared cross-slice actions.
 *
 * Use `NEW_PROJECT` in `extraReducers` of any slice that needs to reset on new project.
 *
 * @module actions
 */

import { createAction } from '@reduxjs/toolkit';

/**
 * Reset all state for a new project.
 * Every slice should handle this in extraReducers to return its initialState.
 */
export const NEW_PROJECT = createAction('global/newProject');

/**
 * Regenerar las costuras IA con el motor de cosido actual (staleness —
 * `SEAM_ENGINE_VERSION`). Acción PLANA para que superficies serializables
 * (el botón de un toast) puedan dispararla; `resewBridgeMiddleware` la
 * puentea al thunk `resewAiSeams` (@cascade depth 1).
 */
export const RESEW_AI_SEAMS = createAction('global/resewAiSeams');

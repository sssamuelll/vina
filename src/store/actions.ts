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

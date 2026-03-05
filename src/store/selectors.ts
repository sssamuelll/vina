import { createSelector } from '@reduxjs/toolkit';
import { RootState } from './index';

// ─── Project selectors ─────────────────────────────────────────────────────

export const selectProject = (s: RootState) => s.project;
export const selectPieces = createSelector(selectProject, p => p.pieces);
export const selectSeams = createSelector(selectProject, p => p.seams);

// ─── Editor selectors ──────────────────────────────────────────────────────

export const selectEditor = (s: RootState) => s.editor;
export const selectActiveTool = createSelector(selectEditor, e => e.activeTool);
export const selectZoom2D = createSelector(selectEditor, e => e.zoom2D);
export const selectPan2D = createSelector(selectEditor, e => e.pan2D);
export const selectSelectedPieceIds = createSelector(selectEditor, e => e.selectedPieceIds);
export const selectSelectedInternalLine = createSelector(selectEditor, e => e.selectedInternalLine);

// ─── Tools selectors ───────────────────────────────────────────────────────

export const selectToolOptions = createSelector(
  (s: RootState) => s.tools,
  t => t.toolOptions,
);

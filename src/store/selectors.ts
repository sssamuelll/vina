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

// ─── Workflow stage ────────────────────────────────────────────────────────

export type WorkflowStage = 'empty' | 'drafted' | 'arranged' | 'sewn' | 'simulating' | 'simulated';

/**
 * Derived workflow stage from existing signals (no stored stage field).
 * `arranged` is in the vocabulary for later slices but is NOT derived here:
 * simulation.viewMode3D defaults to 'arrange', so it is not a meaningful
 * "user arranged" signal. 3a derives five stages.
 */
export const selectWorkflowStage = createSelector(
  (s: RootState) => s.project.pieces.length,
  (s: RootState) => s.project.seams.length,
  (s: RootState) => s.simulation.simulationState,
  (pieceCount, seamCount, simState): WorkflowStage => {
    if (pieceCount === 0) return 'empty';
    if (simState === 'running') return 'simulating';
    if (simState === 'paused') return 'simulated';
    if (seamCount > 0) return 'sewn';
    return 'drafted';
  },
);

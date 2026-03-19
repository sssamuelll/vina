/* eslint-disable @typescript-eslint/no-explicit-any */
import { Middleware } from '@reduxjs/toolkit';
import { RootState } from './index';

// ─── Simulation Snapshot Integration ────────────────────────────────────────

/** Worker snapshot callbacks — registered by GarmentSimulation when simulation is active */
let _snapshotSave: ((id: string) => void) | null = null;
let _snapshotRestore: ((id: string) => void) | null = null;

/**
 * Register simulation snapshot callbacks for undo integration.
 * Called by GarmentSimulation when simulation becomes active.
 * Returns a cleanup function to unregister.
 */
export function registerSimulationCallbacks(
  save: (id: string) => void,
  restore: (id: string) => void,
): () => void {
  _snapshotSave = save;
  _snapshotRestore = restore;
  return () => {
    _snapshotSave = null;
    _snapshotRestore = null;
  };
}

const MAX_HISTORY = 50;
const UNDO_BATCH_MS = 500; // Batch rapid changes (e.g. slider drags) into one undo step

export interface HistoryEntry {
  /** Human-readable description of the action */
  label: string;
  /** Redux action type */
  actionType: string;
  /** Timestamp */
  timestamp: number;
}

interface UndoState {
  past: unknown[];
  future: unknown[];
  pastEntries: HistoryEntry[];
  futureEntries: HistoryEntry[];
  lastSnapshotTime: number;
  batchingAction: string | null;
}

const undoState: UndoState = {
  past: [],
  future: [],
  pastEntries: [],
  futureEntries: [],
  lastSnapshotTime: 0,
  batchingAction: null,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function canUndo() { return undoState.past.length > 0; }
export function canRedo() { return undoState.future.length > 0; }
export function getUndoLength() { return undoState.past.length; }
export function getRedoLength() { return undoState.future.length; }

/** Get the full history for the History Panel UI */
export function getHistory(): { past: HistoryEntry[]; future: HistoryEntry[] } {
  return {
    past: [...undoState.pastEntries],
    future: [...undoState.futureEntries],
  };
}

/** Jump to a specific point in the past (index into pastEntries) */
export function jumpToIndex(index: number, store: any): void {
  const stepsBack = undoState.past.length - index - 1;
  if (stepsBack <= 0) return;
  for (let i = 0; i < stepsBack; i++) {
    store.dispatch({ type: 'editor/undo' });
  }
}

// ─── Revision counter for React subscriptions ──────────────────────────────

let _revision = 0;
const _listeners = new Set<() => void>();

export function getHistoryRevision() { return _revision; }
export function subscribeHistory(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
function bumpRevision() {
  _revision++;
  _listeners.forEach(cb => cb());
}

// ─── Action label mapping ───────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  'project/addPiece': 'Add Piece',
  'project/removePiece': 'Delete Piece',
  'project/updatePiece': 'Edit Piece',
  'project/movePiece': 'Move Piece',
  'project/rotatePiece': 'Rotate Piece',
  'project/flipPieceH': 'Flip Horizontal',
  'project/flipPieceV': 'Flip Vertical',
  'project/duplicatePiece': 'Duplicate Piece',
  'project/addSeam': 'Add Seam',
  'project/removeSeam': 'Delete Seam',
  'project/updateSeam': 'Edit Seam',
  'project/addInternalLine': 'Add Internal Line',
  'project/removeInternalLine': 'Delete Internal Line',
  'project/updateInternalLine': 'Edit Internal Line',
  'project/setFabric': 'Change Fabric',
  'project/setAvatarMeasurements': 'Edit Measurements',
  'project/setAvatarMode': 'Change Avatar',
  'project/setProjectName': 'Rename Project',
  'project/importPieces': 'Import Pieces',
  'project/setSeamAllowance': 'Set Seam Allowance',
  'project/updateGrainLine': 'Set Grain Line',
  'project/applyGrading': 'Apply Grading',
  'project/addPOM': 'Add Measurement',
  'project/updatePOM': 'Update Measurement',
  'project/removePOM': 'Remove Measurement',
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace('project/', '').replace(/([A-Z])/g, ' $1').trim();
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export const undoMiddleware: Middleware = (store) => (next) => (action: any) => {
  const actionType: string = action?.type ?? '';

  if (actionType === 'editor/undo') {
    if (undoState.past.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    undoState.future.push(JSON.parse(JSON.stringify(currentProject)));
    const entry = undoState.pastEntries.pop();
    if (entry) undoState.futureEntries.push(entry);
    const previous = undoState.past.pop()!;
    bumpRevision();
    const result = next({ type: 'project/restoreState', payload: previous });
    // Restore simulation state if simulation is active
    const simStateAfterUndo = (store.getState() as RootState).simulation?.simulationState;
    if (simStateAfterUndo && simStateAfterUndo !== 'idle' && _snapshotRestore) {
      _snapshotRestore('auto-pre-edit');
    }
    return result;
  }

  if (actionType === 'editor/redo') {
    if (undoState.future.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    undoState.past.push(JSON.parse(JSON.stringify(currentProject)));
    const entry = undoState.futureEntries.pop();
    if (entry) undoState.pastEntries.push(entry);
    const nextState = undoState.future.pop()!;
    bumpRevision();
    return next({ type: 'project/restoreState', payload: nextState });
  }

  // Track project actions (except restoreState and loadProject)
  if (actionType.startsWith('project/') && actionType !== 'project/restoreState' && actionType !== 'project/loadProject') {
    const now = Date.now();
    const isSameAction = actionType === undoState.batchingAction;
    const isRecent = (now - undoState.lastSnapshotTime) < UNDO_BATCH_MS;

    // Auto-save simulation state before pattern edit (for undo integration)
    const simState = (store.getState() as RootState).simulation?.simulationState;
    if (simState && simState !== 'idle' && _snapshotSave && !(isSameAction && isRecent)) {
      _snapshotSave('auto-pre-edit');
    }

    // Batch rapid identical actions (e.g. slider-driven updatePiece) into one undo step
    if (!(isSameAction && isRecent)) {
      const currentProject = (store.getState() as RootState).project;
      undoState.past.push(JSON.parse(JSON.stringify(currentProject)));
      undoState.pastEntries.push({
        label: getActionLabel(actionType),
        actionType,
        timestamp: now,
      });
      if (undoState.past.length > MAX_HISTORY) {
        undoState.past.shift();
        undoState.pastEntries.shift();
      }
    }
    // Always clear redo on any new project action (even batched)
    undoState.future.length = 0;
    undoState.futureEntries.length = 0;

    undoState.lastSnapshotTime = now;
    undoState.batchingAction = actionType;
    bumpRevision();
  }

  // On loadProject or newProject, clear history and batching state
  if (actionType === 'project/loadProject' || actionType === 'global/newProject') {
    undoState.past.length = 0;
    undoState.future.length = 0;
    undoState.pastEntries.length = 0;
    undoState.futureEntries.length = 0;
    undoState.lastSnapshotTime = 0;
    undoState.batchingAction = null;
    bumpRevision();
  }

  return next(action);
};

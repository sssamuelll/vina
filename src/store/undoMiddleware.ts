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
  /** When > 0, snapshot creation is suppressed (explicit batch grouping) */
  batchDepth: number;
  /** Snapshot taken at the start of the outermost batch */
  batchSnapshot: unknown | null;
  /** Label for the batched undo entry */
  batchLabel: string | null;
}

const undoState: UndoState = {
  past: [],
  future: [],
  pastEntries: [],
  futureEntries: [],
  lastSnapshotTime: 0,
  batchingAction: null,
  batchDepth: 0,
  batchSnapshot: null,
  batchLabel: null,
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

/**
 * Execute a function inside an undo batch. All project/* dispatches within
 * the callback produce a single undo entry instead of one per dispatch.
 *
 * Usage:
 *   batchUndo(dispatch, 'Segment Dart', () => {
 *     dispatch(removeInternalLine(...));
 *     dispatch(addInternalLine(...));
 *     dispatch(addInternalLine(...));
 *   });
 */
export function batchUndo(
  dispatch: (action: { type: string; payload?: unknown }) => void,
  label: string,
  fn: () => void,
): void {
  dispatch({ type: 'undo/startBatch', payload: label });
  try {
    fn();
  } finally {
    dispatch({ type: 'undo/endBatch' });
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
  'project/renameLayer': 'Rename Layer',
  'project/deleteLayerName': 'Remove Layer Name',
  'project/setLayerLocked': 'Toggle Layer Lock',
  'project/addLayer': 'Add Layer',
  'project/removeLayer': 'Remove Layer',
  'simulation/toggleHide3D': 'Toggle Hide Piece',
  'simulation/showAll3D': 'Show All Pieces',
  'simulation/toggleFlipNormal': 'Flip Normal',
  'simulation/toggleLayerVisibility': 'Toggle Layer Visibility',
  'simulation/showAllLayers': 'Show All Layers',
  'simulation/setXrayMode': 'Toggle X-Ray Mode',
};

function getActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType.replace('project/', '').replace(/([A-Z])/g, ' $1').trim();
}

// ─── Safe deep clone ─────────────────────────────────────────────────────────

/**
 * Deep-clone a value using structuredClone (handles undefined, NaN, Infinity,
 * typed arrays, etc.). Falls back to JSON round-trip if structuredClone throws
 * (e.g. functions in state). Returns null on total failure so callers can skip
 * the snapshot rather than crash.
 */
function safeClone<T>(value: T): T | null {
  try {
    return structuredClone(value);
  } catch {
    console.warn('[undoMiddleware] structuredClone failed, falling back to JSON (may lose NaN/undefined)');
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.error('[undoMiddleware] Failed to clone state for undo snapshot', err);
    return null;
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export const undoMiddleware: Middleware = (store) => (next) => (action: any) => {
  const actionType: string = action?.type ?? '';

  if (actionType === 'editor/undo') {
    if (undoState.past.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    const snapshot = safeClone(currentProject);
    if (!snapshot) return; // abort undo — can't save current state for redo
    undoState.future.push(snapshot);
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
    const snapshot = safeClone(currentProject);
    if (!snapshot) return; // abort redo — can't save current state for undo
    undoState.past.push(snapshot);
    const entry = undoState.futureEntries.pop();
    if (entry) undoState.pastEntries.push(entry);
    const nextState = undoState.future.pop()!;
    bumpRevision();
    return next({ type: 'project/restoreState', payload: nextState });
  }

  // ─── Explicit batch grouping ──────────────────────────────────────────────
  if (actionType === 'undo/startBatch') {
    if (undoState.batchDepth === 0) {
      // Take snapshot at the start of the outermost batch
      const currentProject = (store.getState() as RootState).project;
      undoState.batchSnapshot = safeClone(currentProject);
      undoState.batchLabel = (action.payload as string) || 'Batch Operation';
    }
    undoState.batchDepth++;
    return; // Don't pass through
  }

  if (actionType === 'undo/endBatch') {
    if (undoState.batchDepth > 0) undoState.batchDepth--;
    if (undoState.batchDepth === 0 && undoState.batchSnapshot) {
      // Push the pre-batch snapshot as a single undo entry
      undoState.past.push(undoState.batchSnapshot);
      undoState.pastEntries.push({
        label: undoState.batchLabel || 'Batch Operation',
        actionType: 'batch',
        timestamp: Date.now(),
      });
      if (undoState.past.length > MAX_HISTORY) {
        undoState.past.shift();
        undoState.pastEntries.shift();
      }
      undoState.future.length = 0;
      undoState.futureEntries.length = 0;
      undoState.batchSnapshot = null;
      undoState.batchLabel = null;
      bumpRevision();
    }
    return; // Don't pass through
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
    // Skip snapshot if inside an explicit batch (handled by startBatch/endBatch)
    if (undoState.batchDepth > 0) {
      // Inside batch — suppress snapshot, just clear redo and pass through
      undoState.future.length = 0;
      undoState.futureEntries.length = 0;
      undoState.lastSnapshotTime = now;
      undoState.batchingAction = actionType;
      bumpRevision();
      return next(action);
    }
    if (!(isSameAction && isRecent)) {
      const currentProject = (store.getState() as RootState).project;
      const snapshot = safeClone(currentProject);
      if (!snapshot) return next(action); // skip snapshot on clone failure — don't corrupt history
      undoState.past.push(snapshot);
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

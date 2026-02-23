import { Middleware } from '@reduxjs/toolkit';
import { RootState } from './index';

const MAX_HISTORY = 50;
const UNDO_BATCH_MS = 500; // Batch rapid changes (e.g. slider drags) into one undo step

interface UndoState {
  past: unknown[];
  future: unknown[];
  lastSnapshotTime: number;
  batchingAction: string | null;
}

const undoState: UndoState = {
  past: [],
  future: [],
  lastSnapshotTime: 0,
  batchingAction: null,
};

export function canUndo() { return undoState.past.length > 0; }
export function canRedo() { return undoState.future.length > 0; }
export function getUndoLength() { return undoState.past.length; }
export function getRedoLength() { return undoState.future.length; }

export const undoMiddleware: Middleware = (store) => (next) => (action: any) => {
  const actionType: string = action?.type ?? '';

  if (actionType === 'editor/undo') {
    if (undoState.past.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    undoState.future.push(JSON.parse(JSON.stringify(currentProject)));
    const previous = undoState.past.pop()!;
    return next({ type: 'project/restoreState', payload: previous });
  }

  if (actionType === 'editor/redo') {
    if (undoState.future.length === 0) return;
    const currentProject = (store.getState() as RootState).project;
    undoState.past.push(JSON.parse(JSON.stringify(currentProject)));
    const nextState = undoState.future.pop()!;
    return next({ type: 'project/restoreState', payload: nextState });
  }

  // Track project actions (except restoreState and loadProject)
  if (actionType.startsWith('project/') && actionType !== 'project/restoreState' && actionType !== 'project/loadProject') {
    const now = Date.now();
    const isSameAction = actionType === undoState.batchingAction;
    const isRecent = (now - undoState.lastSnapshotTime) < UNDO_BATCH_MS;

    // Batch rapid identical actions (e.g. slider-driven updatePiece) into one undo step
    if (!(isSameAction && isRecent)) {
      const currentProject = (store.getState() as RootState).project;
      undoState.past.push(JSON.parse(JSON.stringify(currentProject)));
      if (undoState.past.length > MAX_HISTORY) {
        undoState.past.shift();
      }
    }
    // Always clear redo on any new project action (even batched)
    undoState.future.length = 0;

    undoState.lastSnapshotTime = now;
    undoState.batchingAction = actionType;
  }

  // On loadProject or newProject, clear history and batching state
  if (actionType === 'project/loadProject' || actionType === 'global/newProject') {
    undoState.past.length = 0;
    undoState.future.length = 0;
    undoState.lastSnapshotTime = 0;
    undoState.batchingAction = null;
  }

  return next(action);
};

import { Middleware } from '@reduxjs/toolkit';
import { RootState } from './index';

const MAX_HISTORY = 50;

interface UndoState {
  past: unknown[];
  future: unknown[];
}

const undoState: UndoState = {
  past: [],
  future: [],
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
    const currentProject = (store.getState() as RootState).project;
    undoState.past.push(JSON.parse(JSON.stringify(currentProject)));
    if (undoState.past.length > MAX_HISTORY) {
      undoState.past.shift();
    }
    undoState.future.length = 0; // clear redo on new action
  }

  // On loadProject, clear history
  if (actionType === 'project/loadProject') {
    undoState.past.length = 0;
    undoState.future.length = 0;
  }

  return next(action);
};

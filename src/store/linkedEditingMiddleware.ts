import type { Dispatch, Middleware } from '@reduxjs/toolkit';
import { updatePiece, addInternalLine, updateInternalLine } from './projectSlice';
import { mirrorOutlineX, mirrorInternalsX, outlineCenterX } from '../utils/linkedEditing';
import type { PatternPiece, InternalLine, PathCommand } from '../types/types';

let isSyncing = false;

const SYNCED_ACTIONS = new Set([
  'project/updatePiece',
  'project/addInternalLine',
  'project/removeInternalLine',
  'project/updateInternalLine',
  'project/flipPieceH',
  'project/flipPieceV',
]);

interface ActionLike {
  type: string;
  payload: unknown;
}

export const linkedEditingMiddleware: Middleware = (store) => (next) => (action: unknown) => {
  const result = next(action);

  if (isSyncing) return result;
  const act = action as ActionLike;
  const actionType: string = act?.type ?? '';
  if (!SYNCED_ACTIONS.has(actionType)) return result;

  const state = store.getState() as { project?: { pieces: PatternPiece[] } };
  const pieces: PatternPiece[] | undefined = state.project?.pieces;
  if (!pieces) return result;

  const payload = act.payload;
  let editedPiece: PatternPiece | undefined;

  if (actionType === 'project/updatePiece') {
    editedPiece = pieces.find(p => p.id === (payload as PatternPiece).id);
  } else if (actionType === 'project/addInternalLine' || actionType === 'project/removeInternalLine' || actionType === 'project/updateInternalLine') {
    editedPiece = pieces.find(p => p.id === (payload as { pieceId: string }).pieceId);
  } else if (actionType === 'project/flipPieceH' || actionType === 'project/flipPieceV') {
    editedPiece = pieces.find(p => p.id === (payload as string));
  }

  if (!editedPiece?.linkedPieceId || !editedPiece.linkMode) return result;

  const partner = pieces.find(p => p.id === editedPiece!.linkedPieceId);
  if (!partner) return result;

  isSyncing = true;
  try {
    if (actionType === 'project/updatePiece') {
      syncUpdatePiece(store.dispatch, editedPiece, partner);
    } else if (actionType === 'project/addInternalLine') {
      syncAddInternalLine(store.dispatch, editedPiece, partner, (payload as { line: InternalLine }).line);
    } else if (actionType === 'project/updateInternalLine') {
      syncUpdateInternalLine(store.dispatch, editedPiece, partner, payload as { pieceId: string; lineId: string; path: PathCommand[] });
    } else if (actionType === 'project/flipPieceH' || actionType === 'project/flipPieceV') {
      syncUpdatePiece(store.dispatch, editedPiece, partner);
    }
  } finally {
    isSyncing = false;
  }

  return result;
};

function syncUpdatePiece(dispatch: Dispatch, source: PatternPiece, partner: PatternPiece) {
  if (source.linkMode === 'instance') {
    dispatch(updatePiece({
      ...partner,
      outline: source.outline,
      internals: source.internals,
      seamAllowance: source.seamAllowance,
      updatedAt: Date.now(),
    }));
  } else {
    const mirroredOutline = mirrorOutlineX(source.outline);
    const cx = outlineCenterX(source.outline);
    const mirroredInternals = mirrorInternalsX(source.internals, cx);
    dispatch(updatePiece({
      ...partner,
      outline: mirroredOutline,
      internals: mirroredInternals,
      seamAllowance: source.seamAllowance,
      updatedAt: Date.now(),
    }));
  }
}

function syncAddInternalLine(dispatch: Dispatch, source: PatternPiece, partner: PatternPiece, line: InternalLine) {
  if (source.linkMode === 'instance') {
    dispatch(addInternalLine({ pieceId: partner.id, line: { ...line, id: crypto.randomUUID() } }));
  } else {
    const cx = outlineCenterX(source.outline);
    const [mirrored] = mirrorInternalsX([line], cx);
    dispatch(addInternalLine({ pieceId: partner.id, line: mirrored }));
  }
}

function syncUpdateInternalLine(dispatch: Dispatch, source: PatternPiece, partner: PatternPiece, payload: { pieceId: string; lineId: string; path: PathCommand[] }) {
  if (source.linkMode === 'instance') {
    const sourceIdx = source.internals.findIndex(l => l.id === payload.lineId);
    if (sourceIdx !== -1 && partner.internals[sourceIdx]) {
      dispatch(updateInternalLine({
        pieceId: partner.id,
        lineId: partner.internals[sourceIdx].id,
        path: payload.path,
      }));
    }
  } else {
    const cx = outlineCenterX(source.outline);
    const mirroredPath = mirrorInternalsX([{ id: '', type: 'dart' as const, path: payload.path }], cx)[0].path;
    const sourceIdx = source.internals.findIndex(l => l.id === payload.lineId);
    if (sourceIdx !== -1 && partner.internals[sourceIdx]) {
      dispatch(updateInternalLine({
        pieceId: partner.id,
        lineId: partner.internals[sourceIdx].id,
        path: mirroredPath,
      }));
    }
  }
}

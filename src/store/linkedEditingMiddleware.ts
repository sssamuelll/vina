import type { Dispatch, Middleware } from '@reduxjs/toolkit';
import { updatePiece, addInternalLine, updateInternalLine } from './projectSlice';
import { mirrorOutlineX, mirrorInternalsX, outlineCenterX } from '../utils/linkedEditing';
import type { PatternPiece, InternalLine, PathCommand } from '../types/types';
import { batchUndo } from './undoMiddleware';
import { piezaBloqueada } from '../utils/piezaBloqueada';

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

interface StoreLike {
  getState(): unknown;
  dispatch: Dispatch;
}

interface ProjectStateShape {
  project?: { pieces: PatternPiece[]; layerLocked?: Record<number, boolean> };
}

const BATCH_LABELS: Record<string, string> = {
  'project/updatePiece': 'Editar pieza vinculada',
  'project/addInternalLine': 'Añadir línea interna vinculada',
  'project/updateInternalLine': 'Editar línea interna vinculada',
  'project/flipPieceH': 'Voltear pieza vinculada en horizontal',
  'project/flipPieceV': 'Voltear pieza vinculada en vertical',
};

// Pure: (action, state) → boolean. No side effects, no dispatches, no state mutation.
// `removeInternalLine` is in SYNCED_ACTIONS but has no cascade handler in the
// original middleware; we preserve that no-op behavior by excluding it here so
// it goes through the normal undo path with its existing label, instead of
// opening an empty batch.
function willCascade(action: ActionLike, state: ProjectStateShape): boolean {
  if (!SYNCED_ACTIONS.has(action.type)) return false;
  if (action.type === 'project/removeInternalLine') return false;

  const piece = locatePieceForAction(action, state);
  return Boolean(piece?.linkedPieceId && piece.linkMode);
}

function locatePieceForAction(action: ActionLike, state: ProjectStateShape): PatternPiece | undefined {
  const pieces = state.project?.pieces;
  if (!pieces) return undefined;
  const payload = action.payload;

  if (action.type === 'project/updatePiece') {
    return payload as PatternPiece;
  }
  if (
    action.type === 'project/addInternalLine' ||
    action.type === 'project/updateInternalLine'
  ) {
    return pieces.find(p => p.id === (payload as { pieceId: string }).pieceId);
  }
  if (action.type === 'project/flipPieceH' || action.type === 'project/flipPieceV') {
    return pieces.find(p => p.id === (payload as string));
  }
  return undefined;
}

/**
 * @cascade
 * shape: sym 1↔1 (mirror/instance — partner piece syncs with source)
 * triggers: project/updatePiece, project/addInternalLine,
 *           project/updateInternalLine, project/flipPieceH,
 *           project/flipPieceV (filtered by willCascade — partner must
 *           have linkedPieceId + linkMode)
 * dispatches: project/updatePiece, project/addInternalLine,
 *             project/updateInternalLine on the partner piece
 * guard: module-level boolean isSyncing (prevents re-entrance)
 * undo: grouped via batchUndo capture-all mode (BUG-7 #610 precedent)
 * cap-depth: 1 (isSyncing bypasses re-entry; partner dispatches no-op)
 * cross-ref: `docs/reports/2026-04-30-drift-fase2-b3state-cascade-middleware.md`
 */
export const linkedEditingMiddleware: Middleware = (store) => (next) => (action: unknown) => {
  if (isSyncing) return next(action);

  const act = action as ActionLike;

  if (!willCascade(act, store.getState() as ProjectStateShape)) {
    return next(action);
  }

  const label = BATCH_LABELS[act.type] ?? 'Edición vinculada';

  // Open capture-all mode before the original action reaches undoMiddleware so
  // both the source action and its synchronous partner cascade stay atomic.
  return batchUndo(store.dispatch, label, () => {
    const result = next(action);

    isSyncing = true;
    try {
      runCascade(act, store);
    } finally {
      isSyncing = false;
    }

    return result;
  });
};

function runCascade(action: ActionLike, store: StoreLike) {
  const state = store.getState() as ProjectStateShape;
  const pieces = state.project?.pieces;
  if (!pieces) return;

  const payload = action.payload;
  let editedPiece: PatternPiece | undefined;

  if (action.type === 'project/updatePiece') {
    editedPiece = pieces.find(p => p.id === (payload as PatternPiece).id);
  } else if (action.type === 'project/addInternalLine' || action.type === 'project/updateInternalLine') {
    editedPiece = pieces.find(p => p.id === (payload as { pieceId: string }).pieceId);
  } else if (action.type === 'project/flipPieceH' || action.type === 'project/flipPieceV') {
    editedPiece = pieces.find(p => p.id === (payload as string));
  }

  if (!editedPiece?.linkedPieceId || !editedPiece.linkMode) return;
  const partner = pieces.find(p => p.id === editedPiece!.linkedPieceId);
  if (!partner) return;

  // #1176 (H1): la pieza editada ya pasó su propio candado (o no tiene) —
  // eso lo decide quien despachó la acción original. Lo que este middleware
  // decide es si puede escribir sobre la PAREJA, y si está bloqueada
  // (directo o por capa) la respuesta es no: se omite solo la cascada, la
  // edición de la pieza fuente ya se aplicó vía `next(action)` y se queda.
  if (piezaBloqueada(partner, state.project?.layerLocked ?? {})) return;

  if (action.type === 'project/updatePiece') {
    syncUpdatePiece(store.dispatch, editedPiece, partner);
  } else if (action.type === 'project/addInternalLine') {
    syncAddInternalLine(store.dispatch, editedPiece, partner, (payload as { line: InternalLine }).line);
  } else if (action.type === 'project/updateInternalLine') {
    syncUpdateInternalLine(store.dispatch, editedPiece, partner, payload as LineaActualizada);
  } else if (action.type === 'project/flipPieceH' || action.type === 'project/flipPieceV') {
    syncUpdatePiece(store.dispatch, editedPiece, partner);
  }
}

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

interface LineaActualizada {
  pieceId: string;
  lineId: string;
  path: PathCommand[];
  notchAnchor?: InternalLine['notchAnchor'];
  notchOptions?: InternalLine['notchOptions'];
}

function syncUpdateInternalLine(dispatch: Dispatch, source: PatternPiece, partner: PatternPiece, payload: LineaActualizada) {
  // La forma del piquete viaja entera: sin sus opciones, la pareja guarda una
  // profundidad que ya no dibuja (P3b). El ancla, solo a la instancia: el
  // espejo la suelta a propósito, como `mirrorInternalsX`.
  const opciones = payload.notchOptions ? { notchOptions: payload.notchOptions } : {};
  if (source.linkMode === 'instance') {
    const sourceIdx = source.internals.findIndex(l => l.id === payload.lineId);
    if (sourceIdx !== -1 && partner.internals[sourceIdx]) {
      dispatch(updateInternalLine({
        pieceId: partner.id,
        lineId: partner.internals[sourceIdx].id,
        path: payload.path,
        ...(payload.notchAnchor ? { notchAnchor: payload.notchAnchor } : {}),
        ...opciones,
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
        ...opciones,
      }));
    }
  }
}

/**
 * useGuardedAction — Guards non-Redux destructive operations behind a
 * confirmation dialog, respecting the workflow expertMode and confirmOverrides.
 *
 * The module-level callback store allows the CopilotUIOverlay (Task 5) to
 * resolve the pending callback via dynamic import after the user confirms.
 *
 * @see GitHub issue #268 (Click'n'Go)
 */

import { useCallback } from 'react';
import type { UnknownAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { showConfirmation } from '../store/copilotUISlice';

// ─── Module-level callback store ────────────────────────────────────────────

const pendingCallbacks = new Map<string, () => void>();
/** Rama de cancelación, separada para no cambiarle la firma a `resolveCallback`
 *  (que ya tiene tests propios). Solo la usan los llamadores que necesitan
 *  saber que la usuaria dijo que NO — p. ej. una herramienta del copiloto que
 *  espera un booleano. */
const pendingCancels = new Map<string, () => void>();

export function resolveCallback(key: string): (() => void) | undefined {
  const cb = pendingCallbacks.get(key);
  pendingCallbacks.delete(key);
  pendingCancels.delete(key);
  return cb;
}

/** Invoca y descarta la rama de cancelación. La llama el diálogo al cerrarse. */
export function rejectCallback(key: string): void {
  const cb = pendingCancels.get(key);
  pendingCancels.delete(key);
  pendingCallbacks.delete(key);
  cb?.();
}

export function registerCallback(fn: () => void, onCancel?: () => void): string {
  const key = crypto.randomUUID();
  pendingCallbacks.set(key, fn);
  if (onCancel) pendingCancels.set(key, onCancel);
  return key;
}

export function _resetCallbacksForTest(): void {
  pendingCallbacks.clear();
  pendingCancels.clear();
}

// ─── Puente a promesa ───────────────────────────────────────────────────────

/**
 * Pide una confirmación y espera la respuesta.
 *
 * Para los llamadores que necesitan un booleano y no viven dentro de React —
 * las herramientas del copiloto, sobre todo. Antes ese caso usaba
 * `window.confirm()` con un comentario que explicaba que el diálogo de Redux
 * era una superficie oscura. Ya no lo es.
 */
export function requestConfirmation(
  // Acepta cualquier dispatch: lo llaman componentes (useDispatch), los items
  // del menú del logo (AppDispatch) y herramientas del copiloto fuera de React.
  dispatch: (a: UnknownAction) => unknown,
  opts: {
    title: string;
    description: string;
    consequences?: string[];
    confirmLabel?: string;
    destructive?: boolean;
  },
): Promise<boolean> {
  return new Promise((resolve) => {
    const key = registerCallback(() => resolve(true), () => resolve(false));
    dispatch(
      showConfirmation({
        source: 'hook',
        title: opts.title,
        description: opts.description,
        consequences: opts.consequences ?? [],
        confirmLabel: opts.confirmLabel,
        destructive: opts.destructive ?? true,
        callbackKey: key,
      }),
    );
  });
}

// ─── Operation metadata ─────────────────────────────────────────────────────

const HOOK_CONSEQUENCES: Record<string, string[]> = {
  splitPiece: ['Original piece will be replaced by two new pieces'],
  mergePieces: ['Both pieces will be replaced by a single merged piece'],
};

const HOOK_TITLES: Record<string, string> = {
  splitPiece: 'Split piece?',
  mergePieces: 'Merge pieces?',
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGuardedAction() {
  const dispatch = useDispatch();
  const expertMode = useSelector((s: RootState) => s.workflow.expertMode);
  const confirmOverrides = useSelector((s: RootState) => s.workflow.confirmOverrides);

  return useCallback(
    (operationName: string, execute: () => void) => {
      const override = confirmOverrides[operationName] ?? 'default';

      if (override === 'never' || (override === 'default' && expertMode)) {
        execute();
        return;
      }

      const key = registerCallback(execute);

      dispatch(
        showConfirmation({
          source: 'hook',
          title: HOOK_TITLES[operationName] ?? `Confirm ${operationName}?`,
          description: `This will ${operationName.replace(/([A-Z])/g, ' $1').toLowerCase()}.`,
          consequences: HOOK_CONSEQUENCES[operationName] ?? [],
          destructive: true,
          callbackKey: key,
        }),
      );
    },
    [expertMode, confirmOverrides, dispatch],
  );
}

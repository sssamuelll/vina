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
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { showConfirmation } from '../store/copilotUISlice';

// ─── Module-level callback store ────────────────────────────────────────────

const pendingCallbacks = new Map<string, () => void>();

export function resolveCallback(key: string): (() => void) | undefined {
  const cb = pendingCallbacks.get(key);
  pendingCallbacks.delete(key);
  return cb;
}

export function registerCallback(fn: () => void): string {
  const key = crypto.randomUUID();
  pendingCallbacks.set(key, fn);
  return key;
}

export function _resetCallbacksForTest(): void {
  pendingCallbacks.clear();
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

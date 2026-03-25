/**
 * useCopilotKeyboardShortcuts — Copilot-specific keyboard shortcuts.
 *
 * Handles Escape to dismiss confirmation dialogs and toasts.
 * Undo/redo is handled by the global ShortcutRegistry (useKeyboardShortcuts).
 *
 * @module useCopilotKeyboardShortcuts
 */

import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { dismissConfirmation, dismissToast } from '../../store/copilotUISlice';

interface KeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook to register copilot-specific keyboard shortcuts (Escape only).
 * Undo/redo are handled globally by useKeyboardShortcuts.
 */
export function useCopilotKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true } = options;
  const dispatch = useDispatch<AppDispatch>();
  const pendingConfirmation = useSelector((state: RootState) => state.copilotUI.pendingConfirmation);
  const toasts = useSelector((state: RootState) => state.copilotUI.toasts);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Escape: Dismiss dialogs and toasts
    if (e.key === 'Escape') {
      if (pendingConfirmation) {
        e.preventDefault();
        dispatch(dismissConfirmation());
        return;
      }
      // Dismiss most recent toast
      if (toasts.length > 0) {
        e.preventDefault();
        dispatch(dismissToast(toasts[toasts.length - 1].id));
        return;
      }
    }
  }, [enabled, dispatch, pendingConfirmation, toasts]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
}

export default useCopilotKeyboardShortcuts;

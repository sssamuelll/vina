/**
 * useCopilotKeyboardShortcuts — Global keyboard shortcuts for copilot.
 *
 * Handles:
 * - Cmd/Ctrl+Z: Undo last copilot action
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Escape: Dismiss confirmation dialogs
 *
 * @module useCopilotKeyboardShortcuts
 */

import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { undo, redo } from '../../store/editorSlice';
import { dismissConfirmation, dismissToast } from '../../store/copilotUISlice';

interface KeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook to register global keyboard shortcuts for copilot.
 */
export function useCopilotKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true } = options;
  const dispatch = useDispatch<AppDispatch>();
  const pendingConfirmation = useSelector((state: RootState) => state.copilotUI.pendingConfirmation);
  const toasts = useSelector((state: RootState) => state.copilotUI.toasts);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape even in inputs
      if (e.key !== 'Escape') return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Cmd/Ctrl+Z: Undo
    if (cmdOrCtrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      dispatch(undo());
      return;
    }

    // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y: Redo
    if (
      (cmdOrCtrl && e.shiftKey && e.key === 'z') ||
      (cmdOrCtrl && e.key === 'y')
    ) {
      e.preventDefault();
      dispatch(redo());
      return;
    }

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

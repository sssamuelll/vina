/**
 * Keyboard Shortcuts for the Agent — integrates with the app's shortcut system.
 *
 * Provides:
 * - `Cmd/Ctrl + /` — Focus CopilotPanel input
 * - `Cmd/Ctrl + Shift + /` — Toggle CopilotPanel visibility
 * - `Escape` — Blur CopilotPanel input (return focus to canvas)
 *
 * Also exports command definitions for integration with the CommandPalette.
 *
 * @module keyboardShortcuts
 */

import type { Command } from '../components/CommandPalette/CommandPalette';

/**
 * Shortcut definition for the copilot keyboard shortcuts.
 */
export interface CopilotShortcut {
  /** Shortcut key combination display string (e.g. "⌘/") */
  display: string;
  /** Description of what the shortcut does */
  description: string;
  /** Key to match in the keydown event */
  key: string;
  /** Whether Cmd/Ctrl is required */
  meta: boolean;
  /** Whether Shift is required */
  shift: boolean;
}

/**
 * All copilot keyboard shortcuts.
 */
export const COPILOT_SHORTCUTS: readonly CopilotShortcut[] = [
  {
    display: '⌘/',
    description: 'Focus chat input',
    key: '/',
    meta: true,
    shift: false,
  },
  {
    display: '⌘⇧/',
    description: 'Toggle chat panel',
    key: '/',
    meta: true,
    shift: true,
  },
  {
    display: 'Esc',
    description: 'Blur chat input',
    key: 'Escape',
    meta: false,
    shift: false,
  },
] as const;

/**
 * Check if the current platform is macOS.
 */
function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Format a shortcut key combination for display, adapting to the current OS.
 *
 * @param shortcut - The shortcut to format
 * @returns Display string (e.g. "Ctrl+/" on Windows, "⌘/" on Mac)
 */
export function formatShortcut(shortcut: CopilotShortcut): string {
  const metaKey = isMac() ? '⌘' : 'Ctrl+';
  let result = '';
  if (shortcut.meta) result += metaKey;
  if (shortcut.shift) result += isMac() ? '⇧' : 'Shift+';
  result += shortcut.key === '/' ? '/' : shortcut.key;
  return result;
}

/**
 * Handler callbacks for the copilot shortcuts.
 */
export interface CopilotShortcutHandlers {
  /** Focus the copilot input field */
  onFocusInput: () => void;
  /** Toggle copilot panel visibility */
  onTogglePanel: () => void;
  /** Blur the copilot input field (return focus to canvas) */
  onBlurInput: () => void;
}

/**
 * Create a keydown event handler for copilot shortcuts.
 *
 * Attach the returned handler to `document.addEventListener('keydown', handler)`.
 *
 * @param handlers - Callback functions for each shortcut action
 * @returns Event handler function
 */
export function createCopilotKeyHandler(
  handlers: CopilotShortcutHandlers,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    const metaOrCtrl = isMac() ? e.metaKey : e.ctrlKey;

    // Cmd/Ctrl + Shift + / → Toggle panel
    if (metaOrCtrl && e.shiftKey && e.key === '/') {
      e.preventDefault();
      handlers.onTogglePanel();
      return;
    }

    // Cmd/Ctrl + / → Focus input
    if (metaOrCtrl && !e.shiftKey && e.key === '/') {
      e.preventDefault();
      handlers.onFocusInput();
      return;
    }

    // Escape → Blur input (only when copilot input is focused)
    if (e.key === 'Escape') {
      const active = document.activeElement;
      if (active && active.classList.contains('copilot-input')) {
        e.preventDefault();
        handlers.onBlurInput();
      }
    }
  };
}

/**
 * Get CommandPalette command definitions for copilot shortcuts.
 *
 * @param handlers - Callback functions for each shortcut action
 * @returns Array of Command definitions for the CommandPalette
 */
export function getCopilotCommands(handlers: CopilotShortcutHandlers): Command[] {
  return [
    {
      id: 'copilot-focus',
      name: 'Focus Chat Input',
      category: 'Chat',
      shortcut: formatShortcut(COPILOT_SHORTCUTS[0]),
      action: handlers.onFocusInput,
    },
    {
      id: 'copilot-toggle',
      name: 'Toggle Chat Panel',
      category: 'Chat',
      shortcut: formatShortcut(COPILOT_SHORTCUTS[1]),
      action: handlers.onTogglePanel,
    },
    {
      id: 'copilot-blur',
      name: 'Return Focus to Canvas',
      category: 'Chat',
      shortcut: 'Esc',
      action: handlers.onBlurInput,
    },
  ];
}

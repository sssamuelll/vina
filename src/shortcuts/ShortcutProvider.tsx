/**
 * ShortcutProvider — React context provider with a single document keydown listener.
 *
 * Determines the active context based on which panel has focus,
 * resolves key events to matching actions, and calls registered handlers.
 *
 * Wrap your app with <ShortcutProvider> to enable centralized shortcut handling.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { ShortcutRegistry, type ShortcutContext as ShortcutCtx } from './ShortcutRegistry';
import { DEFAULT_SHORTCUTS } from './defaults';
import { ShortcutContext } from './ShortcutContext';

/** Determine which panel has focus based on the active element */
function getActiveContext(): ShortcutCtx[] {
  const active = document.activeElement;
  const contexts: ShortcutCtx[] = ['global'];

  if (!active || active === document.body) {
    // No specific focus — global + both panels
    contexts.push('2d', '3d');
    return contexts;
  }

  // Check if the active element is inside a specific panel
  const el = active as HTMLElement;
  if (el.closest('[data-shortcut-context="2d"]') || el.closest('.pattern-editor')) {
    contexts.push('2d');
  } else if (el.closest('[data-shortcut-context="3d"]') || el.closest('.viewport-3d')) {
    contexts.push('3d');
  } else if (el.closest('[data-shortcut-context="copilot"]') || el.closest('.copilot-panel')) {
    contexts.push('copilot');
  } else {
    // Unknown focus — allow both 2d and 3d
    contexts.push('2d', '3d');
  }

  return contexts;
}

interface ShortcutProviderProps {
  children: React.ReactNode;
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  const registry = useMemo(() => new ShortcutRegistry(DEFAULT_SHORTCUTS), []);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs (unless Escape)
      if (
        (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
        e.key !== 'Escape'
      ) {
        return;
      }

      const activeContexts = getActiveContext();
      const actionId = registryRef.current.matchEvent(e, activeContexts);

      if (actionId) {
        const actionHandler = registryRef.current.getHandler(actionId);
        if (actionHandler) {
          e.preventDefault();
          actionHandler();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <ShortcutContext.Provider value={registry}>
      {children}
    </ShortcutContext.Provider>
  );
}

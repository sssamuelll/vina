/**
 * useShortcut — Register a keyboard shortcut handler from any component.
 *
 * Connects a component's action handler to the centralized ShortcutRegistry.
 * Automatically cleans up on unmount.
 *
 * @example
 * useShortcut('sim.toggle', () => dispatch(toggleSimulation()));
 */

import { useEffect, useContext } from 'react';
import { ShortcutContext } from './ShortcutContext';

export function useShortcut(actionId: string, handler: () => void): void {
  const registry = useContext(ShortcutContext);

  useEffect(() => {
    if (!registry) return;
    registry.registerHandler(actionId, handler);
    return () => registry.unregisterHandler(actionId);
  }, [registry, actionId, handler]);
}

export function useShortcutRegistry() {
  return useContext(ShortcutContext);
}

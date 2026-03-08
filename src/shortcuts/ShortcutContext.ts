/**
 * React context for the ShortcutRegistry — in a separate file
 * to satisfy react-refresh/only-export-components lint rule.
 */

import { createContext } from 'react';
import type { ShortcutRegistry } from './ShortcutRegistry';

export const ShortcutContext = createContext<ShortcutRegistry | null>(null);

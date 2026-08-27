import type { DebugStore } from './DebugStore';
import { safeSetItem } from '../../utils/safeStorage';

export const DEBUG_BRIDGE_STORAGE_KEY = 'vina-debug-bridge';

export interface DebugAPI {
  getRecords: () => ReturnType<DebugStore['getAll']>;
  getFailures: () => ReturnType<DebugStore['getFailures']>;
  getRecord: (id: string) => ReturnType<DebugStore['getById']>;
  getRecent: (limit?: number) => ReturnType<DebugStore['getRecent']>;
  exportJSON: () => ReturnType<DebugStore['exportAsJSON']>;
  clear: () => void;
  enable: () => void;
  disable: () => void;
}

export function createDebugAPI(store: DebugStore): DebugAPI {
  return {
    getRecords: () => store.getAll(),
    getFailures: () => store.getFailures(),
    getRecord: (id: string) => store.getById(id),
    getRecent: (limit = 10) => store.getRecent(limit),
    exportJSON: () => store.exportAsJSON(),
    clear: () => store.clear(),
    // LS-only: flag síncrono y mínimo leído antes de construir el recorder verboso.
    enable: () => safeSetItem(DEBUG_BRIDGE_STORAGE_KEY, 'true'),
    // LS-only: flag síncrono y mínimo leído antes de construir el recorder verboso.
    disable: () => safeSetItem(DEBUG_BRIDGE_STORAGE_KEY, 'false'),
  };
}

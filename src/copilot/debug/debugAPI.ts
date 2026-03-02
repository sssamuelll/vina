import type { DebugStore } from './DebugStore';

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
    enable: () => localStorage.setItem('openclo-debug-bridge', 'true'),
    disable: () => localStorage.setItem('openclo-debug-bridge', 'false'),
  };
}

import type { RootState } from '../../store';
import { DebugStore } from '../../copilot/debug/DebugStore';
import { isDebugEnabled } from '../../copilot/debug/createDebugBridge';
import { getToolExecutions } from '../../copilot/debug/toolExecutionTracker';
import { getHistory } from '../../store/undoMiddleware';
import { getActiveSolverTier } from '../cloth/solverRuntimeTracker';
import { getTrackedErrors } from '../errorTracker';
import { downloadBlob } from './turntableRenderer';

type DiagnosticState = Pick<
  RootState,
  'project' | 'avatar' | 'simulation' | 'inspector'
>;

export interface DiagnosticSources {
  getHistory: typeof getHistory;
  getTrackedErrors: typeof getTrackedErrors;
  getToolExecutions: typeof getToolExecutions;
  getActiveSolverTier: typeof getActiveSolverTier;
  isDebugEnabled: typeof isDebugEnabled;
  getDebugRecords: () => ReturnType<DebugStore['getAll']>;
}

export interface DiagnosticBundle {
  exportedAt: string;
  project: RootState['project'];
  avatar: RootState['avatar'];
  simulation: RootState['simulation'];
  solver: {
    activeTier: ReturnType<typeof getActiveSolverTier>;
    lastSelectedTier: RootState['simulation']['solverTier'];
    config: RootState['simulation'];
  };
  inspector: Pick<
    RootState['inspector'],
    'lastSolverError' | 'seamResolutionErrors'
  >;
  history: ReturnType<typeof getHistory>;
  errors: ReturnType<typeof getTrackedErrors>;
  toolExecutions: ReturnType<typeof getToolExecutions>;
  agentDebugRecords: ReturnType<DebugStore['getAll']>;
}

const browserSources: DiagnosticSources = {
  getHistory,
  getTrackedErrors,
  getToolExecutions,
  getActiveSolverTier,
  isDebugEnabled,
  getDebugRecords: () => new DebugStore().getAll(),
};

export function buildDiagnosticBundle(
  state: DiagnosticState,
  exportedAt = new Date().toISOString(),
  sources: DiagnosticSources = browserSources,
): DiagnosticBundle {
  const debugEnabled = sources.isDebugEnabled();
  return {
    exportedAt,
    project: state.project,
    avatar: state.avatar,
    simulation: state.simulation,
    solver: {
      activeTier: sources.getActiveSolverTier(),
      lastSelectedTier: state.simulation.solverTier,
      config: state.simulation,
    },
    inspector: {
      lastSolverError: state.inspector.lastSolverError,
      seamResolutionErrors: state.inspector.seamResolutionErrors,
    },
    history: sources.getHistory(),
    errors: sources.getTrackedErrors(),
    toolExecutions: sources.getToolExecutions(),
    agentDebugRecords: debugEnabled ? sources.getDebugRecords() : [],
  };
}

export function downloadDiagnosticBundle(state: DiagnosticState): void {
  const bundle = buildDiagnosticBundle(state);
  const safeTimestamp = bundle.exportedAt.replace(/[:.]/g, '-');
  downloadBlob(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
    `vina-diagnostico-${safeTimestamp}.json`,
  );
}

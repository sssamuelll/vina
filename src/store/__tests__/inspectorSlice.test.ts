import { describe, it, expect } from 'vitest';
import inspectorReducer, {
  setInspectionTarget,
  setInspectionData,
  setDiagnostics,
  setAgentAnalysis,
  setAgentStreaming,
  setAgentError,
  setUnresolvedCount,
  clearInspection,
  type InspectorState,
} from '../inspectorSlice';
import type {
  InspectionTarget,
  InspectionData,
  Diagnostic,
  AgentAnalysis,
} from '../../diagnostics/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockTarget: InspectionTarget = {
  type: 'piece',
  pieceId: 'piece-1',
};

const mockEdgeTarget: InspectionTarget = {
  type: 'edge',
  pieceId: 'piece-2',
  edgeName: 'left-side',
};

const mockData: InspectionData = {
  target: mockTarget,
  timestamp: 1000,
  piece: {
    id: 'piece-1',
    name: 'Front Bodice',
    position: { x: 0, y: 0 },
    rotation: 0,
    seamAllowance: 10,
    area: 2500,
  },
  seams: [],
  internals: [],
};

const mockDiagnostics: Diagnostic[] = [
  { severity: 'warning', category: 'seam', message: 'Seam length mismatch' },
  { severity: 'info', category: 'fit', message: 'Ease within tolerance' },
];

const mockAnalysis: AgentAnalysis = {
  summary: 'Piece looks mostly good with minor issues.',
  explanations: ['The seam allowances are slightly uneven.'],
  suggestions: [
    {
      description: 'Adjust seam allowance to 12mm',
      impact: 'Improves construction quality',
    },
  ],
};

// ─── Initial State ────────────────────────────────────────────────────────────

describe('inspectorSlice — initial state', () => {
  it('starts with all fields null/empty', () => {
    const state = inspectorReducer(undefined, { type: '@@INIT' });
    expect(state.target).toBeNull();
    expect(state.data).toBeNull();
    expect(state.diagnostics).toEqual([]);
    expect(state.agentAnalysis).toBeNull();
    expect(state.agentStreaming).toBe(false);
    expect(state.agentError).toBeNull();
    expect(state.unresolvedCount).toBe(0);
  });
});

// ─── setInspectionTarget ──────────────────────────────────────────────────────

describe('setInspectionTarget', () => {
  it('sets the target', () => {
    const state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    expect(state.target).toEqual(mockTarget);
  });

  it('clears data when target is set', () => {
    let state = inspectorReducer(undefined, setInspectionData(mockData));
    state = inspectorReducer(state, setInspectionTarget(mockEdgeTarget));
    expect(state.data).toBeNull();
  });

  it('clears diagnostics when target is set', () => {
    let state = inspectorReducer(undefined, setDiagnostics(mockDiagnostics));
    state = inspectorReducer(state, setInspectionTarget(mockTarget));
    expect(state.diagnostics).toEqual([]);
  });

  it('clears agentAnalysis when target is set', () => {
    let state = inspectorReducer(undefined, setAgentAnalysis(mockAnalysis));
    state = inspectorReducer(state, setInspectionTarget(mockTarget));
    expect(state.agentAnalysis).toBeNull();
  });

  it('clears agentError when target is set', () => {
    let state = inspectorReducer(undefined, setAgentError('Something went wrong'));
    state = inspectorReducer(state, setInspectionTarget(mockTarget));
    expect(state.agentError).toBeNull();
  });

  it('does not affect agentStreaming when target is set', () => {
    let state = inspectorReducer(undefined, setAgentStreaming(true));
    state = inspectorReducer(state, setInspectionTarget(mockTarget));
    // agentStreaming is NOT cleared by setInspectionTarget per spec
    // (clearInspection handles full reset)
    expect(state.target).toEqual(mockTarget);
  });
});

// ─── setInspectionData ────────────────────────────────────────────────────────

describe('setInspectionData', () => {
  it('stores inspection data', () => {
    const state = inspectorReducer(undefined, setInspectionData(mockData));
    expect(state.data).toEqual(mockData);
  });

  it('does not clear existing target', () => {
    let state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    state = inspectorReducer(state, setInspectionData(mockData));
    expect(state.target).toEqual(mockTarget);
  });
});

// ─── setDiagnostics ───────────────────────────────────────────────────────────

describe('setDiagnostics', () => {
  it('stores diagnostics array', () => {
    const state = inspectorReducer(undefined, setDiagnostics(mockDiagnostics));
    expect(state.diagnostics).toEqual(mockDiagnostics);
  });

  it('replaces existing diagnostics', () => {
    let state = inspectorReducer(undefined, setDiagnostics(mockDiagnostics));
    const newDiags: Diagnostic[] = [{ severity: 'critical', category: 'geometry', message: 'Self-intersection' }];
    state = inspectorReducer(state, setDiagnostics(newDiags));
    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0].severity).toBe('critical');
  });

  it('accepts empty array', () => {
    let state = inspectorReducer(undefined, setDiagnostics(mockDiagnostics));
    state = inspectorReducer(state, setDiagnostics([]));
    expect(state.diagnostics).toEqual([]);
  });
});

// ─── setAgentAnalysis ─────────────────────────────────────────────────────────

describe('setAgentAnalysis', () => {
  it('stores agent analysis', () => {
    const state = inspectorReducer(undefined, setAgentAnalysis(mockAnalysis));
    expect(state.agentAnalysis).toEqual(mockAnalysis);
  });

  it('sets agentStreaming to false', () => {
    let state = inspectorReducer(undefined, setAgentStreaming(true));
    state = inspectorReducer(state, setAgentAnalysis(mockAnalysis));
    expect(state.agentStreaming).toBe(false);
  });

  it('does not clear agentError (only streaming is stopped)', () => {
    let state = inspectorReducer(undefined, setAgentError('prior error'));
    state = inspectorReducer(state, setAgentAnalysis(mockAnalysis));
    // agentError is NOT cleared by setAgentAnalysis — analysis supersedes it
    expect(state.agentAnalysis).toEqual(mockAnalysis);
    expect(state.agentStreaming).toBe(false);
  });
});

// ─── setAgentStreaming ────────────────────────────────────────────────────────

describe('setAgentStreaming', () => {
  it('sets streaming to true', () => {
    const state = inspectorReducer(undefined, setAgentStreaming(true));
    expect(state.agentStreaming).toBe(true);
  });

  it('sets streaming to false', () => {
    let state = inspectorReducer(undefined, setAgentStreaming(true));
    state = inspectorReducer(state, setAgentStreaming(false));
    expect(state.agentStreaming).toBe(false);
  });
});

// ─── setAgentError ────────────────────────────────────────────────────────────

describe('setAgentError', () => {
  it('stores the error message', () => {
    const state = inspectorReducer(undefined, setAgentError('Network timeout'));
    expect(state.agentError).toBe('Network timeout');
  });

  it('sets agentStreaming to false', () => {
    let state = inspectorReducer(undefined, setAgentStreaming(true));
    state = inspectorReducer(state, setAgentError('LLM unavailable'));
    expect(state.agentStreaming).toBe(false);
  });

  it('does not clear target or data', () => {
    let state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    state = inspectorReducer(state, setInspectionData(mockData));
    state = inspectorReducer(state, setAgentError('Something failed'));
    expect(state.target).toEqual(mockTarget);
    expect(state.data).toEqual(mockData);
  });
});

// ─── clearInspection ──────────────────────────────────────────────────────────

describe('clearInspection', () => {
  it('resets all state to initial values', () => {
    // Build up a rich state
    let state: InspectorState = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    state = inspectorReducer(state, setInspectionData(mockData));
    state = inspectorReducer(state, setDiagnostics(mockDiagnostics));
    state = inspectorReducer(state, setAgentAnalysis(mockAnalysis));
    state = inspectorReducer(state, setAgentStreaming(true));
    state = inspectorReducer(state, setAgentError('some error'));

    state = inspectorReducer(state, clearInspection());

    expect(state.target).toBeNull();
    expect(state.data).toBeNull();
    expect(state.diagnostics).toEqual([]);
    expect(state.agentAnalysis).toBeNull();
    expect(state.agentStreaming).toBe(false);
    expect(state.agentError).toBeNull();
  });
});

// ─── Side-effect combinations ─────────────────────────────────────────────────

describe('side-effect interaction tests', () => {
  it('full inspection pipeline: target → data → diagnostics → analysis', () => {
    let state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    expect(state.target).toEqual(mockTarget);
    expect(state.data).toBeNull();

    state = inspectorReducer(state, setInspectionData(mockData));
    expect(state.data).toEqual(mockData);

    state = inspectorReducer(state, setDiagnostics(mockDiagnostics));
    expect(state.diagnostics).toHaveLength(2);

    state = inspectorReducer(state, setAgentStreaming(true));
    expect(state.agentStreaming).toBe(true);

    state = inspectorReducer(state, setAgentAnalysis(mockAnalysis));
    expect(state.agentAnalysis).toEqual(mockAnalysis);
    expect(state.agentStreaming).toBe(false);
  });

  it('switching target resets previous results but not streaming', () => {
    let state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    state = inspectorReducer(state, setInspectionData(mockData));
    state = inspectorReducer(state, setDiagnostics(mockDiagnostics));
    state = inspectorReducer(state, setAgentAnalysis(mockAnalysis));

    // Switch to a different target
    state = inspectorReducer(state, setInspectionTarget(mockEdgeTarget));
    expect(state.target).toEqual(mockEdgeTarget);
    expect(state.data).toBeNull();
    expect(state.diagnostics).toEqual([]);
    expect(state.agentAnalysis).toBeNull();
    expect(state.agentError).toBeNull();
  });

  it('error stops streaming and records message', () => {
    let state = inspectorReducer(undefined, setInspectionTarget(mockTarget));
    state = inspectorReducer(state, setAgentStreaming(true));
    state = inspectorReducer(state, setAgentError('Rate limit exceeded'));
    expect(state.agentStreaming).toBe(false);
    expect(state.agentError).toBe('Rate limit exceeded');
  });
});

// ─── setUnresolvedCount ──────────────────────────────────────────────────────

describe('setUnresolvedCount', () => {
  it('updates unresolvedCount', () => {
    const state = inspectorReducer(undefined, setUnresolvedCount(5));
    expect(state.unresolvedCount).toBe(5);
  });

  it('resets to zero', () => {
    let state = inspectorReducer(undefined, setUnresolvedCount(3));
    state = inspectorReducer(state, setUnresolvedCount(0));
    expect(state.unresolvedCount).toBe(0);
  });

  it('is reset by clearInspection', () => {
    let state = inspectorReducer(undefined, setUnresolvedCount(7));
    state = inspectorReducer(state, clearInspection());
    expect(state.unresolvedCount).toBe(0);
  });
});

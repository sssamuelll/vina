/**
 * Inspector Slice — Diagnostic Inspector state (Issue #32, Task 2)
 *
 * Manages reactive state for the diagnostic inspector panel:
 * - The current inspection target (piece, edge, point, vertex)
 * - Extracted inspection data for that target
 * - Rule-based diagnostics derived from the data
 * - Agent analysis streamed from the LLM
 * - Construction-related error counters (unresolvedCount, lastSolverError)
 *
 * **E-async ratified (§ 3.1.A)**: this slice exemplifies the canonical
 * "per-slice async-derived state with selector access" row of the B8
 * 6-pattern convention table — `agentError` + `agentStreaming` (LLM
 * streaming lifecycle) + `lastSolverError` (E-async D8 gap 5 closure)
 * all live here because they are **cross-feature persistent** state
 * needing selector access (InspectorTab consumes via `useSelector`).
 *
 * Cross-ref: docs/reports/2026-05-03-drift-fase2-e-async-states.md § 3.1.A.
 *
 * @module inspectorSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch } from './index';
import { NEW_PROJECT } from './actions';
import type {
  InspectionTarget,
  InspectionData,
  Diagnostic,
  AgentAnalysis,
} from '../diagnostics/types';

// ============================================================================
// State
// ============================================================================

/** Shared between `InspectorState.lastSolverError` and `setLastSolverError` payload. */
export interface SolverPoolError {
  error: string;
  jobId?: string;
  timestamp: number;
}

export interface InspectorState {
  /** The element currently being inspected. null = panel closed / no selection. */
  target: InspectionTarget | null;
  /** Extracted data for the current target. Populated by the inspector pipeline. */
  data: InspectionData | null;
  /** Rule-based diagnostics computed from `data`. */
  diagnostics: Diagnostic[];
  /** LLM agent analysis of the current inspection. */
  agentAnalysis: AgentAnalysis | null;
  /** True while the agent is streaming its response. */
  agentStreaming: boolean;
  /** Last agent error message, if any. */
  agentError: string | null;
  /** Global count of construction points with resolution errors */
  unresolvedCount: number;
  /**
   * Last error from the parametric construction worker pool, if any.
   *
   * E-async D8 gap 5 closure (§ 3.5.3.A): surfaces reactiveSolverMiddleware
   * `pool.onError` events to Redux for visibility. Adjacent to
   * `unresolvedCount` (both are construction-related diagnostics). Toast
   * dispatched in parallel for transient surface; this field preserves
   * last-error detail for inspection (Redux DevTools, future panel UI).
   * `null` = no recent error / cleared.
   */
  lastSolverError: SolverPoolError | null;
}

const initialState: InspectorState = {
  target: null,
  data: null,
  diagnostics: [],
  agentAnalysis: null,
  agentStreaming: false,
  agentError: null,
  unresolvedCount: 0,
  lastSolverError: null,
};

// ============================================================================
// Slice
// ============================================================================

const inspectorSlice = createSlice({
  name: 'inspector',
  initialState,
  reducers: {
    /**
     * Set the inspection target.
     *
     * Side effects: clears data, diagnostics, agentAnalysis, and agentError
     * so stale results from a previous target are never shown.
     */
    setInspectionTarget(state, action: PayloadAction<InspectionTarget>) {
      state.target = action.payload;
      state.data = null;
      state.diagnostics = [];
      state.agentAnalysis = null;
      state.agentError = null;
    },

    /**
     * Store the extracted inspection data for the current target.
     */
    setInspectionData(state, action: PayloadAction<InspectionData>) {
      state.data = action.payload;
    },

    /**
     * Replace the diagnostics list with freshly computed diagnostics.
     */
    setDiagnostics(state, action: PayloadAction<Diagnostic[]>) {
      state.diagnostics = action.payload;
    },

    /**
     * Store the agent's analysis result and mark streaming as complete.
     */
    setAgentAnalysis(state, action: PayloadAction<AgentAnalysis>) {
      state.agentAnalysis = action.payload;
      state.agentStreaming = false;
    },

    /**
     * Toggle the agent streaming indicator.
     */
    setAgentStreaming(state, action: PayloadAction<boolean>) {
      state.agentStreaming = action.payload;
    },

    /**
     * Record an agent error and mark streaming as stopped.
     */
    setAgentError(state, action: PayloadAction<string>) {
      state.agentError = action.payload;
      state.agentStreaming = false;
    },

    /**
     * Update the global count of construction points with resolution errors.
     */
    setUnresolvedCount(state, action: PayloadAction<number>) {
      state.unresolvedCount = action.payload;
    },

    /**
     * Record the last solver/worker error from the reactive solver pool.
     *
     * E-async D8 gap 5 closure (§ 3.5.3.A): paired with rate-limited toast
     * dispatched in parallel from the middleware. Pass `null` to clear.
     */
    setLastSolverError(state, action: PayloadAction<SolverPoolError | null>) {
      state.lastSolverError = action.payload;
    },

    /**
     * Reset the inspector to its initial (closed) state.
     */
    clearInspection() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setInspectionTarget,
  setInspectionData,
  setDiagnostics,
  setAgentAnalysis,
  setAgentStreaming,
  setAgentError,
  setUnresolvedCount,
  setLastSolverError,
  clearInspection,
} = inspectorSlice.actions;

/**
 * Set the inspection target for a piece. The InspectorTab UI lives in
 * ContextPanel now (AppShell lazy import); user must open it via the
 * UnifiedBar / TopBar.
 */
export function dispatchInspectPiece(dispatch: AppDispatch, pieceId: string) {
  dispatch(setInspectionTarget({ type: 'piece', pieceId }));
}

export default inspectorSlice.reducer;

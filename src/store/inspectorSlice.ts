/**
 * Inspector Slice — Diagnostic Inspector state (Issue #32, Task 2)
 *
 * Manages reactive state for the diagnostic inspector panel:
 * - The current inspection target (piece, edge, point, vertex)
 * - Extracted inspection data for that target
 * - Rule-based diagnostics derived from the data
 * - Agent analysis streamed from the LLM
 *
 * @module inspectorSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch } from './index';
import { setBottomPanelTab } from './layoutSlice';
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
}

const initialState: InspectorState = {
  target: null,
  data: null,
  diagnostics: [],
  agentAnalysis: null,
  agentStreaming: false,
  agentError: null,
  unresolvedCount: 0,
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
  clearInspection,
} = inspectorSlice.actions;

/** Helper: dispatch both setInspectionTarget + setBottomPanelTab('inspector') */
export function dispatchInspectPiece(dispatch: AppDispatch, pieceId: string) {
  dispatch(setInspectionTarget({ type: 'piece', pieceId }));
  dispatch(setBottomPanelTab('inspector'));
}

export default inspectorSlice.reducer;

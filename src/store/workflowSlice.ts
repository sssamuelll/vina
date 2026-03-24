import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export interface WorkflowState {
  expertMode: boolean;
  confirmOverrides: Record<string, 'default' | 'always' | 'never'>;
  toolMemory: Record<string, Record<string, unknown>>;
}

const STORAGE_KEY = 'openclo-workflow';
const STORAGE_VERSION = 1;

interface PersistedEnvelope {
  version: number;
  data: WorkflowState;
}

const initialState: WorkflowState = {
  expertMode: false,
  confirmOverrides: {},
  toolMemory: {},
};

/**
 * Write the current workflow state to localStorage as a versioned envelope.
 * Silently swallows errors (e.g. private browsing, storage full).
 */
export function persistWorkflow(state: WorkflowState): void {
  const envelope: PersistedEnvelope = { version: STORAGE_VERSION, data: state };
  safeSetItem(STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Read the workflow state from localStorage.
 * Returns null on missing key, parse errors, or version mismatches.
 */
export function loadWorkflow(): WorkflowState | null {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as PersistedEnvelope;
    if (envelope.version !== STORAGE_VERSION || !envelope.data) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    setExpertMode(state, action: PayloadAction<boolean>) {
      state.expertMode = action.payload;
    },

    setConfirmOverride(
      state,
      action: PayloadAction<{ operation: string; value: 'default' | 'always' | 'never' }>
    ) {
      state.confirmOverrides[action.payload.operation] = action.payload.value;
    },

    updateToolMemory(
      state,
      action: PayloadAction<{ tool: string; values: Record<string, unknown> }>
    ) {
      const existing = state.toolMemory[action.payload.tool] ?? {};
      state.toolMemory[action.payload.tool] = { ...existing, ...action.payload.values };
    },

    clearToolMemory(state) {
      state.toolMemory = {};
    },

    rehydrateWorkflow(state, action: PayloadAction<WorkflowState>) {
      state.expertMode = action.payload.expertMode;
      state.confirmOverrides = action.payload.confirmOverrides;
      state.toolMemory = action.payload.toolMemory;
    },
  },

  extraReducers: (builder) => {
    // On new project: keep expertMode and confirmOverrides, only clear toolMemory
    builder.addCase(NEW_PROJECT, (state) => {
      state.toolMemory = {};
    });
  },
});

export const {
  setExpertMode,
  setConfirmOverride,
  updateToolMemory,
  clearToolMemory,
  rehydrateWorkflow,
} = workflowSlice.actions;

export default workflowSlice.reducer;

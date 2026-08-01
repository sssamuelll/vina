import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { NEW_PROJECT } from './actions';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import type { FormatId } from '../utils/dxf/types';

export interface WorkflowState {
  expertMode: boolean;
  confirmOverrides: Record<string, 'default' | 'always' | 'never'>;
  toolMemory: Record<string, Record<string, unknown>>;
  dxfPreferredFormat: FormatId | null;
}

const STORAGE_KEY = 'vina-workflow';
const STORAGE_VERSION = 1;

// ─── Bounds for the persisted envelope (defense-in-depth at the boundary) ────
const MAX_KEY_LEN = 80;
const MAX_STR_VAL_LEN = 1024;
const MAX_TOOLS = 200;
const MAX_OPTIONS_PER_TOOL = 50;
const MAX_OVERRIDES = 50;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FORMAT_IDS = ['aama', 'astm', 'gerber', 'lectra', 'standard'] as const;
const OVERRIDE_VALUES = ['default', 'always', 'never'] as const;

const recordKey = z
  .string()
  .min(1, { message: 'must be non-empty' })
  .max(MAX_KEY_LEN, { message: `must be <= ${MAX_KEY_LEN} chars` })
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' })
  .refine((s) => !FORBIDDEN_KEYS.has(s), { message: 'forbidden key' });

const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: 'must be finite (no NaN/Infinity)' });

const boundedString = z
  .string()
  .max(MAX_STR_VAL_LEN, { message: `must be <= ${MAX_STR_VAL_LEN} chars` })
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });

// Tool option values must be JSON primitives. Nested objects/arrays cannot
// round-trip through `setToolOption` use cases (which are toggle/number/select/color)
// and are rejected to prevent silent shape drift via persisted state.
const toolOptionValue = z.union([boundedString, finiteNumber, z.boolean(), z.null()]);

const toolMemorySchema = z
  .record(recordKey, z.record(recordKey, toolOptionValue))
  .refine((r) => Object.keys(r).length <= MAX_TOOLS, {
    message: `too many tools (> ${MAX_TOOLS})`,
  })
  .refine(
    (r) => Object.values(r).every((opts) => Object.keys(opts).length <= MAX_OPTIONS_PER_TOOL),
    { message: `too many options for a tool (> ${MAX_OPTIONS_PER_TOOL})` },
  );

const confirmOverridesSchema = z
  .record(recordKey, z.enum(OVERRIDE_VALUES))
  .refine((r) => Object.keys(r).length <= MAX_OVERRIDES, {
    message: `too many overrides (> ${MAX_OVERRIDES})`,
  });

const WorkflowStateSchema = z
  .object({
    expertMode: z.boolean(),
    confirmOverrides: confirmOverridesSchema,
    toolMemory: toolMemorySchema,
    dxfPreferredFormat: z.enum(FORMAT_IDS).nullable(),
  })
  .strict();

const PersistedEnvelopeSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    data: WorkflowStateSchema,
  })
  .strict();

interface PersistedEnvelope {
  version: number;
  data: WorkflowState;
}

const initialState: WorkflowState = {
  expertMode: false,
  confirmOverrides: {},
  toolMemory: {},
  dxfPreferredFormat: null,
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
 *
 * Untrusted boundary: `localStorage` can be written by browser extensions,
 * historical app bugs, or a previously-XSS'd origin. The cast that lived here
 * before (`as PersistedEnvelope`) was ceremonial — only `version` and the
 * truthiness of `data` were checked. A poisoned envelope with
 * `expertMode: "true"` (string) or `confirmOverrides: { removePiece: "never" }`
 * would silently disable destructive-action confirmation on rehydration.
 *
 * Now: a strict zod schema validates the entire envelope. Failure modes that
 * return `null` (so the caller falls back to `initialState`):
 *   - missing/extra fields at envelope or `data` level (forward-compat is
 *     handled via `STORAGE_VERSION` bumps, not silent passthrough);
 *   - wrong primitive types, non-finite numbers, oversized strings, null bytes;
 *   - prototype-pollution-shaped keys (`__proto__`, `constructor`, `prototype`);
 *   - `confirmOverrides` values outside `'default' | 'always' | 'never'`;
 *   - `dxfPreferredFormat` outside the FormatId enum;
 *   - non-primitive tool option values, or entry counts above the caps.
 *
 * Pure: no side effects beyond the read. Called once at app boot from
 * `store/index.ts`; no caching needed.
 */
export function loadWorkflow(): WorkflowState | null {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return null;

  // The reviver runs once per key — including reserved names like
  // `__proto__` that zod's record validator silently strips for safety.
  // We elevate that to a hard reject so a poisoned envelope cannot be
  // partially-accepted with surprising keys dropped without notice.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('forbidden key');
      return value;
    });
  } catch {
    return null;
  }

  const result = PersistedEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5).map((i) => ({
      path: i.path.join('.'),
      code: i.code,
      message: i.message,
    }));
    console.warn('[workflowSlice] discarding corrupt envelope', { issues });
    return null;
  }
  return result.data.data;
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

    setDxfPreferredFormat(state, action: PayloadAction<FormatId | null>) {
      state.dxfPreferredFormat = action.payload;
    },

    rehydrateWorkflow(state, action: PayloadAction<WorkflowState>) {
      state.expertMode = action.payload.expertMode;
      state.confirmOverrides = action.payload.confirmOverrides;
      state.toolMemory = action.payload.toolMemory;
      state.dxfPreferredFormat = action.payload.dxfPreferredFormat ?? null;
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
  setDxfPreferredFormat,
  rehydrateWorkflow,
} = workflowSlice.actions;

export default workflowSlice.reducer;

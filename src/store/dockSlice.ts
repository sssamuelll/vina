import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

type DockSide = 'left' | 'right';

export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
}

const STORAGE_KEY = 'openclo-docks';
const STORAGE_VERSION = 1;
const MAX_PINNED = 16;
const MAX_ID_LEN = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const idString = z
  .string()
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const sideArray = z.array(idString).max(MAX_PINNED);

const DockStateSchema = z
  .object({ pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict() })
  .strict();

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: DockStateSchema })
  .strict();

const initialState: DockState = { pinnedExtra: { left: [], right: [] } };

/** Persist the kept-dock set to its own LS key (small per-user UI preference;
 *  LS-only, co-located in spirit with workflowSlice prefs — not project data). */
export function persistDocks(state: DockState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: state }));
}

export function loadDocks(): DockState | null {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return null;
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
    console.warn('[dockSlice] discarding corrupt envelope', {
      issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
    return null;
  }
  return result.data.data;
}

const dockSlice = createSlice({
  name: 'dock',
  initialState,
  reducers: {
    pinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      if (!state.pinnedExtra[side].includes(id)) state.pinnedExtra[side].push(id);
    },
    unpinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      state.pinnedExtra[side] = state.pinnedExtra[side].filter((x) => x !== id);
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
    },
  },
  // No new-project handler: the kept set is a user preference and persists across projects.
});

export const { pinAuto, unpinAuto, rehydrateDocks } = dockSlice.actions;
export default dockSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

type DockSide = 'left' | 'right';

export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
  /** Auto-signaling preference. 'off' mutes ✦ suggestions + badges + the "auto"
   *  label; kept items still render as plain buttons. Default 'subtle'. */
  signaling: 'subtle' | 'off';
  /** The left (2D) dock's tool membership — ids drawn from DOCK_2D_CATALOG.
   *  Rendered in catalog order. Default DEFAULT_DOCK_2D_IDS. Min 1 (never empty). */
  tools2d: string[];
}

const STORAGE_KEY = 'openclo-docks';
const STORAGE_VERSION = 1;
const MAX_PINNED = 16;
const MAX_ID_LEN = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** The 7 default left-dock 2D tool ids, in render order. Lives here (store layer)
 *  so the slice owns its default without importing the component-layer catalog. */
export const DEFAULT_DOCK_2D_IDS = ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam'];

const idString = z
  .string()
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const sideArray = z.array(idString).max(MAX_PINNED);

const signalingSchema = z.enum(['subtle', 'off']).default('subtle');

const tools2dSchema = z.array(idString).max(MAX_PINNED).default([...DEFAULT_DOCK_2D_IDS]);

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
    tools2d: tools2dSchema,
  })
  .strict();

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: DockStateSchema })
  .strict();

const initialState: DockState = { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: [...DEFAULT_DOCK_2D_IDS] };

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
    toggleDockSignaling(state) {
      state.signaling = state.signaling === 'subtle' ? 'off' : 'subtle';
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
      state.signaling = action.payload.signaling;
      state.tools2d = action.payload.tools2d;
    },
    addDockTool(state, action: PayloadAction<string>) {
      if (!state.tools2d.includes(action.payload)) state.tools2d.push(action.payload);
    },
    removeDockTool(state, action: PayloadAction<string>) {
      if (state.tools2d.length <= 1) return; // never empty the dock
      state.tools2d = state.tools2d.filter((id) => id !== action.payload);
    },
    resetDockTools(state) {
      state.tools2d = [...DEFAULT_DOCK_2D_IDS];
    },
  },
  // No new-project handler: the kept set is a user preference and persists across projects.
});

export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling, addDockTool, removeDockTool, resetDockTools } = dockSlice.actions;
export default dockSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export interface LayoutState {
  /** 2D/3D view order — which is on the left in split mode */
  primaryView: '2d' | '3d';
  /** Split ratio when in split mode */
  splitRatio: number;
}

const STORAGE_KEY = 'vina-layout';

const LAYOUT_DEFAULTS: LayoutState = {
  primaryView: '2d',
  splitRatio: 0.5,
};

// shape: LayoutState v1 — opt-in envelope: no
//
// LS-only justification (per CLAUDE.md B6-state): layout is pure UI chrome
// state — primary axis + split ratio. No cross-device sync requirement, no
// versioned schema needed (a corrupt or unknown shape falls back to defaults
// without user-visible loss). IDB envelope overhead would dwarf the payload.
// Pre-MVP-v1 versions of this slice persisted extra fields (copilotOpen /
// copilotSize / copilotPosition / sidebarTab / bottomPanelOpen / bottomPanelTab)
// that were dropped in commit fd7691b2 along with the VS Code-style shell.
// `loadLayoutFromStorage` whitelists the surviving keys so legacy zombie fields
// from older LS payloads are dropped on first read instead of looping back to
// disk through `saveLayoutToStorage`.
function loadLayoutFromStorage(): LayoutState {
  try {
    const stored = safeGetItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<LayoutState> & Record<string, unknown>;
      return {
        primaryView: parsed.primaryView === '3d' ? '3d' : LAYOUT_DEFAULTS.primaryView,
        splitRatio: typeof parsed.splitRatio === 'number'
          ? Math.max(0.15, Math.min(0.85, parsed.splitRatio))
          : LAYOUT_DEFAULTS.splitRatio,
      };
    }
  } catch {
    // Ignore JSON.parse errors
  }
  return { ...LAYOUT_DEFAULTS };
}

function saveLayoutToStorage(state: LayoutState) {
  safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

const initialState: LayoutState = loadLayoutFromStorage();

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    setPrimaryView(state, action: PayloadAction<'2d' | '3d'>) {
      state.primaryView = action.payload;
      saveLayoutToStorage(state);
    },

    swapViews(state) {
      state.primaryView = state.primaryView === '2d' ? '3d' : '2d';
      saveLayoutToStorage(state);
    },

    setSplitRatio(state, action: PayloadAction<number>) {
      state.splitRatio = Math.max(0.15, Math.min(0.85, action.payload));
      saveLayoutToStorage(state);
    },

    resetLayout(state) {
      Object.assign(state, LAYOUT_DEFAULTS);
      saveLayoutToStorage(state);
    },
  },
});

export const {
  setPrimaryView,
  swapViews,
  setSplitRatio,
  resetLayout,
} = layoutSlice.actions;

export default layoutSlice.reducer;

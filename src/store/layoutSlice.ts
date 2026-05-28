import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export interface LayoutState {
  /** 2D/3D view order — which is on the left in split mode */
  primaryView: '2d' | '3d';
  /** Split ratio when in split mode */
  splitRatio: number;
}

const STORAGE_KEY = 'openclo-layout';

const LAYOUT_DEFAULTS: LayoutState = {
  primaryView: '2d',
  splitRatio: 0.5,
};

function loadLayoutFromStorage(): LayoutState {
  try {
    const stored = safeGetItem(STORAGE_KEY);
    if (stored) {
      return { ...LAYOUT_DEFAULTS, ...JSON.parse(stored) };
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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type BottomTab = 'copilot' | 'problems' | 'output' | 'nesting-preview' | 'timeline' | 'inspector' | 'poms';

export interface LayoutState {
  /** Where the copilot panel lives */
  copilotPosition: 'bottom' | 'right' | 'left';
  /** Whether copilot is open */
  copilotOpen: boolean;
  /** Copilot panel size (height for bottom, width for left/right) in px */
  copilotSize: number;
  /** Active tab in the sidebar panel */
  sidebarTab: 'chat' | 'properties';
  /** 2D/3D view order — which is on the left in split mode */
  primaryView: '2d' | '3d';
  /** Split ratio when in split mode */
  splitRatio: number;
  /** Whether the bottom panel is open */
  bottomPanelOpen: boolean;
  /** Active tab in the bottom panel */
  bottomPanelTab: BottomTab;
}

const STORAGE_KEY = 'openclo-layout';

const LAYOUT_DEFAULTS: LayoutState = {
  copilotPosition: 'right',
  copilotOpen: false,
  copilotSize: 340,
  sidebarTab: 'chat',
  primaryView: '2d',
  splitRatio: 0.5,
  bottomPanelOpen: false,
  bottomPanelTab: 'problems',
};

// Load from localStorage, merging with defaults to handle new fields
function loadLayoutFromStorage(): LayoutState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...LAYOUT_DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore errors
  }
  return { ...LAYOUT_DEFAULTS };
}

// Save to localStorage
function saveLayoutToStorage(state: LayoutState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore errors
  }
}

const initialState: LayoutState = loadLayoutFromStorage();

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    setCopilotPosition(state, action: PayloadAction<'bottom' | 'right' | 'left'>) {
      state.copilotPosition = action.payload;
      // Adjust size based on position
      if (action.payload === 'bottom') {
        state.copilotSize = Math.min(state.copilotSize, 300); // Max height for bottom
      } else {
        state.copilotSize = Math.max(state.copilotSize, 280); // Min width for sides
      }
      saveLayoutToStorage(state);
    },
    
    setCopilotOpen(state, action: PayloadAction<boolean>) {
      state.copilotOpen = action.payload;
      saveLayoutToStorage(state);
    },
    
    toggleCopilot(state) {
      state.copilotOpen = !state.copilotOpen;
      saveLayoutToStorage(state);
    },
    
    setCopilotSize(state, action: PayloadAction<number>) {
      const { copilotPosition } = state;
      
      if (copilotPosition === 'bottom') {
        // Height constraints for bottom panel
        state.copilotSize = Math.max(100, Math.min(action.payload, window.innerHeight * 0.6));
      } else {
        // Width constraints for side panels
        state.copilotSize = Math.max(280, Math.min(action.payload, window.innerWidth * 0.6));
      }
      saveLayoutToStorage(state);
    },
    
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
    
    cycleCopilotPosition(state) {
      // Cycle: right → bottom → left → right
      const cycle: Record<string, 'bottom' | 'right' | 'left'> = {
        right: 'bottom',
        bottom: 'left',
        left: 'right',
      };
      
      const newPosition = cycle[state.copilotPosition];
      state.copilotPosition = newPosition;
      
      // Adjust size based on new position
      if (newPosition === 'bottom') {
        state.copilotSize = Math.min(state.copilotSize, 300);
      } else {
        state.copilotSize = Math.max(state.copilotSize, 280);
      }
      
      saveLayoutToStorage(state);
    },
    
    setSidebarTab(state, action: PayloadAction<'chat' | 'properties'>) {
      state.sidebarTab = action.payload;
      saveLayoutToStorage(state);
    },

    setBottomPanelOpen(state, action: PayloadAction<boolean>) {
      state.bottomPanelOpen = action.payload;
      saveLayoutToStorage(state);
    },

    toggleBottomPanel(state) {
      state.bottomPanelOpen = !state.bottomPanelOpen;
      saveLayoutToStorage(state);
    },

    setBottomPanelTab(state, action: PayloadAction<BottomTab>) {
      state.bottomPanelTab = action.payload;
      if (!state.bottomPanelOpen) {
        state.bottomPanelOpen = true;
      }
      saveLayoutToStorage(state);
    },

    resetLayout(state) {
      Object.assign(state, LAYOUT_DEFAULTS);
      saveLayoutToStorage(state);
    },
  },
});

export const {
  setCopilotPosition,
  setCopilotOpen,
  toggleCopilot,
  setCopilotSize,
  setPrimaryView,
  swapViews,
  setSplitRatio,
  cycleCopilotPosition,
  setSidebarTab,
  setBottomPanelOpen,
  toggleBottomPanel,
  setBottomPanelTab,
  resetLayout,
} = layoutSlice.actions;

export default layoutSlice.reducer;
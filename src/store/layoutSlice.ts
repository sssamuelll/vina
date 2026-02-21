import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface LayoutState {
  /** Where the copilot panel lives */
  copilotPosition: 'bottom' | 'right' | 'left';
  /** Whether copilot is open */
  copilotOpen: boolean;
  /** Copilot panel size (height for bottom, width for left/right) in px */
  copilotSize: number;
  /** 2D/3D view order — which is on the left in split mode */
  primaryView: '2d' | '3d';
  /** Split ratio when in split mode */
  splitRatio: number;
}

const STORAGE_KEY = 'openclo-layout';

// Load from localStorage
function loadLayoutFromStorage(): LayoutState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  
  // Default layout
  return {
    copilotPosition: 'right',
    copilotOpen: true,
    copilotSize: 340,
    primaryView: '2d',
    splitRatio: 0.5,
  };
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
    
    resetLayout(state) {
      Object.assign(state, {
        copilotPosition: 'right',
        copilotOpen: true,
        copilotSize: 340,
        primaryView: '2d',
        splitRatio: 0.5,
      });
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
  resetLayout,
} = layoutSlice.actions;

export default layoutSlice.reducer;
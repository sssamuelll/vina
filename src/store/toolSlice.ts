/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';

interface ToolState {
  activeTool2D: string;     // tool id
  activeTool3D: string;     // tool id
  toolOptions: Record<string, Record<string, any>>; // toolId → optionId → value
  recentTools: string[];    // last 5 used tools
  optionsPanelCollapsed: boolean; // true = tool options bar hidden (toggle via re-click)
}

const initialState: ToolState = {
  activeTool2D: 'select',
  activeTool3D: 'camera',
  toolOptions: {},
  recentTools: [],
  optionsPanelCollapsed: false,
};

const toolSlice = createSlice({
  name: 'tools',
  initialState,
  reducers: {
    setActiveTool2D(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      const prevTool = state.activeTool2D;
      if (prevTool === toolId) {
        // Re-click same tool → toggle options panel
        state.optionsPanelCollapsed = !state.optionsPanelCollapsed;
      } else {
        state.activeTool2D = toolId;
        state.optionsPanelCollapsed = false; // always show when switching tools
        state.recentTools = [toolId, ...state.recentTools.filter(id => id !== toolId)].slice(0, 5);
      }
    },

    setActiveTool3D(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      const prevTool = state.activeTool3D;
      if (prevTool === toolId) {
        // Re-click same tool → toggle options panel
        state.optionsPanelCollapsed = !state.optionsPanelCollapsed;
      } else {
        state.activeTool3D = toolId;
        state.optionsPanelCollapsed = false; // always show when switching tools
        state.recentTools = [toolId, ...state.recentTools.filter(id => id !== toolId)].slice(0, 5);
      }
    },
    
    setToolOption(state, action: PayloadAction<{ toolId: string; optionId: string; value: any }>) {
      const { toolId, optionId, value } = action.payload;
      if (!state.toolOptions[toolId]) {
        state.toolOptions[toolId] = {};
      }
      state.toolOptions[toolId][optionId] = value;
    },
    
    resetToolOptions(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      delete state.toolOptions[toolId];
    },
    
    resetAllToolOptions(state) {
      state.toolOptions = {};
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  setActiveTool2D,
  setActiveTool3D,
  setToolOption,
  resetToolOptions,
  resetAllToolOptions,
} = toolSlice.actions;

export default toolSlice.reducer;
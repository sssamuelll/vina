import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ToolState {
  activeTool2D: string;     // tool id
  activeTool3D: string;     // tool id
  toolOptions: Record<string, Record<string, any>>; // toolId → optionId → value
  recentTools: string[];    // last 5 used tools
}

const initialState: ToolState = {
  activeTool2D: 'select',
  activeTool3D: 'camera',
  toolOptions: {},
  recentTools: [],
};

const toolSlice = createSlice({
  name: 'tools',
  initialState,
  reducers: {
    setActiveTool2D(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      const prevTool = state.activeTool2D;
      state.activeTool2D = toolId;
      
      // Update recent tools list
      if (prevTool !== toolId) {
        state.recentTools = [toolId, ...state.recentTools.filter(id => id !== toolId)].slice(0, 5);
      }
    },
    
    setActiveTool3D(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      const prevTool = state.activeTool3D;
      state.activeTool3D = toolId;
      
      // Update recent tools list
      if (prevTool !== toolId) {
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
});

export const {
  setActiveTool2D,
  setActiveTool3D,
  setToolOption,
  resetToolOptions,
  resetAllToolOptions,
} = toolSlice.actions;

export default toolSlice.reducer;
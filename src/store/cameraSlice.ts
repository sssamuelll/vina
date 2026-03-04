import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ViewPreset =
  | 'front' | 'back'
  | 'left' | 'right'
  | 'top' | 'bottom'
  | 'threeQuarterLeft' | 'threeQuarterRight';

interface CameraState {
  pendingPreset: ViewPreset | null;
  pendingFocusPieceId: string | null;
}

const initialState: CameraState = {
  pendingPreset: null,
  pendingFocusPieceId: null,
};

const cameraSlice = createSlice({
  name: 'camera',
  initialState,
  reducers: {
    setCameraPreset(state, action: PayloadAction<ViewPreset>) {
      state.pendingPreset = action.payload;
      state.pendingFocusPieceId = null;
    },
    focusOnPiece(state, action: PayloadAction<string>) {
      state.pendingFocusPieceId = action.payload;
      state.pendingPreset = null;
    },
    clearCameraRequest(state) {
      state.pendingPreset = null;
      state.pendingFocusPieceId = null;
    },
  },
});

export const { setCameraPreset, focusOnPiece, clearCameraRequest } = cameraSlice.actions;
export default cameraSlice.reducer;

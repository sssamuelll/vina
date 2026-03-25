import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';

export type TapeType = 'circumference' | 'linear';

export interface AvatarTape {
  id: string;
  type: TapeType;
  /** Y-height for circumference tapes */
  height?: number;
  /** Two world-space points for linear tapes */
  pointA?: [number, number, number];
  pointB?: [number, number, number];
  /** Computed measurement in mm */
  measurement: number;
  label: string;
  color: string;
  visible: boolean;
}

interface AvatarTapeState {
  tapes: AvatarTape[];
  /** Tape currently being created (pending second click for linear) */
  pendingTape: Partial<AvatarTape> | null;
}

const initialState: AvatarTapeState = {
  tapes: [],
  pendingTape: null,
};

const avatarTapeSlice = createSlice({
  name: 'avatarTape',
  initialState,
  reducers: {
    addTape(state, action: PayloadAction<AvatarTape>) {
      state.tapes.push(action.payload);
      state.pendingTape = null;
    },
    removeTape(state, action: PayloadAction<string>) {
      state.tapes = state.tapes.filter(t => t.id !== action.payload);
    },
    updateTape(state, action: PayloadAction<Partial<AvatarTape> & { id: string }>) {
      const tape = state.tapes.find(t => t.id === action.payload.id);
      if (tape) Object.assign(tape, action.payload);
    },
    toggleTapeVisibility(state, action: PayloadAction<string>) {
      const tape = state.tapes.find(t => t.id === action.payload);
      if (tape) tape.visible = !tape.visible;
    },
    setPendingTape(state, action: PayloadAction<Partial<AvatarTape> | null>) {
      state.pendingTape = action.payload;
    },
    clearAllTapes(state) {
      state.tapes = [];
      state.pendingTape = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  addTape, removeTape, updateTape, toggleTapeVisibility,
  setPendingTape, clearAllTapes,
} = avatarTapeSlice.actions;

export default avatarTapeSlice.reducer;

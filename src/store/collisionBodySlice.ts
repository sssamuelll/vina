import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  CollisionBody,
  CollisionBodyTransform,
  CollisionBodyCollision,
  CollisionBodyAnimation,
} from '../types/collisionBody';
import { NEW_PROJECT } from './actions';

export interface CollisionBodyState {
  bodies: CollisionBody[];
  selectedBodyId: string | null;
}

const initialState: CollisionBodyState = {
  bodies: [],
  selectedBodyId: null,
};

const collisionBodySlice = createSlice({
  name: 'collisionBody',
  initialState,
  reducers: {
    addCollisionBody(state, action: PayloadAction<CollisionBody>) {
      state.bodies.push(action.payload);
    },

    removeCollisionBody(state, action: PayloadAction<string>) {
      state.bodies = state.bodies.filter((b) => b.id !== action.payload);
      if (state.selectedBodyId === action.payload) {
        state.selectedBodyId = null;
      }
    },

    updateCollisionBodyTransform(
      state,
      action: PayloadAction<{ id: string; transform: Partial<CollisionBodyTransform> }>
    ) {
      const body = state.bodies.find((b) => b.id === action.payload.id);
      if (body) {
        Object.assign(body.transform, action.payload.transform);
      }
    },

    updateCollisionBodyCollision(
      state,
      action: PayloadAction<{ id: string; collision: Partial<CollisionBodyCollision> }>
    ) {
      const body = state.bodies.find((b) => b.id === action.payload.id);
      if (body) {
        const changes = { ...action.payload.collision };
        if (changes.friction !== undefined) {
          changes.friction = Math.max(0, Math.min(1, changes.friction));
        }
        if (changes.offset !== undefined) {
          changes.offset = Math.max(0, Math.min(0.1, changes.offset));
        }
        Object.assign(body.collision, changes);
      }
    },

    setCollisionBodyName(state, action: PayloadAction<{ id: string; name: string }>) {
      const body = state.bodies.find((b) => b.id === action.payload.id);
      if (body) {
        body.name = action.payload.name;
      }
    },

    setCollisionBodyVisibility(state, action: PayloadAction<{ id: string; visible: boolean }>) {
      const body = state.bodies.find((b) => b.id === action.payload.id);
      if (body) {
        body.visible = action.payload.visible;
      }
    },

    selectCollisionBody(state, action: PayloadAction<string | null>) {
      state.selectedBodyId = action.payload;
    },

    setAnimationState(
      state,
      action: PayloadAction<{ id: string; animation: Partial<CollisionBodyAnimation> }>
    ) {
      const body = state.bodies.find((b) => b.id === action.payload.id);
      if (body) {
        Object.assign(body.animation, action.payload.animation);
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
  },
});

export const {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyTransform,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
  setAnimationState,
} = collisionBodySlice.actions;

export default collisionBodySlice.reducer;

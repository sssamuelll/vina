import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AvatarProfile, loadProfiles, saveProfile as persistProfile, deleteProfile as removeProfile } from '../utils/avatar/avatarLibrary';

export interface JointRotation {
  x: number;  // degrees
  y: number;
  z: number;
}

export interface PoseState {
  joints: Record<string, JointRotation>;
  activePreset: string | null;
}

export interface AvatarState {
  pose: PoseState;
  poseEditorOpen: boolean;
  avatarProfiles: AvatarProfile[];
  activeProfileId: string | null;
}

export const EDITABLE_JOINTS = [
  'Spine', 'Spine1', 'Spine2',
  'Neck', 'Head',
  'LeftShoulder', 'RightShoulder',
  'LeftArm', 'RightArm',
  'LeftForeArm', 'RightForeArm',
  'LeftUpLeg', 'RightUpLeg',
  'LeftLeg', 'RightLeg',
] as const;

export type EditableJoint = typeof EDITABLE_JOINTS[number];

export const POSE_PRESETS: Record<string, Record<string, JointRotation>> = {
  'A-pose': {
    LeftArm: { x: 0, y: 10, z: -75 },
    RightArm: { x: 0, y: -10, z: 75 },
    LeftShoulder: { x: 0, y: 0, z: -10 },
    RightShoulder: { x: 0, y: 0, z: 10 },
  },
  'T-pose': {},
  'Relaxed': {
    LeftArm: { x: 0, y: 0, z: -60 },
    RightArm: { x: 0, y: 0, z: 60 },
    LeftUpLeg: { x: 5, y: 0, z: 0 },
    RightUpLeg: { x: 5, y: 0, z: 0 },
  },
  'Arms Forward': {
    LeftArm: { x: 0, y: 90, z: 0 },
    RightArm: { x: 0, y: -90, z: 0 },
  },
  'Sitting': {
    LeftUpLeg: { x: 90, y: 0, z: 0 },
    RightUpLeg: { x: 90, y: 0, z: 0 },
    LeftLeg: { x: -90, y: 0, z: 0 },
    RightLeg: { x: -90, y: 0, z: 0 },
  },
};

const MIRROR_MAP: Record<string, string> = {
  LeftShoulder: 'RightShoulder',
  RightShoulder: 'LeftShoulder',
  LeftArm: 'RightArm',
  RightArm: 'LeftArm',
  LeftForeArm: 'RightForeArm',
  RightForeArm: 'LeftForeArm',
  LeftUpLeg: 'RightUpLeg',
  RightUpLeg: 'LeftUpLeg',
  LeftLeg: 'RightLeg',
  RightLeg: 'LeftLeg',
};

const initialState: AvatarState = {
  pose: {
    joints: { ...POSE_PRESETS['A-pose'] },
    activePreset: 'A-pose',
  },
  poseEditorOpen: false,
  avatarProfiles: [],
  activeProfileId: null,
};

const avatarSlice = createSlice({
  name: 'avatar',
  initialState,
  reducers: {
    setJointRotation(state, action: PayloadAction<{ joint: string; rotation: JointRotation }>) {
      state.pose.joints[action.payload.joint] = action.payload.rotation;
      state.pose.activePreset = null;
    },
    setPreset(state, action: PayloadAction<string>) {
      const preset = POSE_PRESETS[action.payload];
      if (preset !== undefined) {
        state.pose.joints = { ...preset };
        state.pose.activePreset = action.payload;
      }
    },
    resetPose(state) {
      state.pose.joints = {};
      state.pose.activePreset = null;
    },
    togglePoseEditor(state) {
      state.poseEditorOpen = !state.poseEditorOpen;
    },
    // ─── Profile management ───
    loadProfilesFromStorage(state) {
      state.avatarProfiles = loadProfiles();
    },
    setActiveProfile(state, action: PayloadAction<string | null>) {
      state.activeProfileId = action.payload;
    },
    addProfile(state, action: PayloadAction<AvatarProfile>) {
      persistProfile(action.payload);
      state.avatarProfiles = loadProfiles();
    },
    updateProfile(state, action: PayloadAction<AvatarProfile>) {
      persistProfile(action.payload);
      state.avatarProfiles = loadProfiles();
    },
    deleteProfile(state, action: PayloadAction<string>) {
      removeProfile(action.payload);
      state.avatarProfiles = loadProfiles();
      if (state.activeProfileId === action.payload) {
        state.activeProfileId = null;
      }
    },

    mirrorJoint(state, action: PayloadAction<string>) {
      const joint = action.payload;
      const mirror = MIRROR_MAP[joint];
      if (!mirror) return;
      const src = state.pose.joints[joint];
      if (src) {
        // Mirror Z axis (negate it for left↔right symmetry)
        state.pose.joints[mirror] = { x: src.x, y: src.y, z: -src.z };
      } else {
        delete state.pose.joints[mirror];
      }
      state.pose.activePreset = null;
    },
  },
});

export const {
  setJointRotation, setPreset, resetPose, togglePoseEditor, mirrorJoint,
  loadProfilesFromStorage, setActiveProfile, addProfile, updateProfile, deleteProfile,
} = avatarSlice.actions;
export default avatarSlice.reducer;

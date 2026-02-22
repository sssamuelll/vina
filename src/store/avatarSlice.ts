import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AvatarProfile, loadProfiles, saveProfile as persistProfile, deleteProfile as removeProfile } from '../utils/avatar/avatarLibrary';

export interface JointRotation {
  x: number;  // degrees
  y: number;
  z: number;
}

export interface IKTarget {
  name: string;
  position: { x: number; y: number; z: number };
}

export interface IKChain {
  name: string;
  bones: string[];
  target?: IKTarget;
}

export interface PoseState {
  joints: Record<string, JointRotation>;
  activePreset: string | null;
  ikChains: IKChain[];
  ikTargets: IKTarget[];
  ikEnabled: boolean;
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

export const JOINT_CONSTRAINTS: Record<string, { 
  minX: number; maxX: number; 
  minY: number; maxY: number; 
  minZ: number; maxZ: number; 
}> = {
  // Spine joints
  Spine: { minX: -30, maxX: 30, minY: -15, maxY: 15, minZ: -15, maxZ: 15 },
  Spine1: { minX: -30, maxX: 30, minY: -15, maxY: 15, minZ: -15, maxZ: 15 },
  Spine2: { minX: -30, maxX: 30, minY: -15, maxY: 15, minZ: -15, maxZ: 15 },
  
  // Head and neck
  Neck: { minX: -60, maxX: 60, minY: -60, maxY: 60, minZ: -30, maxZ: 30 },
  Head: { minX: -30, maxX: 30, minY: -60, maxY: 60, minZ: -30, maxZ: 30 },
  
  // Left arm
  LeftShoulder: { minX: -30, maxX: 30, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  LeftArm: { minX: -90, maxX: 90, minY: -90, maxY: 90, minZ: -90, maxZ: 0 },
  LeftForeArm: { minX: -120, maxX: 0, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  
  // Right arm
  RightShoulder: { minX: -30, maxX: 30, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  RightArm: { minX: -90, maxX: 90, minY: -90, maxY: 90, minZ: 0, maxZ: 90 },
  RightForeArm: { minX: -120, maxX: 0, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  
  // Left leg
  LeftUpLeg: { minX: -90, maxX: 90, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  LeftLeg: { minX: -150, maxX: 0, minY: -15, maxY: 15, minZ: -15, maxZ: 15 },
  
  // Right leg
  RightUpLeg: { minX: -90, maxX: 90, minY: -30, maxY: 30, minZ: -30, maxZ: 30 },
  RightLeg: { minX: -150, maxX: 0, minY: -15, maxY: 15, minZ: -15, maxZ: 15 },
};

export const POSE_PRESETS: Record<string, Record<string, JointRotation>> = {
  'A-pose': {
    LeftArm: { x: 27, y: 0, z: -25 },
    RightArm: { x: 27, y: 0, z: 25 },
    LeftShoulder: { x: 0, y: 0, z: -5 },
    RightShoulder: { x: 0, y: 0, z: 5 },
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

// IK chains definition
export const IK_CHAINS: IKChain[] = [
  {
    name: 'leftArm',
    bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm'],
  },
  {
    name: 'rightArm',
    bones: ['RightShoulder', 'RightArm', 'RightForeArm'],
  },
  {
    name: 'leftLeg',
    bones: ['LeftUpLeg', 'LeftLeg'],
  },
  {
    name: 'rightLeg',
    bones: ['RightUpLeg', 'RightLeg'],
  },
];

/**
 * Clamp joint rotation values within their constraints
 */
export function clampJointRotation(jointName: string, rotation: JointRotation): JointRotation {
  const constraints = JOINT_CONSTRAINTS[jointName];
  if (!constraints) return rotation;
  
  return {
    x: Math.max(constraints.minX, Math.min(constraints.maxX, rotation.x)),
    y: Math.max(constraints.minY, Math.min(constraints.maxY, rotation.y)),
    z: Math.max(constraints.minZ, Math.min(constraints.maxZ, rotation.z)),
  };
}

const initialState: AvatarState = {
  pose: {
    joints: { ...POSE_PRESETS['A-pose'] },
    activePreset: 'A-pose',
    ikChains: [...IK_CHAINS],
    ikTargets: [],
    ikEnabled: false,
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
      const clamped = clampJointRotation(action.payload.joint, action.payload.rotation);
      state.pose.joints[action.payload.joint] = clamped;
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
        const mirrored = clampJointRotation(mirror, { x: src.x, y: src.y, z: -src.z });
        state.pose.joints[mirror] = mirrored;
      } else {
        delete state.pose.joints[mirror];
      }
      state.pose.activePreset = null;
    },
    
    // ─── IK Actions ───
    toggleIK(state) {
      state.pose.ikEnabled = !state.pose.ikEnabled;
    },
    setIKTarget(state, action: PayloadAction<IKTarget>) {
      const existingIndex = state.pose.ikTargets.findIndex(t => t.name === action.payload.name);
      if (existingIndex >= 0) {
        state.pose.ikTargets[existingIndex] = action.payload;
      } else {
        state.pose.ikTargets.push(action.payload);
      }
    },
    removeIKTarget(state, action: PayloadAction<string>) {
      state.pose.ikTargets = state.pose.ikTargets.filter(t => t.name !== action.payload);
    },
    updateIKChainTarget(state, action: PayloadAction<{ chainName: string; target: IKTarget | undefined }>) {
      const chain = state.pose.ikChains.find(c => c.name === action.payload.chainName);
      if (chain) {
        chain.target = action.payload.target;
      }
    },
  },
});

export const {
  setJointRotation, setPreset, resetPose, togglePoseEditor, mirrorJoint,
  loadProfilesFromStorage, setActiveProfile, addProfile, updateProfile, deleteProfile,
  toggleIK, setIKTarget, removeIKTarget, updateIKChainTarget,
} = avatarSlice.actions;
export default avatarSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AvatarProfile, loadProfiles, saveProfile as persistProfile, deleteProfile as removeProfile } from '../utils/avatar/avatarLibrary';
import { constrainJoint, HUMAN_JOINTS } from '../utils/avatar/jointConstraints';

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
  selectedJoint: string | null;
  savedPoses: SavedPose[];
  avatarProfiles: AvatarProfile[];
  activeProfileId: string | null;
}

export const EDITABLE_JOINTS = [
  'Spine', 'Spine1', 'Spine2',
  'Neck', 'Head',
  'LeftShoulder', 'RightShoulder',
  'LeftArm', 'RightArm',
  'LeftForeArm', 'RightForeArm',
  'LeftHand', 'RightHand',
  'LeftUpLeg', 'RightUpLeg',
  'LeftLeg', 'RightLeg',
] as const;

export type EditableJoint = typeof EDITABLE_JOINTS[number];

export const JOINT_CONSTRAINTS: Record<string, { 
  minX: number; maxX: number; 
  minY: number; maxY: number; 
  minZ: number; maxZ: number; 
}> = {
  // Spine joints — each vertebral segment has limited ROM; total spine is cumulative
  Spine: { minX: -20, maxX: 20, minY: -15, maxY: 15, minZ: -10, maxZ: 10 },
  Spine1: { minX: -15, maxX: 15, minY: -10, maxY: 10, minZ: -8, maxZ: 8 },
  Spine2: { minX: -15, maxX: 15, minY: -10, maxY: 10, minZ: -8, maxZ: 8 },
  
  // Head and neck
  Neck: { minX: -40, maxX: 40, minY: -45, maxY: 45, minZ: -25, maxZ: 25 },
  Head: { minX: -20, maxX: 20, minY: -40, maxY: 40, minZ: -20, maxZ: 20 },
  
  // Left arm — EMPIRICALLY VERIFIED axis mapping (Mixamo + ZYX Euler):
  //   X(+) = raise arm up/overhead    X(-) = arm behind back / down
  //   Y(-) = arm forward (zombie)     Y(+) = limited
  //   Z(+) = abduction LEFT (away body)  Z(-) = adduction LEFT (toward body)
  // Human ROM: raise ~170°, back ~40°, forward ~90°, abduction ~80°
  LeftShoulder: { minX: -10, maxX: 15, minY: -10, maxY: 10, minZ: -5, maxZ: 15 },
  LeftArm: { minX: -40, maxX: 160, minY: -90, maxY: 20, minZ: -5, maxZ: 80 },
  LeftForeArm: { minX: 0, maxX: 145, minY: -10, maxY: 10, minZ: -5, maxZ: 5 },
  
  // Right arm — Z mirrored
  RightShoulder: { minX: -10, maxX: 15, minY: -10, maxY: 10, minZ: -15, maxZ: 5 },
  RightArm: { minX: -40, maxX: 160, minY: -20, maxY: 90, minZ: -80, maxZ: 5 },
  RightForeArm: { minX: 0, maxX: 145, minY: -10, maxY: 10, minZ: -5, maxZ: 5 },
  
  // Left leg — X: flexion(+)/extension(-), Y: internal/external rotation, Z: abduction
  // Human hip: ~120° flexion, ~20° extension, ~45° abduction, ~30° adduction
  LeftUpLeg: { minX: -20, maxX: 120, minY: -30, maxY: 30, minZ: -30, maxZ: 45 },
  LeftLeg: { minX: -140, maxX: 0, minY: -10, maxY: 10, minZ: -5, maxZ: 5 },
  
  // Right leg (mirrored)
  RightUpLeg: { minX: -20, maxX: 120, minY: -30, maxY: 30, minZ: -45, maxZ: 30 },
  RightLeg: { minX: -140, maxX: 0, minY: -10, maxY: 10, minZ: -5, maxZ: 5 },
};

export const POSE_PRESETS: Record<string, Record<string, JointRotation>> = {
  'A-pose': {
    // +X = lower arm (adduction), verified via axis discovery
    LeftArm: { x: 25, y: 0, z: 0 },
    RightArm: { x: 25, y: 0, z: 0 },
  },
  'T-pose': {},
  'Relaxed': {
    // +X = lower arm significantly
    LeftArm: { x: 60, y: 0, z: 0 },
    RightArm: { x: 60, y: 0, z: 0 },
    LeftUpLeg: { x: 5, y: 0, z: 0 },
    RightUpLeg: { x: 5, y: 0, z: 0 },
  },
  'Arms Forward': {
    // -Z = forward for Left, +Z = forward for Right (from discovery)
    // Actually: LeftArm +Z = slight fwd, -Z = very backward. So +Z for forward.
    LeftArm: { x: 0, y: 0, z: 45 },
    RightArm: { x: 0, y: 0, z: -45 },
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
 * Clamp joint rotation using swing-twist biomechanical constraints.
 * Falls back to simple per-axis clamp for joints without anatomical definition.
 */
export function clampJointRotation(jointName: string, rotation: JointRotation): JointRotation {
  // Use anatomical joint constraints (hinge/ball/limited)
  if (HUMAN_JOINTS[jointName]) {
    return constrainJoint(jointName, rotation);
  }
  
  // Legacy fallback for joints without anatomical constraints
  const constraints = JOINT_CONSTRAINTS[jointName];
  if (!constraints) return rotation;
  
  return {
    x: Math.max(constraints.minX, Math.min(constraints.maxX, rotation.x)),
    y: Math.max(constraints.minY, Math.min(constraints.maxY, rotation.y)),
    z: Math.max(constraints.minZ, Math.min(constraints.maxZ, rotation.z)),
  };
}

export const MIRROR_MAP_EXPORT = MIRROR_MAP;

// ─── Custom Pose Storage (localStorage) ───
export interface SavedPose {
  id: string;
  name: string;
  joints: Record<string, JointRotation>;
  createdAt: number;
}

const POSES_STORAGE_KEY = 'openclo-saved-poses';

function loadSavedPoses(): SavedPose[] {
  try {
    const raw = localStorage.getItem(POSES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistPoses(poses: SavedPose[]) {
  localStorage.setItem(POSES_STORAGE_KEY, JSON.stringify(poses));
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
  selectedJoint: null,
  savedPoses: [],
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
        return;
      }
      // Check saved custom poses
      const custom = state.savedPoses.find(p => p.id === action.payload);
      if (custom) {
        state.pose.joints = { ...custom.joints };
        state.pose.activePreset = custom.id;
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

    selectJoint(state, action: PayloadAction<string | null>) {
      state.selectedJoint = action.payload;
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
    
    // ─── Custom Pose Management ───
    loadSavedPosesFromStorage(state) {
      state.savedPoses = loadSavedPoses();
    },
    savePose(state, action: PayloadAction<string>) {
      const name = action.payload;
      const now = Date.now();
      const pose: SavedPose = {
        id: `pose-${now}`,
        name,
        joints: { ...state.pose.joints },
        createdAt: now,
      };
      const poses = loadSavedPoses();
      poses.push(pose);
      persistPoses(poses);
      state.savedPoses = poses;
      state.pose.activePreset = pose.id;
    },
    deleteSavedPose(state, action: PayloadAction<string>) {
      const poses = loadSavedPoses().filter(p => p.id !== action.payload);
      persistPoses(poses);
      state.savedPoses = poses;
      if (state.pose.activePreset === action.payload) {
        state.pose.activePreset = null;
      }
    },
    overwriteSavedPose(state, action: PayloadAction<string>) {
      const id = action.payload;
      const poses = loadSavedPoses();
      const idx = poses.findIndex(p => p.id === id);
      if (idx >= 0) {
        poses[idx].joints = { ...state.pose.joints };
        poses[idx].createdAt = Date.now();
        persistPoses(poses);
        state.savedPoses = poses;
      }
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
  setJointRotation, setPreset, resetPose, togglePoseEditor, selectJoint, mirrorJoint,
  loadProfilesFromStorage, setActiveProfile, addProfile, updateProfile, deleteProfile,
  loadSavedPosesFromStorage, savePose, deleteSavedPose, overwriteSavedPose,
  toggleIK, setIKTarget, removeIKTarget, updateIKChainTarget,
} = avatarSlice.actions;
export default avatarSlice.reducer;

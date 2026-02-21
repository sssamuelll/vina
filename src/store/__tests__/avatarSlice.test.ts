import { describe, it, expect } from 'vitest';
import avatarReducer, {
  setJointRotation,
  setPreset,
  resetPose,
  togglePoseEditor,
  mirrorJoint,
  POSE_PRESETS,
  type AvatarState,
} from '../avatarSlice';

function getInitialState(): AvatarState {
  return avatarReducer(undefined, { type: '@@INIT' });
}

describe('avatarSlice', () => {
  it('initializes with A-pose preset', () => {
    const state = getInitialState();
    expect(state.pose.activePreset).toBe('A-pose');
    expect(state.pose.joints.LeftArm).toEqual({ x: 0, y: 0, z: -45 });
    expect(state.pose.joints.RightArm).toEqual({ x: 0, y: 0, z: 45 });
  });

  it('setJointRotation updates a specific joint', () => {
    const state = avatarReducer(
      getInitialState(),
      setJointRotation({ joint: 'Neck', rotation: { x: 10, y: 5, z: 0 } })
    );
    expect(state.pose.joints.Neck).toEqual({ x: 10, y: 5, z: 0 });
    expect(state.pose.activePreset).toBeNull();
  });

  it('setPreset applies all preset joints', () => {
    const state = avatarReducer(getInitialState(), setPreset('Sitting'));
    expect(state.pose.activePreset).toBe('Sitting');
    expect(state.pose.joints).toEqual(POSE_PRESETS['Sitting']);
  });

  it('setPreset T-pose clears joints', () => {
    const state = avatarReducer(getInitialState(), setPreset('T-pose'));
    expect(state.pose.joints).toEqual({});
    expect(state.pose.activePreset).toBe('T-pose');
  });

  it('resetPose clears all rotations', () => {
    let state = avatarReducer(getInitialState(), setPreset('Sitting'));
    state = avatarReducer(state, resetPose());
    expect(state.pose.joints).toEqual({});
    expect(state.pose.activePreset).toBeNull();
  });

  it('A-pose preset has arms at 45° Z rotation', () => {
    expect(POSE_PRESETS['A-pose'].LeftArm?.z).toBe(-45);
    expect(POSE_PRESETS['A-pose'].RightArm?.z).toBe(45);
  });

  it('togglePoseEditor toggles', () => {
    let state = getInitialState();
    expect(state.poseEditorOpen).toBe(false);
    state = avatarReducer(state, togglePoseEditor());
    expect(state.poseEditorOpen).toBe(true);
    state = avatarReducer(state, togglePoseEditor());
    expect(state.poseEditorOpen).toBe(false);
  });

  it('mirrorJoint copies left to right with negated Z', () => {
    let state = avatarReducer(
      getInitialState(),
      setJointRotation({ joint: 'LeftArm', rotation: { x: 45, y: 10, z: 15 } })
    );
    state = avatarReducer(state, mirrorJoint('LeftArm'));
    expect(state.pose.joints.RightArm).toEqual({ x: 45, y: 10, z: -15 });
  });

  it('mirrorJoint copies right to left with negated Z', () => {
    let state = avatarReducer(
      getInitialState(),
      setJointRotation({ joint: 'RightLeg', rotation: { x: -30, y: 0, z: 5 } })
    );
    state = avatarReducer(state, mirrorJoint('RightLeg'));
    expect(state.pose.joints.LeftLeg).toEqual({ x: -30, y: 0, z: -5 });
  });

  it('mirrorJoint does nothing for non-mirrored joints', () => {
    const state = getInitialState();
    const next = avatarReducer(state, mirrorJoint('Spine'));
    expect(next).toEqual(state);
  });

  it('ignores unknown preset names', () => {
    const state = getInitialState();
    const next = avatarReducer(state, setPreset('NonExistent'));
    expect(next).toEqual(state);
  });
});

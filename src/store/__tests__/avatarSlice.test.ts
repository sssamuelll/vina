import { describe, it, expect } from 'vitest';
import avatarReducer, {
  setJointRotation,
  setPreset,
  resetPose,
  togglePoseEditor,
  mirrorJoint,
  presetResuelta,
  savePose,
  type AvatarState,
} from '../avatarSlice';
import { NEW_PROJECT } from '../actions';

function getInitialState(): AvatarState {
  return avatarReducer(undefined, { type: '@@INIT' });
}

describe('avatarSlice', () => {
  it('initializes with A-pose preset, pendiente de resolver contra el esqueleto que cargue', () => {
    const state = getInitialState();
    expect(state.pose.activePreset).toBe('A-pose');
    expect(state.pose.porResolver).toBe(true);
    expect(state.pose.joints).toEqual({});
  });

  it('setJointRotation updates a specific joint', () => {
    const state = avatarReducer(
      getInitialState(),
      setJointRotation({ joint: 'Neck', rotation: { x: 10, y: 5, z: 0 } })
    );
    expect(state.pose.joints.Neck).toEqual({ x: 10, y: 5, z: 0 });
    expect(state.pose.activePreset).toBeNull();
  });

  it('setPreset deja la preset por resolver: las rotaciones dependen del esqueleto', () => {
    const editada = avatarReducer(getInitialState(), setJointRotation({ joint: 'Neck', rotation: { x: 10, y: 0, z: 0 } }));
    const state = avatarReducer(editada, setPreset('Sitting'));
    expect(state.pose.activePreset).toBe('Sitting');
    expect(state.pose.porResolver).toBe(true);
    expect(state.pose.joints).toEqual({});
  });

  it('presetResuelta pone las rotaciones de la preset que sigue activa', () => {
    const joints = { LeftUpLeg: { x: 88.1, y: 1.2, z: -3 } };
    const state = avatarReducer(avatarReducer(getInitialState(), setPreset('Sitting')), presetResuelta({ nombre: 'Sitting', joints }));
    expect(state.pose.joints).toEqual(joints);
    expect(state.pose.porResolver).toBe(false);
    expect(state.pose.activePreset).toBe('Sitting');
  });

  it('presetResuelta ignora la resolución de una preset que ya no está activa', () => {
    let state = avatarReducer(getInitialState(), setPreset('Sitting'));
    state = avatarReducer(state, setPreset('T-pose'));
    const next = avatarReducer(state, presetResuelta({ nombre: 'Sitting', joints: { LeftUpLeg: { x: 90, y: 0, z: 0 } } }));
    expect(next).toEqual(state);
  });

  it('editar una articulación deja de esperar la resolución', () => {
    const state = avatarReducer(getInitialState(), setJointRotation({ joint: 'Neck', rotation: { x: 10, y: 0, z: 0 } }));
    expect(state.pose.porResolver).toBe(false);
  });

  it('una pose guardada se aplica tal cual, sin resolver', () => {
    let state = avatarReducer(getInitialState(), setJointRotation({ joint: 'Neck', rotation: { x: 12, y: 0, z: 0 } }));
    state = avatarReducer(state, savePose('Mía'));
    const id = state.savedPoses[state.savedPoses.length - 1].id;
    state = avatarReducer(state, resetPose());
    state = avatarReducer(state, setPreset(id));
    expect(state.pose.joints.Neck).toEqual({ x: 12, y: 0, z: 0 });
    expect(state.pose.porResolver).toBe(false);
  });

  it('Nuevo proyecto vuelve a la A-pose por resolver', () => {
    let state = avatarReducer(getInitialState(), setPreset('Sitting'));
    state = avatarReducer(state, presetResuelta({ nombre: 'Sitting', joints: { LeftUpLeg: { x: 90, y: 0, z: 0 } } }));
    state = avatarReducer(state, NEW_PROJECT());
    expect(state.pose).toMatchObject({ activePreset: 'A-pose', porResolver: true, joints: {} });
  });

  it('resetPose clears all rotations', () => {
    let state = avatarReducer(getInitialState(), setPreset('Sitting'));
    state = avatarReducer(state, resetPose());
    expect(state.pose.joints).toEqual({});
    expect(state.pose.activePreset).toBeNull();
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
      setJointRotation({ joint: 'LeftArm', rotation: { x: 45, y: 10, z: -15 } })
    );
    state = avatarReducer(state, mirrorJoint('LeftArm'));
    expect(state.pose.joints.RightArm).toEqual({ x: 45, y: 10, z: 15 });
  });

  it('mirrorJoint copies right to left with negated Z (hinge clamped)', () => {
    let state = avatarReducer(
      getInitialState(),
      setJointRotation({ joint: 'RightLeg', rotation: { x: -30, y: 0, z: 5 } })
    );
    state = avatarReducer(state, mirrorJoint('RightLeg'));
    // LeftLeg is a hinge joint (X-axis only) — Y and Z are clamped to 0
    expect(state.pose.joints.LeftLeg).toEqual({ x: -30, y: 0, z: 0 });
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
